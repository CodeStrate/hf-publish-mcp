import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { quantJobs } from "../types/quant-job";
import { logger } from "../logger";

export function registerGetQuantJobStatus(server: McpServer) {
    server.registerTool(
        "get_quant_job_status",
        {
            description: "Returns the status of a GGUF quantization job by jobId.",
            inputSchema: {
                quantJobId: z.string().describe("Job ID returned by trigger_gguf_quant")
            },
        },
        async({ quantJobId }) => {
            try{
                const job = quantJobs.get(quantJobId);
                if (!job){ // guard
                    return {
                        isError: true,
                        content: [{type: "text" as const, text: `No Job found with jobId: ${quantJobId}`}]
                    }
                }

                const jobEndTime = job.completedAt ?? new Date();
                const elapsedTime = `${((jobEndTime.getTime() - job.startedAt.getTime()) /1000).toFixed(1)}s`

                const result: Record<string, unknown> = {
                    jobId: job.jobId,
                    status: job.jobStatus,
                    repoId: job.repoId,
                    quantType: job.quantType,
                    elapsedTime,
                }

                if (job.jobStatus === "Completed") {
                    result.outputRepoUrl = job.outputRepoUrl ?? null;
                }
                if (job.jobStatus === "Error") {
                    result.error = job.error;
                }

                return {
                    content: [{type: "text" as const, text: JSON.stringify(result, null, 2) }],
                }
                
            }catch (error) {
                logger.error({ error }, `Failed to get quant job status for ${quantJobId}`);
                return {
                isError: true,
                content: [{ type: "text" as const, text: `Failed to get quant job status for ${quantJobId}: ${error instanceof Error ? error.message : String(error)}` }],
                };
            }
        }
    )
}