/**
 * config.ts — Read and validate MCP server configuration from environment variables.
 */

export interface ServerConfig {
  webAppUrl: string;
  apiToken: string | undefined;
  tenantId: string;
}

let _config: ServerConfig | null = null;

export function getConfig(): ServerConfig {
  if (_config) return _config;

  const webAppUrl = process.env["DOC_HUB_WEB_APP_URL"];
  if (!webAppUrl || webAppUrl.trim() === "") {
    throw new Error(
      "DOC_HUB_WEB_APP_URL is required. Set it to the deployed Apps Script Web App URL."
    );
  }

  // Basic URL validation
  try {
    new URL(webAppUrl);
  } catch {
    throw new Error(
      `DOC_HUB_WEB_APP_URL is not a valid URL: "${webAppUrl}"`
    );
  }

  const apiToken = process.env["DOC_HUB_API_TOKEN"] || undefined;
  if (!apiToken) {
    process.stderr.write(
      "[doc-hub] WARNING: DOC_HUB_API_TOKEN is not set. All POST requests to the Apps Script engine will fail with UNAUTHORIZED.\n"
    );
  }

  _config = {
    webAppUrl: webAppUrl.trim(),
    apiToken,
    tenantId: (process.env["DOC_HUB_TENANT_ID"] || "default").trim(),
  };

  return _config;
}

/**
 * Returns the created_by identifier for agent-originated actions.
 * Format: "agent:{tenantId}:{agentId}"
 */
export function agentId(agentLabel: string, config?: ServerConfig): string {
  const cfg = config ?? getConfig();
  return `agent:${cfg.tenantId}:${agentLabel}`;
}

/** Reset cached config — useful in tests. */
export function resetConfig(): void {
  _config = null;
}
