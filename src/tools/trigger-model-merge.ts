import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getHFToken } from "../client";
import { logger } from "../logger";
import { jobsMap, persistJobs } from "../utils/job-store";
import { MergeJobSchema, type MergeJob } from "../types/job-schemas";

function runMerge(jobId: string){
    // TODO
}

export function registerTriggerModelMerge(server: McpServer) {
    server.registerTool(
        "trigger_model_merge",
        {
            description: "Trigger an adapter model merge via mergekit (uvx) or lora_fold strategies. Uploads the merged model back to Hugging Face.",
            inputSchema : {
                    strategy: z.enum(["mergekit", "lora_fold", "lora_fold_unsloth"]),
                    mergekitConfig: z.string().optional(),
                    isPrivate: z.boolean().default(false),
                    baseModel: z.string().optional().describe("Base Model Repository of the Adapter to be merged."),   
                    adapterSource: z.string().optional().describe("Local Path or HuggingFace Repository (owner/model) of the Adapter Model (whichever exists)"),
                    outputRepo: z.string().describe("Merge tool output repository name. eg. Qwen3.5-9B-Fable-Distill-merged")
            },
        },
        async (input) => {
            const {strategy, mergekitConfig, baseModel, isPrivate, adapterSource, outputRepo} = input
            logger.info({strategy, mergekitConfig, baseModel, adapterSource}, "triggering GGUF quant");
            if(strategy === "mergekit" && !mergekitConfig) {
                return { isError: true, content: [{ type: "text" as const, text: "mergekitConfig is required for mergekit strategy" }] };
                }
            if ((strategy === "lora_fold" || strategy === "lora_fold_unsloth") && !baseModel){
                return { isError: true, content: [{ type: "text" as const, text: "baseModel is required for lora_fold strategies" }] };
            }
            if ((strategy === "lora_fold" || strategy === "lora_fold_unsloth") && !adapterSource){
                return { isError: true, content: [{ type: "text" as const, text: "An adapterSource is required for lora_fold strategies" }] };
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
                adapterSource,
                baseModel,
                isPrivate,
            }

            jobsMap.set(jobId, job);
            persistJobs();

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