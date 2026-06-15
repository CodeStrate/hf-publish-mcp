import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fileExists, listFiles } from "@huggingface/hub";
import { getHFToken } from "../client";
import { logger } from "../logger";

const REQUIRED_FILES = [
  "config.json",
  "tokenizer_config.json",
  "tokenizer.json",
] as const;

const MODEL_WEIGHTS = [
  ".safetensors", // includes mlx too
  ".gguf",
  ".pt", // pytorch
  ".bin" //old format compatibility
]

export function registerDescribeRepo(server: McpServer) {
  server.registerTool(
    "describe_repo",
    {
      description:
        "Check whether expected model files (config, tokenizer, safetensors shards) exist in a repo. GGUF repos are considered complete without tokenizers since the file format is self contained.",
      inputSchema: {
        repoId: z
          .string()
          .describe("Owner/repo-name, e.g. mistralai/Mistral-7B-v0.1"),
      },
    },
    async ({ repoId }) => {
      logger.info({ repoId }, "checking repo files");
      try {
        const token = getHFToken();
        const repo = { type: "model" as const, name: repoId }

        const [fileChecks, allFiles] = await Promise.all([
          Promise.all(
            REQUIRED_FILES.map(async (path) => ({
              path,
              exists: await fileExists({ repo, path, accessToken: token }),
            })),
          ),
          (async () => {
            const files: string[] = [];
            for await (const entry of listFiles({
              repo,
              recursive: true,
              accessToken: token,
            })) {
              if (entry.type === "file") files.push(entry.path);
            }
            return files;
          })(),
        ]);

        const modelWeights = allFiles.filter((file) => MODEL_WEIGHTS.some((ext) => file.endsWith(ext)));
        const isGGUF: boolean = modelWeights.some(f => f.endsWith(".gguf"));

        const report = {
          repoId,
          required: Object.fromEntries(
            fileChecks.map(({ path, exists }) => [path, exists]),
          ),
          modelWeights: {
            count: modelWeights.length,
            files: modelWeights,
          },
          all_present: isGGUF ||
            fileChecks.every(({ exists }) => exists) && modelWeights.length > 0,
        };

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(report, null, 2) },
          ],
        };
      } catch (error) {
        logger.error({ error, repoId }, "failed to check repo files");
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to check files for ${repoId}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
