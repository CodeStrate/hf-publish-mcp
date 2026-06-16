import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { uploadJobs } from "../types/upload-job";
import { logger } from "../logger";

export function registerGetModelUploadStatus(server: McpServer) {
    server.registerTool(
        "get_model_upload_status",
        {
            description: "Returns the status of a model uploading job based on job ID (jobId).",
            inputSchema: {
                uploadJobId: z.string().describe("Job ID returned by upload_model")
            },
        },
        async({ uploadJobId }) => {
            try{
                const job = uploadJobs.get(uploadJobId);
                if (!job){ // guard
                    return {
                        isError: true,
                        content: [{type: "text" as const, text: `No Job found with jobId: ${uploadJobId}`}]
                    }
                }

                const jobEndTime = job.completedAt ?? new Date();
                const elapsedTime = `${((jobEndTime.getTime() - job.startedAt.getTime()) /1000).toFixed(1)}s`

                const result: Record<string, unknown> = {
                    jobId: job.jobId,
                    status: job.jobStatus,
                    repoId: job.repoId,
                    repoUrl: job.repoUrl,
                    elapsedTime
                }

                if (job.jobStatus === "Running"){
                    result.phase = job.phase;
                    result.currentFile = job.currentFile;
                }
                if (job.jobStatus === "Error"){
                    result.error = job.error;
                }

                return {
                    content: [{type: "text" as const, text: JSON.stringify(result, null, 2) }],
                }
                
            }catch (error) {
                logger.error({ error }, `Failed to get upload status for ${uploadJobId}`);
                return {
                isError: true,
                content: [{ type: "text" as const, text: `Failed to get upload status for ${uploadJobId}: ${error instanceof Error ? error.message : String(error)}` }],
                };
            }
        }
    )
}