import {z} from "zod";

const JobStatusTypes = ["Pending", "Running", "Retrying", "Done", "Error"] as const;
const QuantTypes = ["Q2_K", "Q3_K_S", "Q3_K_M", "Q3_K_L", "Q4_0", "Q4_K_S", "Q4_K_M", "Q5_0", "Q5_K_S", "Q5_K_M", "Q6_K", "Q8_0"] as const;

const BaseJobSchema = z.object({
    jobId: z.string(),
    repoId: z.string(),
    jobStatus: z.enum(JobStatusTypes),
    startedAt: z.coerce.date(), // Date obj on load
    completedAt: z.coerce.date().optional(),
    error: z.string().optional(),
    retryCount: z.number().optional(),
    maxRetries: z.number().optional(),
})

export const UploadJobSchema = BaseJobSchema.extend({
    jobType: z.literal("upload"),
    localDir: z.string(),
    repoType: z.enum(["model", "dataset", "space"]).default("model"),
    visibility: z.enum(["public", "private", "protected"]).default("public"),
    commitMessage: z.string().default("Upload model files"),
    repoUrl: z.string(),
    currentFile: z.string(),
    phase: z.enum(["preuploading", "uploadingLargeFiles", "committing"]).optional(),
})

export const QuantJobSchema = BaseJobSchema.extend({
    jobType: z.literal("quant"),
    isPrivate: z.boolean(),
    quantType: z.enum(QuantTypes),
    outputRepoUrl: z.string().optional(),
})

export const MergeJobSchema = BaseJobSchema.extend({
    jobType: z.literal("merge"),
    strategy: z.enum(["mergekit"]),
    isPrivate: z.boolean(),
    mergekitConfig: z.string().optional(),   // raw YAML for mergekit
    outputDir: z.string(),
    logs: z.string().optional(),
})

export const JobSchema = z.discriminatedUnion("jobType", [UploadJobSchema, QuantJobSchema, MergeJobSchema]);

export type Job = z.infer<typeof JobSchema>
export type UploadJob = z.infer<typeof UploadJobSchema>
export type QuantJob = z.infer<typeof QuantJobSchema>
export type MergeJob = z.infer<typeof MergeJobSchema>