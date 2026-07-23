<div align="center">
  <img width="1280" height="720" alt="hf-publish banner" src="https://github.com/user-attachments/assets/17d41de5-1343-4abf-96f9-68bfc95875af" />
  <h1>HF Publish</h1>
  <p>A local stdio MCP server for managing your own models on Hugging Face Hub.</p>

  [![npm version](https://img.shields.io/npm/v/hf-publish-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/hf-publish-mcp)
  [![npm downloads](https://img.shields.io/npm/dm/hf-publish-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/hf-publish-mcp)
  [![license](https://img.shields.io/npm/l/hf-publish-mcp)](LICENSE)
  [![bun](https://img.shields.io/badge/runtime-bun-f9f1e1?logo=bun&logoColor=black)](https://bun.sh)
  [![MCP](https://img.shields.io/badge/transport-stdio-6366f1)](https://modelcontextprotocol.io)
  [![GitHub stars](https://img.shields.io/github/stars/CodeStrate/hf-publish-mcp?style=flat&color=yellow)](https://github.com/CodeStrate/hf-publish-mcp/stargazers)
</div>

---

Intended for fine-tuners and researchers who publish models to HF Hub. This is not a general-purpose Hub CLI wrapper - it is scoped to **your own repos**: uploading checkpoints and adapters, inspecting file completeness, and maintaining model cards. For browsing and discovering other people's models, use the [official HF MCP](https://huggingface.co/docs/hub/en/agents-mcp) instead.

[Tools](#tools) · [Getting Started](#getting-started) · [Auth](#auth) · [Client Config](#client-config) · [How It Works](#how-it-works) · [Stack](#stack) · [Development](#development) · [Contributing](#contributing)

## vs Official HF MCP

The [official HF MCP](https://huggingface.co/docs/hub/en/agents-mcp) and this server are complementary, not overlapping.

| | [Official HF MCP](https://huggingface.co/docs/hub/en/agents-mcp) | hf-publish-mcp |
|---|---|---|
| Transport | Remote HTTP/SSE | Local stdio |
| Auth | HF account (OAuth via settings) | Write-scoped token |
| Search models, datasets, spaces, papers | Yes | No |
| Search HF documentation | Yes | No |
| Run Gradio Space tools | Yes | No |
| Run jobs on HF infrastructure | Yes | No |
| Repo details + README (read) | Yes | Yes (`inspect_repo`) |
| Upload local model/adapter files | No | Yes |
| Edit model cards | No | Yes |
| Track background upload jobs | No | Yes |

The overlap is `inspect_repo` vs the official "Hub Repository Details" tool - both return repo metadata and the README. Everything else is distinct: the official MCP is for exploring the Hub, this one is for pushing to it.

## Tools

| Tool | Description |
|---|---|
| `list_model_repos` | List your HF models with likes, downloads, and last modified date |
| `inspect_repo` | Verify expected files exist (config, tokenizer, weights) and return the model card |
| `upload_model` | Upload a model or adapter directory to HF. Non-blocking — returns a `jobId` immediately |
| `get_job_status` | Poll any background job (upload or quant) by `jobId`. Shows phase, current file, and elapsed time |
| `update_model_card` | Patch a model card README via surgical section edits, frontmatter merges, or full rewrite (dry run support: review changes before agent commits) |
| `manage_jobs` | List, delete, or batch-clean job history (uploads and quant jobs) across active and archived files |
| `trigger_gguf_quant` | Trigger GGUF quantization via the ggml-org/gguf-my-repo Space. Non-blocking — returns a `jobId`. Requires `HF_GGUF_MY_SPACE_COOKIE` (see [Auth](#auth)) |

## Getting Started

**Requires [Bun](https://bun.sh)**

No install needed - run directly with `bunx`:

```bash
bunx hf-publish-mcp
```

Or clone for local development..

## Development


```bash
git clone https://github.com/CodeStrate/hf-publish-mcp

cd hf-publish-mcp
bun install
bun run dev        # watch mode - restarts on file changes
```

To build from source:

```bash
bun run build      # compiles to dist/index.js
```

Then point your MCP client at the local build:

```json
{
  "command": "bun",
  "args": ["/absolute/path/to/hf-publish-mcp/dist/index.js"],
  "env": { "HF_TOKEN": "hf_..." }
}
```

Logs go to stderr (structured JSON via pino). To read them while developing:

```bash
HF_TOKEN=hf_... bun run dev 2>&1 | bunx pino-pretty
```

## Auth

On startup the server resolves your HF token in order:

1. `HF_TOKEN` environment variable
2. HF CLI token at `~/.cache/huggingface/token`
If neither is present the server exits immediately with an error message rather than hanging.

The token requires **write** scope.

### GGUF Quantization Auth

`trigger_gguf_quant` uses the public `ggml-org/gguf-my-repo` Space, which requires you to be logged in. It cannot be satisfied with an HF token alone — the Space gates its API behind a browser session.

**One-time setup (valid ~2 weeks):**

1. Open `https://ggml-org-gguf-my-repo.hf.space` directly (not the embedded iframe on huggingface.co — it blocks cross-origin auth)
2. Click **Sign in with Hugging Face** and authorize
3. Open DevTools → Application → Cookies → `ggml-org-gguf-my-repo.hf.space`
4. Copy the `session` cookie value
5. Add it to your MCP client env config as `HF_GGUF_MY_SPACE_COOKIE`

The cookie expires after ~2 weeks or if the Space restarts. When `trigger_gguf_quant` returns an auth error, refresh it with the same steps.

## Client Config

### Claude Desktop

```json
{
  "mcpServers": {
    "hf-publish": {
      "command": "bunx",
      "args": ["hf-publish-mcp"],
      "env": {
        "HF_TOKEN": "hf_..."
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add hf-publish -- bunx hf-publish-mcp
```

### VS Code (`.vscode/mcp.json`) - token via secrets UI

```json
{
  "inputs": [
    {
      "id": "hf-token",
      "type": "promptString",
      "description": "HuggingFace write-scoped token",
      "password": true
    }
  ],
  "servers": {
    "hf-publish": {
      "type": "stdio",
      "command": "bunx",
      "args": ["hf-publish-mcp"],
      "env": {
        "HF_TOKEN": "${input:hf-token}"
      }
    }
  }
}
```

### Generic stdio client (Cursor, OpenCode, etc.)

```json
{
  "command": "bunx",
  "args": ["hf-publish-mcp"],
  "env": {
    "HF_TOKEN": "hf_..."
  }
}
```

**If you use `trigger_gguf_quant`:** the `HF_GGUF_MY_SPACE_COOKIE` value is large (~3 KB) — too unwieldy to paste inline. Use an env file instead:

```bash
# ~/.hf_mcp.env  (gitignored, not committed)
HF_TOKEN=hf_...
HF_GGUF_MY_SPACE_COOKIE=<paste session cookie here>
```

Then pass it via `--env-file`:

```json
{
  "command": "bunx",
  "args": ["--env-file=/Users/you/.hf_mcp.env", "hf-publish-mcp"]
}
```

## How It Works

### Upload

`upload_model` is non-blocking. It creates the repo if absent, starts the upload in the background, and returns a `jobId` immediately. Poll with `get_job_status`.

Jobs persist to `~/.hf_mcp/hf-mcp-jobs.json` — status survives server restarts. Jobs interrupted mid-upload are marked `Error` on next start rather than left in a stale `Running` state. Completed jobs are archived to dated files once the active file exceeds the limit.

Progress is phase-level (`preuploading → uploadingLargeFiles → committing`) and file-level, powered by `uploadFilesWithProgress` from `@huggingface/hub`.

### GGUF Quantization

`trigger_gguf_quant` is non-blocking. It submits the model to the `ggml-org/gguf-my-repo` Gradio Space via `@gradio/client` and returns a `jobId` immediately. Poll with `get_job_status`.

The Space runs `llama.cpp`'s `convert_hf_to_gguf.py` and quantizes the result. The output repo is created automatically as `{owner}/{model-name}-GGUF` — the name is set by the Space and cannot be customized. Conversion of a 1B model takes ~2 minutes; larger models proportionally longer.

Auth is via a browser session cookie (`HF_GGUF_MY_SPACE_COOKIE`). The Space gates its API behind HF login — an HF token alone is not sufficient. See [GGUF Quantization Auth](#gguf-quantization-auth) for setup.

Error output from the Space (e.g. tokenizer compatibility issues) is stripped from HTML and surfaced directly in the job's `error` field, visible via `get_job_status`.

### Model Card Editing

`update_model_card` operates in two modes:

**Surgical** - pass `frontmatter` and/or `sections`. Only the specified parts change; everything else is returned byte-for-byte. The remark AST is used purely as a position map to locate section boundaries, then the raw string is spliced directly. No formatting drift.

**Full rewrite** - pass `content` with the complete README body. `frontmatter` and `removeFields` are still applied on top if provided.

**Dry Run Support** - A `dryRun` flag for when you would like to review changes before you'd want the agent to commit the changes. Allowing for manual adjustments in case something isn't right.

## Stack

- TypeScript + Bun
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) - MCP SDK + stdio transport
- [`@huggingface/hub`](https://github.com/huggingface/huggingface.js/tree/main/packages/hub) - repo ops, uploads, file download
- [`@gradio/client`](https://github.com/gradio-app/gradio/tree/main/client/js) - Gradio Space API client for GGUF quantization
- `gray-matter` - YAML frontmatter round-tripping
- `remark` + `remark-gfm` - markdown AST for section position mapping
- `pino` - structured logging to stderr (stdout reserved for MCP JSON-RPC)
- `diff` - reviewing model card changes in a diff before committing (through a dry run option)

## Contributing

PRs welcome. A few guidelines:

- **One concern per PR** - keep diffs reviewable
- Open an issue first for anything beyond a bug fix or small improvement
- `update_model_card` is the most sensitive tool - changes there should be tested against a real card; `dryRun: true` exists for this
- `trigger_gguf_quant` is experimental — the Space API is undocumented and may change. Auth requires a browser session cookie (`HF_GGUF_MY_SPACE_COOKIE`); see [GGUF Quantization Auth](#gguf-quantization-auth) for setup. Error output from the Space is surfaced directly in the job status

Bug reports: open an issue with the tool name, inputs (redact your token), and the error message or unexpected output.

## Changelog

### v1.1.0
- **Add** `trigger_gguf_quant` — trigger GGUF conversion via the ggml-org/gguf-my-repo Space. Non-blocking, returns a `jobId`. Auth via browser session cookie (`HF_GGUF_MY_SPACE_COOKIE`)
- **Add** `get_job_status` — unified job polling for both upload and quant jobs (replaces `get_model_upload_status` and `get_quant_job_status`)
- **Add** `manage_jobs` — unified job management for uploads and quant jobs (replaces `manage_upload_jobs`)
- **Refactor** Unified job store (`job-store.ts`) replacing separate upload and quant stores

### v1.0.3
- **Fix** `upload_model`: reordered directory stat check to prevent empty-repo bug on first upload; filtered hidden directories from upload set; switched `readFile` to Bun's lazy file stream
- **Fix** `inspect_repo` + `update_model_card`: frontmatter merge bug where user-supplied tags overwrote existing fields instead of merging with them
- **Fix** upload job management: added status filter support; improved archive file handling
- **Fix** auth: removed interactive login fallback, server now exits cleanly with a clear error when `HF_TOKEN` is missing

### v1.0.2
- npm publish workflow and CI setup
- No functional changes

### v1.0.1
- **Add** `update_model_card` — surgical section edits, frontmatter merges, and full rewrite mode. `dryRun` flag lets you review a diff before the agent commits changes
- **Add** `inspect_repo` now returns the full model card content alongside file verification
- **Add** `get_model_upload_status` — poll a background upload by `jobId`; shows phase, current file, and elapsed time
- **Add** `manage_upload_jobs` — list, delete, or batch-clean upload job history across active and dated archive files
- **Add** Upload jobs persist to `~/.hf_mcp/upload-jobs.json`; jobs interrupted mid-run are marked `Error` on next start rather than left stale
- **Add** Auth falls back to HF CLI token at `~/.cache/huggingface/token` if `HF_TOKEN` env var is not set

### v1.0.0
- Initial release: `list_model_repos`, `upload_model`, `inspect_repo`
