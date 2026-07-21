import { mkdir, readFile, writeFile, readdir, unlink, rename } from "node:fs/promises";
import { join } from "node:path";
import { JobSchema, type Job } from "../types/job-schemas";
import { logger } from "../logger";
import { HF_MCP_DIR, JOBS_FILE } from "./constants";

export const jobsMap = new Map<string, Job>();

const ARCHIVE_PATTERN = /^hf-mcp-jobs\.(\d{4}-\d{2}-\d{2})\.json$/;
const MAX_ACTIVE_COMPLETED = Number(process.env.HF_MCP_MAX_COMPLETED_JOBS ?? 50);

// Serializes all writes — prevents concurrent worker calls from clobbering each other
let _writeChain = Promise.resolve();

async function _writeToDisk(): Promise<void> {
    await mkdir(HF_MCP_DIR, { recursive: true });

    const active = [...jobsMap.entries()].filter(([, j]) =>
        j.jobStatus === "Pending" || j.jobStatus === "Running" || j.jobStatus === "Retrying"
    );
    const completed = [...jobsMap.entries()].filter(([, j]) =>
        j.jobStatus === "Done" || j.jobStatus === "Error"
    );

    if (completed.length > MAX_ACTIVE_COMPLETED) {
        completed.sort((a, b) => (a[1].completedAt?.getTime() ?? 0) - (b[1].completedAt?.getTime() ?? 0));
        const overflow = completed.slice(0, completed.length - MAX_ACTIVE_COMPLETED);
        const keep = completed.slice(completed.length - MAX_ACTIVE_COMPLETED);
        await appendToArchive(overflow);
        for (const [id] of overflow) jobsMap.delete(id);

        const tempFile = JOBS_FILE + ".tmp";
        await writeFile(tempFile, JSON.stringify([...active, ...keep], null, 2));
        await rename(tempFile, JOBS_FILE);
    } else {
        const tempFile = JOBS_FILE + ".tmp";
        await writeFile(tempFile, JSON.stringify([...jobsMap.entries()], null, 2));
        await rename(tempFile, JOBS_FILE);
    }
}

async function appendToArchive(entries: [string, Job][]): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const archiveFile = join(HF_MCP_DIR, `hf-mcp-jobs.${date}.json`);
    const existing: [string, Job][] = [];
    try {
        const raw = JSON.parse(await readFile(archiveFile, "utf-8")) as [string, unknown][];
        for (const [id, job] of raw) {
            try { existing.push([id, JobSchema.parse(job)]); } catch {}
        }
    } catch {}
    const merged = new Map([...existing, ...entries]);
    await writeFile(archiveFile, JSON.stringify([...merged.entries()], null, 2));
}

export function persistJobs(): void {
    _writeChain = _writeChain
        .then(() => _writeToDisk())
        .catch(err => logger.error({ err }, "Unable to persist jobs."))
        .catch(() => {}); // ensure chain always settles resolved even if logger throws
}

export async function loadJobs(): Promise<void> {
    try {
        const raw = JSON.parse(await readFile(JOBS_FILE, "utf-8")) as [string, unknown][];
        for (const [id, job] of raw) {
            try {
                jobsMap.set(id, JobSchema.parse(job));
            } catch {
                logger.warn({ id }, "Skipping job with unrecognized schema — may be from an older version.");
            }
        }
        let hadStale = false;
        for (const job of jobsMap.values()) {
            if (job.jobStatus === "Running" || job.jobStatus === "Pending" || job.jobStatus === "Retrying") {
                job.jobStatus = "Error";
                job.error = "Job interrupted — server restarted";
                job.completedAt = new Date();
                hadStale = true;
            }
        }
        if (hadStale) persistJobs();
    } catch (error: any) {
        if (error?.code !== "ENOENT") {
            logger.error({ error }, "Failed to load jobs from disk.");
        }
    }
}

export async function listArchiveFiles(): Promise<string[]> {
    try {
        const files = await readdir(HF_MCP_DIR);
        return files.filter(f => ARCHIVE_PATTERN.test(f)).sort();
    } catch {
        return [];
    }
}

export async function readArchiveJobs(filename: string): Promise<[string, Job][]> {
    try {
        const raw = JSON.parse(await readFile(join(HF_MCP_DIR, filename), "utf-8")) as [string, unknown][];
        return raw.map(([id, job]) => [id, JobSchema.parse(job)]);
    } catch {
        return [];
    }
}

export async function rewriteArchiveFile(filename: string, entries: [string, Job][]): Promise<void> {
    await writeFile(join(HF_MCP_DIR, filename), JSON.stringify(entries, null, 2));
}

export async function deleteArchiveFile(filename: string): Promise<void> {
    await unlink(join(HF_MCP_DIR, filename));
}
