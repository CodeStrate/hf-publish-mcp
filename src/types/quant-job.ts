export const QUANT_TYPES = ["Q2_K", "Q3_K_S", "Q3_K_M", "Q3_K_L", "Q4_0", "Q4_K_S", "Q4_K_M", "Q5_0", "Q5_K_S", "Q5_K_M", "Q6_K", "Q8_0"] as const;
export type QuantType = typeof QUANT_TYPES[number];

export type QuantJobStatus = "Queued" | "Running" | "Completed" | "Error";

export type QuantJob = {
    jobId: string;
    sessionHash: string;
    eventId: string;
    jobStatus: QuantJobStatus;
    repoId: string;
    quantType: QuantType;
    isPrivate: boolean;
    outputRepoUrl?: string;
    error?: string;
    startedAt: Date;
    completedAt?: Date;
}

export const quantJobs = new Map<string, QuantJob>();