import { logger } from "../logger";
import { type UploadJob } from "../types/job-schemas";
import { withRetry } from "./retry";
import { uploadFilesWithProgress } from "@huggingface/hub";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { UploadParams } from "../types/util-types";

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


async function doUpload(params: UploadParams)
{       
    const {job, repo, files, commitMessage, accessToken} = params
    const gen = uploadFilesWithProgress({ repo, files, commitTitle: commitMessage, accessToken });
    for await (const event of gen) {
        if (event.event === "phase") {
            job.phase = event.phase;
            logger.info(`[${job.jobId}] phase: ${event.phase}`);
        } else if (event.event === "fileProgress" && event.state === "uploading") {
            job.currentFile = event.path;
        }
    }
}

// not packing due to compatibility and reducing complexity for agent.
export async function runUpload(
    job: UploadJob,
    files: { path: string; content: Blob }[],
    repo: { type: "model" | "dataset" | "space"; name: string },
    commitMessage: string,
    accessToken: string,
    maxRetries? : number | undefined
)   {
        const params: UploadParams = {job, repo, files, commitMessage, accessToken}
        await withRetry(job, maxRetries, () => doUpload(params)); // will also handle 0 case. 
    }

export async function resumeUploads(
    job: UploadJob,
    accessToken: string,
    sleepFn?: Parameters<typeof withRetry>[3], // use the params from the retry func and explicitly the 3rd index (4th param) which is sleepFn
): Promise<UploadJob> {

    const interrupted = job.jobStatus === "Running" || job.jobStatus === "Retrying";
    const hasBudget = job.maxRetries !== undefined && (job.retryCount ?? 0)< job.maxRetries;
    const attemptFn = async () => {
        const uploadedFiles = await collectFilesForUpload(job.localDir);
        
        const params: UploadParams = {
            job,
            files: uploadedFiles,
            repo: {type: job.repoType, name: job.repoId},
            commitMessage: job.commitMessage,
            accessToken
        }

        await doUpload(params);
    }
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