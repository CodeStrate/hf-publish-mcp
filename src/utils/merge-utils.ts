import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "../logger";
import { getHFToken } from "../client";
import { writeFile, rm } from "node:fs/promises";
import { persistJobs } from "./job-store";
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
    const tempOutput = join(tmpdir(), `mergekit_out_${job.jobId}`);
    logger.info({ jobId: job.jobId, outputRepo: job.repoId }, "mergekit strategy started");
    await writeFile(tempConfig, job.mergekitConfig as string);

    try {
        await createRepo({ repo: { name: job.repoId, type: "model" }, private: job.isPrivate, accessToken: token });
    } catch (error: any) {
        if (!error?.message?.includes("409") && !error?.message?.includes("already exist")) throw error;
    }

    const cmd = ["uvx", "mergekit-yaml", tempConfig, tempOutput, "--upload-to-hub", job.repoId, "--hf-transfer", "--trust-remote-code"];
    logger.info({ jobId: job.jobId, cmd }, "spawning mergekit subprocess");

    try {
        const exitCode = await spawnWorkerStream(job, cmd);
        if (exitCode !== 0) throw new Error(`${job.strategy} exited with code ${exitCode}`);
        job.outputRepoUrl = `https://huggingface.co/${job.repoId}`;
        job.jobStatus = "Done";
        job.completedAt = new Date();
        persistJobs();
        logger.info({ jobId: job.jobId, outputRepo: job.repoId }, "mergekit strategy done");
    } finally {
        await rm(tempConfig, { force: true }).catch(() => {});
        await rm(tempOutput, { recursive: true, force: true }).catch(() => {});
    }
}

export {
    runMergekitStrategy,
}
