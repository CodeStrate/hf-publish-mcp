export type JobStatus = "Pending" | "Running" | "Done" | "Error";

export type UploadJob = {
    jobId: string;
    jobStatus: JobStatus;
    repoId: string;
    repoUrl: string;
    currentFile: string;
    error?: string;
    startedAt: Date;
    completedAt?: Date;
    phase?: "preuploading" | "uploadingLargeFiles" | "committing";
}

export const uploadJobs = new Map<string, UploadJob>();