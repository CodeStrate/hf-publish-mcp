import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "../logger";
import { getHFToken } from "../client";
import { readdir, writeFile } from "node:fs/promises";
import { persistJobs } from "./job-store";
import { type MergeJob } from "../types/job-schemas";
import { createRepo, uploadFiles } from "@huggingface/hub";
import { LORA_UNSLOTH_PYTHON_SCRIPT, LORA_PEFT_PYTHON_SCRIPT } from "./constants";

async function spawnWorkerStream(job:MergeJob, cmd: string[]): Promise<number> {
    const worker = Bun.spawn(cmd, {
        stderr: "pipe",
        stdout: "pipe",
        env: {...process.env, HF_TOKEN: getHFToken()},
    })

    // read stream
    //Readable Stream int 8 - standard
    let output = "";
    const collect = async (stream: ReadableStream<Uint8Array>) => {
        const reader = stream.getReader();
        const streamDecoder = new TextDecoder();
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            const chunk = streamDecoder.decode(value);
            output += chunk;

            const lines = output.split("\n");
            if (lines.length > 50) output = lines.slice(-50).join("\n");
            job.logs = output;
        }
    }

    await Promise.all([collect(worker.stdout), collect(worker.stderr)]);
    await worker.exited;
    return worker.exitCode ?? 1;
}

async function runMergekitStrategy(job:MergeJob) {
    logger.info({ jobId: job.jobId, outputRepo: job.repoId }, "mergekit strategy started");
    const tempConfig = join(tmpdir(), `mergekit_${job.jobId}.yaml`);
    await writeFile(tempConfig, job.mergekitConfig as string);
    const cmd = ["uvx", "mergekit-yaml", tempConfig, job.repoId, "--hf-transfer", "--trust-remote-code"];
    logger.info({ jobId: job.jobId, cmd }, "spawning mergekit subprocess");
    const exitCode = await spawnWorkerStream(job, cmd);
    if (exitCode !== 0) throw new Error(`${job.strategy} exited with code ${exitCode}`);
    job.jobStatus = "Done";
    job.completedAt = new Date();
    persistJobs();
    logger.info({ jobId: job.jobId, outputRepo: job.repoId }, "mergekit strategy done");
}

async function runLoraFoldStrategy(job:MergeJob) {
    const token = getHFToken();
    const outputDir = join(tmpdir(), `lora_fold_${job.jobId}`);
    const scriptPath = join(tmpdir(), `lora_merge_${job.jobId}.py`);
    const useUnsloth = job.strategy === "lora_fold_unsloth";
    logger.info({ jobId: job.jobId, strategy: job.strategy, adapterSource: job.adapterSource, baseModel: job.baseModel }, "lora fold strategy started");
    const scriptToUse = useUnsloth ? LORA_UNSLOTH_PYTHON_SCRIPT : LORA_PEFT_PYTHON_SCRIPT;
    await writeFile(scriptPath, scriptToUse);

    const packages = useUnsloth ? ["--with", "unsloth"] : ["--with", "peft", "--with", "transformers"];
    const cmd = ["uvx", ...packages, "python", scriptPath, job.baseModel ?? "", job.adapterSource ?? "", outputDir, token];
    logger.info({ jobId: job.jobId, useUnsloth }, "spawning lora fold subprocess");

    const exitCode = await spawnWorkerStream(job, cmd);
    if (exitCode !== 0) throw new Error(`${job.strategy} exited with code ${exitCode}`);

    logger.info({ jobId: job.jobId }, "subprocess done, pushing to HF Hub");
    try {
        await createRepo({ repo: { name: job.repoId, type: "model" }, private: job.isPrivate, accessToken: token });
    } catch(error: any) {
        if (!error?.message?.includes("409") && !error?.message?.includes("already exist")) throw error;
    }
    const files = await readdir(outputDir);
    await uploadFiles({
        repo: { name: job.repoId, type: "model" },
        files: files.map(name => ({ path: name, content: Bun.file(join(outputDir, name)) })),
        accessToken: token,
    });
    job.outputRepoUrl = `https://huggingface.co/${job.repoId}`;
    job.jobStatus = "Done";
    job.completedAt = new Date();
    persistJobs();
    logger.info({ jobId: job.jobId, outputRepoUrl: job.outputRepoUrl }, "lora fold strategy done");
}

export {
    runLoraFoldStrategy,
    runMergekitStrategy
}