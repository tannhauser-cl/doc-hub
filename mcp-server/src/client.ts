/**
 * client.ts — HTTP client for the Apps Script Web App.
 *
 * Auth: token is sent as `token` field in the POST JSON body.
 * Apps Script Web Apps do not expose HTTP headers to doGet/doPost, so
 * the Authorization header is NOT used for backend auth. The token is
 * included in POST bodies only (GET endpoints are intentionally public/read-only).
 *
 * Resilience: all requests have a 30s timeout and up to 3 retries with
 * exponential backoff on network errors and 429/502/503/504 responses.
 */

import { ServerConfig } from "./config.js";
import { DocHubError } from "./types.js";

export interface AppsScriptClient {
  get(action: string, params?: Record<string, string>): Promise<unknown>;
  post(action: string, body: Record<string, unknown>): Promise<unknown>;
}

/** Shape the Apps Script engine returns on every response. */
interface EngineResponse {
  ok: boolean;
  data?: unknown;
  error?: DocHubError;
}

function buildJsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fetch with timeout (30 s) and exponential backoff on transient failures. */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(30_000),
      });
      // Retry on transient server errors; surface others immediately
      if (res.status === 429 || (res.status >= 502 && res.status <= 504)) {
        if (attempt === maxRetries) return res;
        await sleep(500 * Math.pow(3, attempt));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) throw err;
      await sleep(500 * Math.pow(3, attempt));
    }
  }
  throw lastError;
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();

  if (!res.ok) {
    let engineError: DocHubError | undefined;
    try {
      const parsed = JSON.parse(text) as Partial<EngineResponse>;
      if (parsed.error) engineError = parsed.error;
    } catch {
      // ignore parse failure
    }
    if (engineError) throw engineError;
    throw {
      code: "HTTP_ERROR",
      message: `HTTP ${res.status} ${res.statusText}`,
      details: text.slice(0, 500),
    } satisfies DocHubError;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw {
      code: "PARSE_ERROR",
      message: "Response from Apps Script Web App was not valid JSON.",
      details: text.slice(0, 500),
    } satisfies DocHubError;
  }

  // Unwrap {ok, data, error} envelope if present
  const envelope = parsed as Partial<EngineResponse>;
  if (typeof envelope === "object" && envelope !== null && "ok" in envelope) {
    if (envelope.ok === false && envelope.error) {
      throw envelope.error as DocHubError;
    }
    if (envelope.ok === true) {
      return envelope.data !== undefined ? envelope.data : envelope;
    }
  }

  return parsed;
}

export function makeClient(config: ServerConfig): AppsScriptClient {
  async function get(
    action: string,
    params?: Record<string, string>
  ): Promise<unknown> {
    const url = new URL(config.webAppUrl);
    url.searchParams.set("action", action);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetchWithRetry(url.toString(), {
      method: "GET",
      headers: buildJsonHeaders(),
    });

    return parseResponse(res);
  }

  async function post(
    action: string,
    body: Record<string, unknown>
  ): Promise<unknown> {
    // Token is passed in the POST body because Apps Script Web Apps
    // do not expose HTTP request headers to doPost(e).
    const payload: Record<string, unknown> = {
      action,
      ...(config.apiToken ? { token: config.apiToken } : {}),
      ...body,
    };

    const res = await fetchWithRetry(config.webAppUrl, {
      method: "POST",
      headers: buildJsonHeaders(),
      body: JSON.stringify(payload),
    });

    return parseResponse(res);
  }

  return { get, post };
}
