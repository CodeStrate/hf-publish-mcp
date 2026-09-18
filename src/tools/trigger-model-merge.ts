import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../logger";
import { jobsMap, persistJobs } from "../utils/job-store";
import { type MergeJob } from "../types/job-schemas";
import { runMergekitStrategy } from "../utils/merge-utils";

async function runMerge(job: MergeJob){
    try {
        job.jobStatus = "Running";
        persistJobs();
        await runMergekitStrategy(job);
    }catch (err) {
        job.jobStatus = "Error";
        job.error = String(err);
        job.completedAt = new Date();
        persistJobs();
        logger.error({ err, jobId: job.jobId }, "merge failed");

    }
}

export function registerTriggerModelMerge(server: McpServer) {
    server.registerTool(
        "trigger_model_merge",
        {
            description: "Trigger an adapter model merge via mergekit (uvx). Uploads the merged model back to Hugging Face.",
            inputSchema : {
                    strategy: z.enum(["mergekit"]),
                    mergekitConfig: z.string().optional(),
                    isPrivate: z.boolean().default(false),
                    outputRepo: z.string().describe("Merge tool output repository name. eg. Qwen3.5-9B-Fable-Distill-merged")
            },
        },
        async (input) => {
            const {strategy, mergekitConfig, isPrivate, outputRepo} = input
            logger.info({strategy, mergekitConfig}, "triggering model adapter merge");
            if(!mergekitConfig) {
                return { isError: true, content: [{ type: "text" as const, text: "mergekitConfig is required for mergekit strategy" }] };
                }
            const jobId = crypto.randomUUID()
            const job: MergeJob = {
                repoId: outputRepo,
                jobId,
                jobType: "merge",
                jobStatus: "Pending",
                startedAt: new Date(),
                strategy,
                mergekitConfig,
                isPrivate,
            }

            jobsMap.set(jobId, job);
            persistJobs();

            runMerge(job);

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