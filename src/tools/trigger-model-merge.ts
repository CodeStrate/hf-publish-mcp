import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../logger";
import { jobsMap, persistJobs } from "../utils/job-store";
import { type MergeJob } from "../types/job-schemas";
import { runMergekitStrategy } from "../utils/merge-utils";
import { retryShape, withRetry } from "../utils/retry";

async function runMerge(job: MergeJob, maxRetries?: number | undefined){
    // with retry handles catching errors.
    await withRetry(job, maxRetries, () => runMergekitStrategy(job));
    persistJobs()
}

export function registerTriggerModelMerge(server: McpServer) {
    server.registerTool(
        "trigger_model_merge",
        {
            description: "Trigger an adapter model merge via mergekit (uvx). Saves it on disk for `upload_model` tool to upload it to Hugging Face.",
            inputSchema : {
                    repoId: z.string().describe("Merged model repository name for HuggingFace Upload, Owner/repo-name. eg. Google/Gemma-4-E2B"),
                    strategy: z.enum(["mergekit"]),
                    mergekitConfig: z.string().optional(),
                    isPrivate: z.boolean().default(false),
                    outputDir: z.string().describe("Merge tool output directory name. eg. Qwen3.5-9B-Fable-Distill-merged"),
                    ...retryShape("merge")
            },
        },
        async (input) => {
            const {repoId, strategy, mergekitConfig, isPrivate, outputDir} = input
            logger.info({strategy, mergekitConfig}, "triggering model adapter merge");
            if(!mergekitConfig) {
                return { isError: true, content: [{ type: "text" as const, text: "mergekitConfig is required for mergekit strategy" }] };
                }
            const jobId = crypto.randomUUID()
            const job: MergeJob = {
                repoId,
                jobId,
                jobType: "merge",
                jobStatus: "Pending",
                startedAt: new Date(),
                strategy,
                outputDir,
                mergekitConfig,
                isPrivate,
                maxRetries: input.maxRetries,
            }

            jobsMap.set(jobId, job);
            persistJobs();

            runMerge(job, input.maxRetries);

            return {
                content: [{ type: "text" as const, text: JSON.stringify(
                    {
                        jobId,
                        message: "Merge job started. use `get_job_status` to track the progress"
                    })
                }]
            };
        }
    )
}