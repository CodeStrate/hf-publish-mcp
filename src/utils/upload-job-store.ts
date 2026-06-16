import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { uploadJobs, type UploadJob } from "../types/upload-job";
import { logger } from "../logger";



const JOBS_FILE = join(homedir(), ".hf_mcp", "upload-jobs.json")

export async function persistJobs(){
    try{
        await mkdir(dirname(JOBS_FILE), {recursive: true})
        await writeFile(JOBS_FILE, JSON.stringify([...uploadJobs.entries()], null, 2))
    }catch(error){
        logger.error({error}, "Unable to create persistent disk.");
    }
}

export async function loadJobs() {
    try {
        const rawContent = await readFile(JOBS_FILE, "utf-8");
        const entries = JSON.parse(rawContent) as [string, UploadJob][];
        for (const [id, job] of entries){
            uploadJobs.set(id, {
                ...job,
                startedAt: new Date(job.startedAt),
                completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
            });
        }
        let hadStale = false;
        for (const job of uploadJobs.values()) {
            if (job.jobStatus === "Running" || job.jobStatus === "Pending") {
                job.jobStatus = "Error";
                job.error = "Upload interrupted — server restarted";
                job.completedAt = new Date();
                hadStale = true;
            }
        }
        if (hadStale) await persistJobs();

    } catch(error: any){
        if (error?.code !== "ENOENT"){
            logger.error({ error }, "Failed to load jobs from disk.");
        }
    }
}
