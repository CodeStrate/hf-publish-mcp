import type { Job } from "../types/job-schemas";
import { parseEnvInteger } from "./simple-utils";
import { HubApiError } from "@huggingface/hub";
import { GRADIO_RETRYABLE_STATUS_STRINGS } from "./constants";
import type { RetryableError, SleepFn } from "../types/util-types";
import { z } from "zod";

// common shape to opt in retries for any tool
export function retryShape(context: string) {
    return {
        maxRetries: z.number().int().min(1).max(5).optional()
            .describe(`Number of retry attempts for transient ${context} failures.`)
    };
}

export function isRetryableError(err:unknown): boolean {
    if(!(err instanceof Error)) return false;
    const e = err as RetryableError;
    if (typeof e.retryable === "boolean") return e.retryable;
    if (err instanceof HubApiError && err.statusCode) {
        if (err.statusCode === 429 || err.statusCode >= 500) return true;
        else return false;
    }
    if (e.code && typeof e.code === "string"){
        if (e.code === "ENOENT" || e.code === "EACCES") return false;
        else return true;
    }

    return GRADIO_RETRYABLE_STATUS_STRINGS.some(el => err.message.toLowerCase().includes(el.toLowerCase()));
}

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
    job: Job,
    maxRetries: number | undefined,
    attemptFn: () => Promise<T>,
    sleepFn: SleepFn = defaultSleep
): Promise<T | undefined> {

    job.jobStatus = "Running";
    const retryBudget = maxRetries ?? parseEnvInteger("DEFAULT_RETRIES", 0, {min: 0, max: 5});
    let lastError: unknown;

    // retry loop
    for (let attempt = 0; attempt <= retryBudget; attempt++){
        try{
            const result = await attemptFn();
            job.jobStatus = "Done";
            job.completedAt = new Date();
            return result;
        }catch (err) {
            lastError = err;
            const canRetry = isRetryableError(err) && attempt < retryBudget;
            if (!canRetry) break;

            job.retryCount = attempt + 1;
            job.jobStatus = "Retrying";
            const backoffMs = Math.min((2 ** attempt) * 1000, 30_000) + Math.random() * 250; 
                // always retry after 1-3s (depending on attempts) with random jitter of 0-250ms

            await sleepFn(backoffMs);
        }
    }

    // error out
    job.jobStatus = "Error";
    job.error = lastError instanceof Error ? lastError.message : String(lastError)
    job.completedAt = new Date();
    return undefined;
}