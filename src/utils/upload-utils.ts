import { logger } from "../logger";
import { type UploadJob } from "../types/job-schemas";
import { withRetry } from "./retry";
import { uploadFilesWithProgress } from "@huggingface/hub";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export async function collectFilesForUpload(directory:string): Promise<{path: string; content: Blob}[]> {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true});
    return Promise.all(entries
    .filter(entry => {
        // expand entry filter and exclude hidden dirs so non empty dir items can also be excluded from upload (.git)
        if(!entry.isFile()) return false;
        const rel = relative(directory, join(entry.parentPath, entry.name));
        return !rel.split("/").some(segment => segment.startsWith("."));
    })
    .map(async entry => {
        const absolutePath = join(entry.parentPath, entry.name)
        // Bun file is sync and lazy, helps in big model uploads by streaming and not full load shards.
        return {path: relative(directory, absolutePath), content: Bun.file(absolutePath)}
    }))
}


export async function runUpload(
    job: UploadJob,
    files: { path: string; content: Blob }[],
    repo: { type: "model" | "dataset" | "space"; name: string },
    commitMessage: string,
    accessToken: string
) {
    job.jobStatus = "Running";
    try {
        const gen = uploadFilesWithProgress({ repo, files, commitTitle: commitMessage, accessToken });
        for await (const event of gen) {
            if (event.event === "phase") {
                job.phase = event.phase;
                logger.info(`[${job.jobId}] phase: ${event.phase}`);
            } else if (event.event === "fileProgress" && event.state === "uploading") {
                job.currentFile = event.path;
            }
        }
        job.jobStatus = "Done";
        job.completedAt = new Date();
        logger.info(`[${job.jobId}] upload complete`);
    } catch (error) {
        job.jobStatus = "Error";
        job.error = error instanceof Error ? error.message : String(error);
        job.completedAt = new Date();
        logger.error({ error }, `[${job.jobId}] upload failed`);
    }
}


export async function resumeUploads(
    job: UploadJob,
    attemptFn: () => Promise<string>,
    sleepFn?: Parameters<typeof withRetry>[3], // use the params from the retry func and explicitly the 3rd index (4th param) which is sleepFn
): Promise<UploadJob> {


    const interrupted = job.jobStatus === "Running" || job.jobStatus === "Retrying";
    const hasBudget = job.maxRetries !== undefined && (job.retryCount ?? 0)< job.maxRetries;

    if (interrupted && hasBudget) {
        const remaining = job.maxRetries! - (job.retryCount ?? 0);
        await withRetry(job, remaining, attemptFn, sleepFn);
    } else if (interrupted) {
        job.jobStatus = "Error";
        job.error = "Job interrupted — no retry budget left";
        job.completedAt = new Date();
    }

    return job;
}