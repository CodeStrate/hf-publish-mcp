import { type UploadJob } from "./job-schemas";

export type RetryableError = NodeJS.ErrnoException & Error & { retryable?: boolean }

export type SleepFn = (ms: number) => Promise<void>; // not a function its a schema of how a sleep fn should be like (params, return type)

export interface UploadParams {
    job: UploadJob;
    files: { path: string; content: Blob }[];
    repo: { type: "model" | "dataset" | "space"; name: string };
    commitMessage: string;
    accessToken: string;
}


