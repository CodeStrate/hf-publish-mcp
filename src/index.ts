import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDescribeRepo } from "./tools/describe-repo";
import { registerListModelRepos } from "./tools/list-model-repos";
import { registerUploadModel } from "./tools/upload-model";

const server = new McpServer({
  name: "hf-mcp",
  version: "1.0.0",
});

registerDescribeRepo(server);
registerListModelRepos(server);
registerUploadModel(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("hf-mcp started\n");
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error}\n`);
  process.exit(1);
});
