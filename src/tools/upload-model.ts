import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../logger";
import { getHFToken } from "../client";
import { createRepo } from "@huggingface/hub";
import { stat } from "node:fs/promises";
import { type UploadJob } from "../types/job-schemas";
import { jobsMap, persistJobs } from "../utils/job-store";
import { collectFilesForUpload, runUpload } from "../utils/upload-utils";


export function registerUploadModel(server: McpServer) {
    server.registerTool(
        "upload_model",
        {
            description: "Upload a model or adapter directory to HuggingFace. Returns a jobId immediately — use get_model_upload_status to track progress.",
            inputSchema: {
                repoId: z.string().describe("Owner/repo-name, e.g. google/gemma-4-12B, created if absent."),
                localDir: z.string().describe("Absolute path to the model/checkpoint/adapter directory."),
                repoType: z.enum(["model", "dataset", "space"]).default("model").describe("The type of repository: model (default), dataset, space"),
                visibility: z.enum(["public", "private", "protected"]).default("public").describe("Repository visibility"),
                commitMessage: z.string().default("Upload model files").describe("Commit message"),
            },
        },
        async (input) => {
            try {
                const accessToken = getHFToken();
                const repo = { type: input.repoType, name: input.repoId };

                let repoUrl: string;
                // guard added for bad dir
                const dirStat = await stat(input.localDir).catch(() => null);
                if(!dirStat?.isDirectory()){
                    return {
                        isError: true,
                        content: [{type: "text" as const, text: `Directory specified not found: ${input.localDir}`}]
                    }
                }
                try {
                    ({ repoUrl } = await createRepo({ repo, visibility: input.visibility, accessToken }));
                } catch (e: any) {
                if (e?.statusCode === 409 || e?.message?.includes("already exists")) {
                    repoUrl = `https://huggingface.co/${input.repoId}`;
                    } else throw e;
                }

                const files = await collectFilesForUpload(input.localDir);
                if (files.length === 0) {
                    return {
                        isError: true,
                        content: [{ type: "text" as const, text: `No files found in ${input.localDir} (hidden files are excluded).` }],
                    };
                }

                const jobId = crypto.randomUUID();
                const job: UploadJob = {
                    jobId,
                    jobType: "upload",
                    jobStatus: "Pending",
                    repoId: input.repoId,
                    repoUrl,
                    currentFile: "",
                    localDir: input.localDir,
                    repoType: input.repoType,
                    visibility: input.visibility,
                    commitMessage: input.commitMessage,
                    startedAt: new Date(),
                };
                jobsMap.set(jobId, job);
                await persistJobs()

                runUpload(job, files, repo, input.commitMessage, accessToken).catch(() => {});

                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({ jobId, repoUrl, message: "Upload started. Use get_model_upload_status to track progress." }, null, 2),
                    }],
                };
            } catch (error) {
                logger.error({ error }, `Failed to start upload for ${input.repoId}`);
                return {
                    isError: true,
                    content: [{ type: "text" as const, text: `Failed to start upload: ${error instanceof Error ? error.message : String(error)}` }],
                };
            }
        }
    );
}