import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { HF_MCP_DIR } from "./upload-job-store";
import { logger } from "../logger";

type StoredToken = {
    access_token: string;
    expires_at: number;
}

const HF_OAUTH_TOKEN_FILE = join(HF_MCP_DIR, "oauth-token.json");
const DEVICE_ENDPOINT = "https://huggingface.co/oauth/device";
const TOKEN_ENDPOINT = "https://huggingface.co/oauth/token";

async function loadCachedToken(): Promise<string | null> {
    try {
        const data = JSON.parse(await readFile(HF_OAUTH_TOKEN_FILE, "utf-8")) as StoredToken;
        if (data.expires_at > Date.now()) return data.access_token;
    } catch {}
    return null;
}

async function saveToken(access_token: string, expires_in: number): Promise<void> {
    await mkdir(HF_MCP_DIR, { recursive: true });
    const stored: StoredToken = { access_token, expires_at: Date.now() + expires_in * 1000 };
    await writeFile(HF_OAUTH_TOKEN_FILE, JSON.stringify(stored, null, 2));
}

async function pollForToken(device_code: string, clientId: string, pollMs: number, deadline: number, clientSecret?: string): Promise<void> {
    while (Date.now() < deadline) {
        await Bun.sleep(pollMs);

        const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
        if (clientSecret) headers["Authorization"] = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;

        const tokenRes = await fetch(TOKEN_ENDPOINT, {
            method: "POST",
            headers,
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code,
                client_id: clientId,
            }),
        });

        const json = await tokenRes.json() as { access_token?: string; expires_in?: number; error?: string };

        if (json.access_token) {
            await saveToken(json.access_token, json.expires_in ?? 28800);
            logger.info("HF OAuth token saved.");
            return;
        }

        if (json.error === "authorization_pending") continue;
        if (json.error === "slow_down") { await Bun.sleep(pollMs); continue; }
        logger.error({ error: json.error }, "OAuth polling failed.");
        return;
    }

    logger.error("OAuth device code expired without authorization.");
}

export async function startSpaceAuthFlow(clientId: string, clientSecret?: string): Promise<{ verification_uri: string; user_code: string }> {
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (clientSecret) headers["Authorization"] = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;

    const deviceRes = await fetch(DEVICE_ENDPOINT, {
        method: "POST",
        headers,
        body: new URLSearchParams({ client_id: clientId, scope: "openid profile" }),
    });
    if (!deviceRes.ok) throw new Error(`Device code request failed: ${deviceRes.status}`);

    const { device_code, user_code, verification_uri, expires_in, interval } = await deviceRes.json() as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        expires_in: number;
        interval: number;
    };

    const pollMs = (interval ?? 5) * 1000;
    const deadline = Date.now() + expires_in * 1000;

    // start polling in background — saves token when user approves
    pollForToken(device_code, clientId, pollMs, deadline, clientSecret);

    return { verification_uri, user_code };
}

export async function getSpaceOAuthToken(): Promise<string> {
    const cached = await loadCachedToken();
    if (cached) return cached;
    throw new Error("No valid HF OAuth token. Call gguf_space_auth_flow first.");
}
