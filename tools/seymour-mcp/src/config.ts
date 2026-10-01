import os from "node:os";
import path from "node:path";

/**
 * Runtime configuration, all from environment variables so nothing secret
 * lives in the repo. Only SEYMOUR_AUTH0_CLIENT_ID is required; it is the
 * public client id of the "Seymour MCP" Native application in Auth0.
 */
export interface Config {
  auth0Domain: string;
  auth0ClientId: string;
  auth0Audience: string;
  auth0Scope: string;
  apiBase: string;
  defaultModelKey: string;
  defaultToolGroups: string[];
  tokenPath: string;
  requestTimeoutMs: number;
}

export const DEFAULT_AUTH0_DOMAIN = "auth.transparent.city";
export const DEFAULT_AUDIENCE = "https://api.transparent.city/api";
export const DEFAULT_API_BASE = "https://api.transparent.city";
export const DEFAULT_MODEL_KEY = "claude-sonnet-5.5";
/** Chat-only groups. "email" and "foia" must be requested explicitly per call. */
export const DEFAULT_TOOL_GROUPS = ["core", "research", "web_search"];
export const DEFAULT_SCOPE = "openid profile email offline_access";

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const auth0ClientId = (env.SEYMOUR_AUTH0_CLIENT_ID ?? "").trim();
  const rawDomain = (env.SEYMOUR_AUTH0_DOMAIN ?? DEFAULT_AUTH0_DOMAIN).trim();
  const auth0Domain = trimSlash(rawDomain.replace(/^https?:\/\//, ""));
  const rawAudience = (env.SEYMOUR_AUTH0_AUDIENCE ?? DEFAULT_AUDIENCE).trim();
  const apiBase = trimSlash((env.SEYMOUR_API_BASE ?? DEFAULT_API_BASE).trim());
  const groups = (env.SEYMOUR_DEFAULT_TOOL_GROUPS ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  const timeout = Number(env.SEYMOUR_REQUEST_TIMEOUT_MS ?? "");

  return {
    auth0Domain,
    auth0ClientId,
    auth0Audience: normalizeAudience(rawAudience),
    auth0Scope: DEFAULT_SCOPE,
    apiBase,
    defaultModelKey: (env.SEYMOUR_DEFAULT_MODEL ?? DEFAULT_MODEL_KEY).trim(),
    defaultToolGroups: groups.length ? groups : DEFAULT_TOOL_GROUPS,
    tokenPath:
      (env.SEYMOUR_MCP_TOKEN_PATH ?? "").trim() ||
      path.join(os.homedir(), ".config", "seymour-mcp", "tokens.json"),
    requestTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 300_000,
  };
}

/**
 * Mirrors src/lib/auth0ApiAudience.ts in the UI: the API verifies tokens
 * against the "/api" resource identifier, so a bare host is normalized.
 */
export function normalizeAudience(raw: string): string {
  const base = trimSlash(raw);
  if (
    base === "https://api.transparent.city" ||
    base === "http://api.transparent.city"
  ) {
    return `${base}/api`;
  }
  return base;
}

export function requireClientId(config: Config): string {
  if (!config.auth0ClientId) {
    throw new Error(
      "SEYMOUR_AUTH0_CLIENT_ID is not set. Create a Native application in Auth0 " +
        "(Device Authorization + Refresh Token grants) and export its Client ID."
    );
  }
  return config.auth0ClientId;
}
