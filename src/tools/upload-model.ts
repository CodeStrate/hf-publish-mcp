import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import { logger } from "../logger";
import { getHFToken } from "../client";
import { createRepo, uploadFiles } from "@huggingface/hub";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";


async function collectFilesForUpload(directory:string): Promise<{path: string; content: Blob}[]> {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true});
    return Promise.all(entries
    .filter(entry => entry.isFile() && !entry.name.startsWith("."))
    .map(async entry => {
        const absolutePath = join(entry.parentPath, entry.name)
        return {path: relative(directory, absolutePath), content: new Blob([await readFile(absolutePath)])}
    }))
}


export function registerUploadModel(server: McpServer) {
    server.registerTool(
        "upload_model",
        {
            description:
            "Upload specified model or adapter directory to HuggingFace.",
            inputSchema: {
                repoId : z.string().describe("Owner/repo-name, e.g. google/gemma-4-12B, created if absent."),
                localDir: z.string().describe("Absolute path to the model/checkpoint/adapter directory."),
                repoType: z.enum(["model", "dataset", "space"]).default("model").describe("The type of repository: model (default), dataset, space"),
                visibility: z.enum(["public", "private", "protected"]).default("public").describe("Repository visibility"),
                commitMessage: z.string().describe("Commit Message for the repository").default("Upload Files")
            },
        },

        async (input) => {
            logger.info(`Uploading ${input.localDir} to HuggingFace as ${input.repoId}`)
            try {
                const accessToken = getHFToken();

                const { repoUrl } = await createRepo({ repo: { type: input.repoType, name: input.repoId }, visibility: input.visibility, accessToken });

                const files = await collectFilesForUpload(input.localDir);
                await uploadFiles({
                    repo: { type: input.repoType, name: input.repoId},
                    files,
                    commitTitle: input.commitMessage,
                    accessToken
                });

                return {
                    content: [
                        {type: "text" as const, text: repoUrl}
                    ]
                }


            } catch (error) {
                logger.error({error}, `failed to upload files at ${input.repoId}`);
                return {
                    isError: true,
                    content: [
                        {
                            type: "text" as const,
                            text: `Failed to upload model files for ${input.repoId}: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        }
    )
}