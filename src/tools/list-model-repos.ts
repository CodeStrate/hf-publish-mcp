import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listModels } from "@huggingface/hub";
import { getHFToken, getHFUsername } from "../client";
import { logger } from "../logger";

export function registerListModelRepos(server: McpServer) {
  server.registerTool(
    "list_model_repos",
    {
      description:
        "List user's Hugging Face models with likes, downloads, and last updated date.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(30)
          .describe("Max number of repos to return"),
      },
    },
    async ({ limit }) => {
      logger.info({ limit }, "listing user repos");
      try {
        const [username, token] = await Promise.all([
          getHFUsername(),
          getHFToken(),
        ]);
        const repos = [];
        for await (const model of listModels({
          search: { owner: username },
          accessToken: token,
          limit,
        })) {
          repos.push({
            id: model.id,
            name: model.name,
            private: model.private,
            task: model.task ?? null,
            likes: model.likes,
            downloads: model.downloads,
            updatedAt: model.updatedAt.toISOString(),
          });
        }
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(repos, null, 2) },
          ],
        };
      } catch (error) {
        logger.error({ error }, "failed to list repos");
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to list repos: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
