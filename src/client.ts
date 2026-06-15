import { whoAmI } from "@huggingface/hub";

export const HF_API_BASE_URL = "https://huggingface.co/api";

export function getHFToken(): string {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("HF_TOKEN is not set in the environment.");
  return token;
}

let _username: string | null = null;

export async function getHFUsername(): Promise<string> {
  if (_username) return _username;
  const info = await whoAmI({ accessToken: getHFToken() });
  _username = info.name;
  return _username;
}

export async function hfFetch(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${getHFToken()}` },
  });
  if (!response.ok) {
    throw new Error(`HF API ${response.status}: ${response.statusText}`);
  }
  return response.json();
}
