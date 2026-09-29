import type { Config } from "./config.js";
import { requireClientId } from "./config.js";
import {
  isExpired,
  readTokens,
  writeTokens,
  type StoredTokens,
} from "./tokenStore.js";

/**
 * Auth0 Device Authorization flow + refresh-token rotation.
 * Reference: https://auth0.com/docs/get-started/authentication-and-authorization-flow/device-authorization-flow
 */

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface OAuthError {
  error: string;
  error_description?: string;
}

export class AuthError extends Error {
  constructor(message: string, public readonly code: string = "auth_error") {
    super(message);
    this.name = "AuthError";
  }
}

export const NOT_LOGGED_IN_MESSAGE =
  "Not logged in to Seymour. Run `npm run login` in tools/seymour-mcp (or `node dist/login.js`), " +
  "approve the device code in your browser, then retry.";

function tokenUrl(config: Config): string {
  return `https://${config.auth0Domain}/oauth/token`;
}

async function postForm<T>(url: string, form: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = body as OAuthError | null;
    const code = err?.error ?? `http_${res.status}`;
    const desc = err?.error_description ?? text.slice(0, 200);
    throw new AuthError(`${code}: ${desc}`, code);
  }
  return body as T;
}

export async function requestDeviceCode(config: Config): Promise<DeviceCodeResponse> {
  return postForm<DeviceCodeResponse>(`https://${config.auth0Domain}/oauth/device/code`, {
    client_id: requireClientId(config),
    scope: config.auth0Scope,
    audience: config.auth0Audience,
  });
}

function toStored(config: Config, t: TokenResponse, previousRefresh?: string): StoredTokens {
  return {
    access_token: t.access_token,
    // Auth0 returns a new refresh token when rotation is on; keep the old one otherwise.
    refresh_token: t.refresh_token ?? previousRefresh,
    expires_at: Date.now() + t.expires_in * 1000,
    client_id: config.auth0ClientId,
    audience: config.auth0Audience,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Polls Auth0 until the user approves the device code, then persists the tokens.
 * `onStatus` receives progress lines for the terminal.
 */
export async function pollForDeviceToken(
  config: Config,
  device: DeviceCodeResponse,
  onStatus: (line: string) => void = () => {}
): Promise<StoredTokens> {
  const clientId = requireClientId(config);
  let intervalMs = Math.max(1, device.interval) * 1000;
  const deadline = Date.now() + device.expires_in * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    try {
      const t = await postForm<TokenResponse>(tokenUrl(config), {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: device.device_code,
        client_id: clientId,
      });
      const stored = toStored(config, t);
      await writeTokens(config.tokenPath, stored);
      return stored;
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
      switch (err.code) {
        case "authorization_pending":
          continue;
        case "slow_down":
          intervalMs += 5000;
          onStatus("Auth0 asked us to slow down; polling less often.");
          continue;
        case "expired_token":
          throw new AuthError("The device code expired before it was approved. Run login again.", err.code);
        case "access_denied":
          throw new AuthError("Login was denied in the browser.", err.code);
        default:
          throw err;
      }
    }
  }
  throw new AuthError("Timed out waiting for browser approval. Run login again.", "expired_token");
}

export async function refreshTokens(config: Config, current: StoredTokens): Promise<StoredTokens> {
  if (!current.refresh_token) {
    throw new AuthError(NOT_LOGGED_IN_MESSAGE, "no_refresh_token");
  }
  const t = await postForm<TokenResponse>(tokenUrl(config), {
    grant_type: "refresh_token",
    client_id: requireClientId(config),
    refresh_token: current.refresh_token,
  });
  const stored = toStored(config, t, current.refresh_token);
  await writeTokens(config.tokenPath, stored);
  return stored;
}

/**
 * Returns a valid access token, refreshing when needed. Throws AuthError with
 * NOT_LOGGED_IN_MESSAGE when there is nothing usable on disk.
 */
export class TokenProvider {
  private cache: StoredTokens | null = null;
  private inflight: Promise<StoredTokens> | null = null;

  constructor(private readonly config: Config) {}

  async getAccessToken(): Promise<string> {
    const tokens = await this.getTokens();
    return tokens.access_token;
  }

  async getTokens(): Promise<StoredTokens> {
    if (this.inflight) return this.inflight;
    this.inflight = this.resolve().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Drop the in-memory copy so the next call re-reads disk (used after a 401). */
  invalidate(): void {
    this.cache = null;
  }

  private async resolve(): Promise<StoredTokens> {
    let tokens = this.cache ?? (await readTokens(this.config.tokenPath));
    if (!tokens) throw new AuthError(NOT_LOGGED_IN_MESSAGE, "not_logged_in");
    if (
      tokens.client_id !== this.config.auth0ClientId ||
      tokens.audience !== this.config.auth0Audience
    ) {
      throw new AuthError(
        "Stored tokens were issued for a different Auth0 client or audience. Run login again.",
        "token_mismatch"
      );
    }
    if (isExpired(tokens)) {
      try {
        tokens = await refreshTokens(this.config, tokens);
      } catch (err) {
        if (err instanceof AuthError && (err.code === "invalid_grant" || err.code === "no_refresh_token")) {
          throw new AuthError(
            `Your Seymour login has expired or was revoked. ${NOT_LOGGED_IN_MESSAGE}`,
            err.code
          );
        }
        throw err;
      }
    }
    this.cache = tokens;
    return tokens;
  }
}

/** Best-effort decode of the JWT payload for a status readout. Never trusted for auth decisions. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
