import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jobsMap } from "../utils/job-store";
import { logger } from "../logger";

export function registerGetJobStatus(server: McpServer) {
    server.registerTool(
        "get_job_status",
        {
            description: "Returns the status of any background job (upload or quant) by jobId.",
            inputSchema: {
                jobId: z.string().describe("Job ID returned by upload_model or trigger_gguf_quant")
            },
        },
        async ({ jobId }) => {
            try {
                const job = jobsMap.get(jobId);
                if (!job) {
                    return {
                        isError: true,
                        content: [{ type: "text" as const, text: `No job found with jobId: ${jobId}` }]
                    };
                }

                const jobEndTime = job.completedAt ?? new Date();
                const elapsedTime = `${((jobEndTime.getTime() - job.startedAt.getTime()) / 1000).toFixed(1)}s`;

                const result: Record<string, unknown> = {
                    jobId: job.jobId,
                    jobType: job.jobType,
                    status: job.jobStatus,
                    repoId: job.repoId,
                    elapsedTime,
                };

                if (job.jobType === "upload") {
                    result.repoUrl = job.repoUrl;
                    if (job.jobStatus === "Running" || job.jobStatus === "Retrying") {
                        result.phase = job.phase;
                        if (job.currentFile) result.currentFile = job.currentFile;
                    }
                    if (job.retryCount !== undefined) result.retryCount = job.retryCount;
                    if (job.maxRetries !== undefined) result.maxRetries = job.maxRetries;
                } else if (job.jobType === "quant") {
                    result.quantType = job.quantType;
                    if (job.outputRepoUrl) result.outputRepoUrl = job.outputRepoUrl;
                }

                if (job.jobStatus === "Error") {
                    result.error = job.error;
                }

                return {
                    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
                };
            } catch (error) {
                logger.error({ error }, `Failed to get job status for ${jobId}`);
                return {
                    isError: true,
                    content: [{ type: "text" as const, text: `Failed to get job status: ${error instanceof Error ? error.message : String(error)}` }],
                };
            }
        }
    );
}
