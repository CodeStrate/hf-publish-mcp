#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerInspectRepo } from "./tools/inspect-repo";
import { registerListModelRepos } from "./tools/list-model-repos";
import { registerUploadModel } from "./tools/upload-model";
import { registerGetJobStatus } from "./tools/get-job-status";
import { registerUpdateModelCard } from "./tools/update-model-card";
import { loadJobs } from "./utils/job-store";
import { ensureAuthenticated } from "./client";
import { registerManageJobs } from "./tools/manage-jobs";
import { registerTriggerGGUFQuant } from "./tools/trigger-gguf-quant";

const server = new McpServer({
  name: "hf-publish",
  version: "1.0.4",
});

registerInspectRepo(server);
registerListModelRepos(server);
registerUploadModel(server);
registerGetJobStatus(server);
registerUpdateModelCard(server);
registerManageJobs(server);
registerTriggerGGUFQuant(server);

async function main() {
  await ensureAuthenticated();
  await loadJobs();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("hf-publish started\n");
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error}\n`);
  process.exit(1);
});
