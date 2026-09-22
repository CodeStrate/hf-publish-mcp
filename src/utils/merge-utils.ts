import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "../logger";
import { getHFToken } from "../client";
import { writeFile, rm } from "node:fs/promises";
import { type MergeJob } from "../types/job-schemas";
import { createRepo } from "@huggingface/hub";

async function spawnWorkerStream(job: MergeJob, cmd: string[]): Promise<number> {
    const worker = Bun.spawn(cmd, {
        stderr: "pipe",
        stdout: "pipe",
        env: { ...process.env, HF_TOKEN: getHFToken() },
    });

    const buffers = { stdout: "", stderr: "" };
    const collect = async (stream: ReadableStream<Uint8Array>, key: "stdout" | "stderr") => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffers[key] += decoder.decode(value);
            const lines = buffers[key].split("\n");
            if (lines.length > 50) buffers[key] = lines.slice(-50).join("\n");
            job.logs = buffers.stdout + (buffers.stderr ? "\n[stderr]\n" + buffers.stderr : "");
        }
    };

    await Promise.all([collect(worker.stdout, "stdout"), collect(worker.stderr, "stderr")]);
    await worker.exited;
    return worker.exitCode ?? 1;
}

async function runMergekitStrategy(job: MergeJob) {
    const token = getHFToken();
    const tempConfig = join(tmpdir(), `mergekit_${job.jobId}.yaml`);
    // merge jobs can be large so needs caching (to be cleaned up)
    const tempMergeCacheDir = join(tmpdir(), `mergekit_lora_cache_${job.jobId}`);
    logger.info({ jobId: job.jobId, outputRepo: job.repoId }, "mergekit strategy started");
    await writeFile(tempConfig, job.mergekitConfig as string);

   const cmd = [
    "uvx", "--python", "3.12", "--from", "mergekit", "mergekit-yaml",
    tempConfig, job.outputDir, "--trust-remote-code",
    "--lora-merge-cache", tempMergeCacheDir
];

    logger.info({ jobId: job.jobId, cmd }, "spawning mergekit subprocess");

    try {
        const exitCode = await spawnWorkerStream(job, cmd);
        if (exitCode !== 0) throw new Error(`${job.strategy} exited with code ${exitCode}`);
    }catch(err){
        // output dir has gone bad/corrupt, not auto cleaning it considering model hallucinations.
        throw err
    } finally {
        await rm(tempConfig, { force: true }).catch(() => {});
        await rm(tempMergeCacheDir, {recursive: true, force: true}).catch(() => {});
    }
}

export {
    runMergekitStrategy,
}
