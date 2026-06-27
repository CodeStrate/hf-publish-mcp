import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { quantJobs, type QuantJob } from "../types/quant-job";
import { HF_MCP_DIR } from "./upload-job-store";
import { logger } from "../logger";

export const QUANT_JOBS_FILE = join(HF_MCP_DIR, "quant-jobs.json");

export function hydrateQuantJob(job: QuantJob): QuantJob {
    return {
        ...job,
        startedAt: new Date(job.startedAt),
        completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
    };
}

export async function persistQuantJobs(): Promise<void> {
    try {
        await mkdir(HF_MCP_DIR, { recursive: true });
        await writeFile(QUANT_JOBS_FILE, JSON.stringify([...quantJobs.entries()], null, 2));
    } catch (error) {
        logger.error({ error }, "Unable to persist quant jobs.");
    }
}

export async function loadQuantJobs(): Promise<void> {
    try {
        const entries = JSON.parse(await readFile(QUANT_JOBS_FILE, "utf-8")) as [string, QuantJob][];
        for (const [id, job] of entries) {
            quantJobs.set(id, hydrateQuantJob(job));
        }
        let hadStale = false;
        for (const job of quantJobs.values()) {
            if (job.jobStatus === "Queued" || job.jobStatus === "Running") {
                job.jobStatus = "Error";
                job.error = "Quant job interrupted — server restarted";
                job.completedAt = new Date();
                hadStale = true;
            }
        }
        if (hadStale) await persistQuantJobs();
    } catch (error: any) {
        if (error?.code !== "ENOENT") {
            logger.error({ error }, "Failed to load quant jobs from disk.");
        }
    }
}
