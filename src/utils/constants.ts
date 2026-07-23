import { homedir } from "node:os";
import { join } from "node:path";

const HF_MCP_DIR = process.env.HF_MCP_DIR ?? join(homedir(), ".hf_mcp");
const JOBS_FILE = join(HF_MCP_DIR, "hf-mcp-jobs.json");

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
    MODEL_WEIGHTS,
    REQUIRED_FILES,
}