#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerInspectRepo } from "./tools/inspect-repo";
import { registerListModelRepos } from "./tools/list-model-repos";
import { registerUploadModel } from "./tools/upload-model";
import { registerGetModelUploadStatus } from "./tools/get-model-upload-status";
import { registerUpdateModelCard } from "./tools/update-model-card";
import { loadJobs } from "./utils/upload-job-store";
import { ensureAuthenticated } from "./client";
import { registerManageUploadJobs } from "./tools/manage-upload-jobs";
import { loadQuantJobs } from "./utils/quant-job-store";
import { registerTriggerGGUFQuant } from "./tools/trigger-gguf-quant";
import { registerGetQuantJobStatus } from "./tools/get-quant-job-status";
import { registerGGUFSpaceAuthFlow } from "./tools/gguf-space-auth-flow";

const server = new McpServer({
  name: "hf-publish",
  version: "1.0.3",
});

registerInspectRepo(server);
registerListModelRepos(server);
registerUploadModel(server);
registerGetModelUploadStatus(server);
registerUpdateModelCard(server);
registerManageUploadJobs(server);
registerTriggerGGUFQuant(server);
registerGetQuantJobStatus(server);
registerGGUFSpaceAuthFlow(server);

async function main() {
  await ensureAuthenticated();
  await loadJobs();
  await loadQuantJobs();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("hf-publish started\n");
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error}\n`);
  process.exit(1);
});
