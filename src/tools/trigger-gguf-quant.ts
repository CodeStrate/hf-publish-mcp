import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { QUANT_TYPES, quantJobs, type QuantJob } from "../types/quant-job";
import { persistQuantJobs } from "../utils/quant-job-store";
import { getHFToken } from "../client";
import { logger } from "../logger";
import { getSpaceOAuthToken } from "../utils/gguf-space-oauth";

const GGML_BASE_URL = "https://ggml-org-gguf-my-repo.hf.space/gradio_api"

async function startSSEStream(sessionHash: string, jobId: string, accessToken: string, cookie: string) {
    try {
        const response = await fetch(`${GGML_BASE_URL}/queue/data?session_hash=${sessionHash}`, {
            headers: { Authorization: `Bearer ${accessToken}`, Cookie: `access-token=${cookie}` }
        });

        if (!response.ok) throw new Error(`SSE connect failed: ${response.status}`);

        for await (const chunk of response.body!) {
            const text = new TextDecoder().decode(chunk);

            // text lines are "data: {...json...}\n\n"

            for (const line of text.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            let event: any;
            try{
                event = JSON.parse(line.slice(6));
            }catch {continue;}

            const job = quantJobs.get(jobId);
            if (!job) return;

            if (event.msg === "process_starts"){
                job.jobStatus = "Running";
            }else if (event.msg === "process_completed"){
                job.completedAt = new Date();
                if (event.success){
                    job.jobStatus = "Completed";
                    const markdown:string = event.output?.data?.[0] ?? "";
                    const urlMatch = markdown.match(/https:\/\/huggingface\.co\/[\w\-./]+/);
                    if (urlMatch) job.outputRepoUrl = urlMatch[0];
                } else {
                    job.jobStatus = "Error";
                    job.error = event.output?.error ?? "Unknown error from HF Space.";
                }
                await persistQuantJobs();
                return;
            }
    

            }
        }
    }catch (error){
        const job = quantJobs.get(jobId);
        if (job) {
            job.jobStatus = "Error";
            job.error = String(error);
            await persistQuantJobs();
        }
        logger.error({error, jobId}, "SSE stream failed.")
    }
}   

export function registerTriggerGGUFQuant(server: McpServer){
    server.registerTool(
        "trigger_gguf_quant", {
            description: "Trigger GGUF quantization of a HuggingFace model via the ggml-org/gguf-my-repo Space. Converts a safetensors model to GGUF format. The output repo is automatically named {repo-name}-GGUF under the same owner — the name cannot be customized. Experimental — depends on Space availability.",
            inputSchema: {
                repoId: z.string().describe("Owner/repo-name of the model, e.g. google/gemma-4-12B. Must be in full merged safetensors format - raw adapters not supported."),
                quantType: z.enum(QUANT_TYPES).default("Q4_K_M").describe("GGUF quantization type. Q4_K_M (default) for best model quality/size tradeoff."),
                isPrivate: z.boolean().default(false).describe("Create the new quantized repo as private."),
                
            }
        },
        async ({ repoId, quantType, isPrivate }) => {
            logger.info({ repoId, quantType }, "triggering GGUF quant");
            try {
                const accessToken = getHFToken();
                const OAuthCookie = await getSpaceOAuthToken();
                const sessionHash = crypto.randomUUID();

                const response = await fetch(`${GGML_BASE_URL}/queue/join`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                        "Cookie": `access-token=${OAuthCookie}`,
                    },
                    //explaining body: HF Space has 13 endpoints from 0-12, we need 4th i.e. 3
                    // data is an array of exactly these values: [repoId, quantType, useImatrix, imatrixQuantType, privateRepo, trainingFile, splitModel, maxTensorsPerFile, maxFileSize]
                    // all values must be included even if we don't use them that's why we use false, null, "", etc.
                    body: JSON.stringify({
                        "fn_index": 3,
                        "data" : [repoId, quantType, false, "IQ4_NL", isPrivate, null, false, 1, ""], //splitModel is false, doesn't matter what number we put in maxTensors..
                        "session_hash" : sessionHash,
                    })
                })

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Space returned ${response.status}: ${text}`);
                }

                const { event_id: eventId } = z.object({ event_id: z.string() }).parse(await response.json());

                const jobId = crypto.randomUUID()

                const job: QuantJob = {
                    jobId,
                    sessionHash,
                    eventId,
                    jobStatus: "Queued",
                    repoId,
                    quantType,
                    isPrivate,
                    startedAt: new Date(),
                }

                quantJobs.set(jobId, job);
                await persistQuantJobs();

                startSSEStream(sessionHash, jobId, accessToken, OAuthCookie);

                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({ jobId, message: "Quant Job started. Use get_quant_job_status to track progress." }, null, 2),
                    }],
                };


            } catch (error){
                logger.error({ error }, `Failed to trigger GGUF quant for ${repoId}`);
                return {
                    isError: true,
                    content: [{ type: "text" as const, text: `Failed to trigger GGUF : ${error instanceof Error ? error.message : String(error)}` }],
                };
            }
        }
    )
}