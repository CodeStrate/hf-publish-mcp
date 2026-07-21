import { homedir } from "node:os";
import { join } from "node:path";

const HF_MCP_DIR = process.env.HF_MCP_DIR ?? join(homedir(), ".hf_mcp");
const JOBS_FILE = join(HF_MCP_DIR, "hf-mcp-jobs.json");
const HF_OAUTH_TOKEN_FILE = join(HF_MCP_DIR, "oauth-token.json");
const DEVICE_ENDPOINT = "https://huggingface.co/oauth/device";
const TOKEN_ENDPOINT = "https://huggingface.co/oauth/token";

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

export {
    HF_MCP_DIR,
    JOBS_FILE,
    HF_OAUTH_TOKEN_FILE,
    DEVICE_ENDPOINT,
    TOKEN_ENDPOINT,
    MODEL_WEIGHTS,
    REQUIRED_FILES
}