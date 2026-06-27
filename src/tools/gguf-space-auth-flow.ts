import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { startSpaceAuthFlow } from "../utils/gguf-space-oauth";
import { logger } from "../logger";

export function registerGGUFSpaceAuthFlow(server: McpServer) {
    server.registerTool(
        "gguf_space_auth_flow",
        {
            description: "Authorize access to the ggml-org/gguf-my-repo Space via HF OAuth. Returns a verification_uri and user_code — YOU MUST show both to the user exactly as returned so they can open the URL and enter the code in their browser. Once approved, trigger_gguf_quant will proceed. Only needed once — token is cached for 8 hours.",
            inputSchema: {},
        },
        async () => {
            logger.info("starting GGUF Space OAuth device flow");
            try {
                const clientId = process.env.HF_OAUTH_CLIENT_ID;
                if (!clientId) {
                    return {
                        isError: true,
                        content: [{ type: "text" as const, text: "HF_OAUTH_CLIENT_ID is not set. Add it to your MCP client env config." }],
                    };
                }

                const clientSecret = process.env.HF_OAUTH_CLIENT_SECRET;
                const { verification_uri, user_code } = await startSpaceAuthFlow(clientId, clientSecret);

                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({
                            message: "Open the URL below in your browser and enter the code to authorize. Then call trigger_gguf_quant — no need to call this tool again for 8 hours.",
                            url: verification_uri,
                            code: user_code,
                        }, null, 2),
                    }],
                };
            } catch (error) {
                logger.error({ error }, "GGUF Space auth flow failed");
                return {
                    isError: true,
                    content: [{ type: "text" as const, text: `Auth flow failed: ${error instanceof Error ? error.message : String(error)}` }],
                };
            }
        }
    );
}
