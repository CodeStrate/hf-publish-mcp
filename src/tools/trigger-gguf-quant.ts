import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getHFToken } from "../client";
import { logger } from "../logger";
import { jobsMap, persistJobs } from "../utils/job-store";
import { QuantJobSchema, type QuantJob } from "../types/job-schemas";
import { Client } from "@gradio/client";


type QuantParams = [string, string, boolean, string, boolean, null, boolean, number, string];

async function runQuantStream(client: Client, params: QuantParams, jobId: string) {
    logger.info({ jobId }, "runQuantStream started");
    const job = jobsMap.get(jobId)
    if (!job || job.jobType !== "quant") { client.close(); return; }

    try{
        // fn_index 3: convert endpoint — undocumented, fragile if ggml-org adds/removes endpoints
        const submission = client.submit(3, params);
        logger.info({ jobId }, "submitted, awaiting events");
        for await (const event of submission) {
        logger.info({ type: event.type, stage: (event as any).stage, success: (event as any).success }, "quant event");
        if (event.type === "status"){
            if (event.stage === "generating"){
                job.jobStatus = "Running"
            } else if (event.stage === "complete") {
                if (job.jobStatus !== "Done") {
                    job.completedAt = new Date();
                    job.jobStatus = event.success === false ? "Error" : "Done";
                    if (!event.success) job.error = event.code ?? "Unknown error from HF Space.";
                    persistJobs();
                }
                return;
            } else if (event.stage === "error"){
                job.completedAt = new Date();
                job.jobStatus = "Error"
                job.error = event.code ?? "Unknown Error from HF Space"
                persistJobs();
                return;
            }
        } else if (event.type === "data"){
            job.completedAt = new Date();
            const raw = typeof event.data[0] === "string" ? event.data[0] : "";
            const urlMatch = raw.match(/https:\/\/huggingface\.co\/[\w\-./]*[a-zA-Z0-9]/);
            if (urlMatch) {
                job.jobStatus = "Done";
                job.outputRepoUrl = urlMatch[0];
                logger.info({ jobId, outputRepoUrl: job.outputRepoUrl }, "quant done");
            } else {
                // No HF URL in output — treat as error regardless of emoji/format changes
                const preMatch = raw.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
                const errorText = preMatch
                    ? preMatch[1]!
                        .replace(/<br\/>/g, "\n")
                        .replace(/&gt;/g, ">").replace(/&lt;/g, "<")
                        .replace(/&quot;/g, '"').replace(/&amp;/g, "&")
                        .trim()
                    : raw.length > 0 ? "Conversion failed (see Space logs)" : "No output from Space";
                job.jobStatus = "Error";
                job.error = errorText;
                logger.error({ jobId, error: errorText.slice(0, 200) }, "quant conversion error");
            }
            persistJobs();
            return;
        }
        }
    }catch(error) {
        if (job && job.jobType === "quant"){
            job.completedAt = new Date();
            job.jobStatus = "Error";
            job.error = String(error)
            persistJobs();
        }
        logger.error({error, jobId}, "Quant stream failed.")
    } finally {
        client.close();
    }
    
}

export function registerTriggerGGUFQuant(server: McpServer){
    server.registerTool(
        "trigger_gguf_quant", {
            description: "Trigger GGUF quantization of a HuggingFace model via the ggml-org/gguf-my-repo Space. Converts a safetensors model to GGUF format. The output repo is automatically named {repo-name}-GGUF under the same owner — the name cannot be customized. Experimental — depends on Space availability.",
            inputSchema: {
                repoId: z.string().describe("Owner/repo-name of the model, e.g. google/gemma-4-12B. Must be in full merged safetensors format - raw adapters not supported."),
                quantType: QuantJobSchema.shape.quantType.default("Q4_K_M").describe("GGUF quantization type. Q4_K_M (default) for best model quality/size tradeoff."),
                isPrivate: z.boolean().default(false).describe("Create the new quantized repo as private."),
                
            }
        },
        async ({ repoId, quantType, isPrivate }) => {
            logger.info({ repoId, quantType }, "triggering GGUF quant");
            try {
                const sessionCookie = process.env.HF_GGUF_MY_SPACE_COOKIE;
                if (!sessionCookie) {
                    return {
                        isError: true,
                        content: [{ type: "text" as const, text: "HF_GGUF_MY_SPACE_COOKIE is not set. Log in at https://ggml-org-gguf-my-repo.hf.space, then copy the 'session' cookie value from DevTools → Application → Cookies and add it to your MCP env config." }],
                    };
                }
                const accessToken = getHFToken();
                const client = await Client.connect("ggml-org/gguf-my-repo", {
                    token: accessToken as `hf_${string}`,
                    cookies: `session=${sessionCookie}`,
                    status_callback: (status) => logger.debug({status}, "space status")
                });

                const jobId = crypto.randomUUID()

                const job: QuantJob = {
                    jobId,
                    jobType: "quant",
                    jobStatus: "Pending",
                    repoId,
                    quantType,
                    isPrivate,
                    startedAt: new Date(),
                }

                jobsMap.set(jobId, job);

                persistJobs();

                const quantParams: QuantParams = [repoId, quantType, false, "IQ4_NL", isPrivate, null, false, 1, ""];
                runQuantStream(client, quantParams, jobId)
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({ jobId, message: "Quant Job started. Use get_job_status to track progress." }, null, 2),
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