# HF Hub MCP

A local stdio MCP server for the fine-tuner's publish workflow on Hugging Face Hub. The official HF MCP covers search and discovery — this fills the publish side: inspect repos, upload checkpoints and adapters, and track upload progress.

## Tools

| Tool | Description |
|---|---|
| `list_model_repos` | List your HF models with likes, downloads, and last updated date |
| `describe_repo` | Check whether expected model files exist in a repo. GGUF repos are treated as complete without tokenizer files since the format is self-contained |
| `upload_model` | Upload a model or adapter directory to HF. Returns a `jobId` immediately — non-blocking |
| `get_model_upload_status` | Poll the status of a background upload by `jobId`. Shows current phase, current file, and elapsed time |

## Setup

**Prerequisites:** [Bun](https://bun.com)

```bash
bun install
```

Create a `.env` file from the example and add a write-scoped HF token:

```bash
cp .env.example .env
```

```env
HF_TOKEN=hf_your_write_scoped_token_here
```

## MCP Client Config

Add a stdio server entry in your client's MCP config pointing at `src/index.ts` with `HF_TOKEN` in the environment.

Example for VS Code (`.vscode/mcp.json`) / LM Studio / any stdio client:

```json
{
  "command": "bun",
  "args": ["run", "/absolute/path/to/hf_mcp/src/index.ts"],
  "env": {
    "HF_TOKEN": "hf_..."
  }
}


```

## Upload flow

`upload_model` is non-blocking. It creates the repo, queues the upload, and returns a `jobId` immediately. Poll with `get_model_upload_status` to track progress.

Upload jobs are persisted to `~/.hf_mcp/upload-jobs.json` so status survives server restarts.

Progress events are phase-level (`preuploading → uploadingLargeFiles → committing`) and current-file-level, powered by `uploadFilesWithProgress` from `@huggingface/hub`.

## Stack

- TypeScript + Bun
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — stdio transport
- [`@huggingface/hub`](https://github.com/huggingface/huggingface.js/tree/main/packages/hub) — repo ops and uploads
- `pino` — structured logging to stderr (stdout is reserved for MCP JSON-RPC)

## Roadmap
1. Streamline `HF_TOKEN` input on MCP Setup to avoid manual secret input.
 2. `update_model_card` — patch README sections (gray-matter + remark AST) without clobbering existing content
