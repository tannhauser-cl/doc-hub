/**
 * client.ts — HTTP client for the Apps Script Web App.
 *
 * All requests are authenticated with a Bearer token when configured.
 * GET requests use query parameters (?action=X&key=value).
 * POST requests send a JSON body with the action field included.
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

function buildHeaders(config: ServerConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (config.apiToken) {
    headers["Authorization"] = `Bearer ${config.apiToken}`;
  }
  return headers;
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();

  if (!res.ok) {
    // Non-2xx HTTP status — try to parse an engine error envelope, else throw generic
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

  // If the engine wraps responses in {ok, data, error} envelope, unwrap it.
  const envelope = parsed as Partial<EngineResponse>;
  if (typeof envelope === "object" && envelope !== null && "ok" in envelope) {
    if (envelope.ok === false && envelope.error) {
      throw envelope.error as DocHubError;
    }
    if (envelope.ok === true) {
      return envelope.data !== undefined ? envelope.data : envelope;
    }
  }

  // No envelope — return raw parsed value
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

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: buildHeaders(config),
    });

    return parseResponse(res);
  }

  async function post(
    action: string,
    body: Record<string, unknown>
  ): Promise<unknown> {
    const res = await fetch(config.webAppUrl, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify({ action, ...body }),
    });

    return parseResponse(res);
  }

  return { get, post };
}
