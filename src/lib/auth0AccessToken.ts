import type { GetTokenSilentlyOptions } from "@auth0/auth0-react";
import { OAuthError } from "@auth0/auth0-react";
import { AUTH0_API_ACCESS_TOKEN_OPTIONS } from "@/lib/auth0ApiAudience";

const RECOVERABLE_ERROR_CODES = new Set([
  "login_required",
  "consent_required",
  "missing_refresh_token",
  "invalid_grant",
]);

/**
 * Normalize Auth0 SPA error payloads (code + human-readable message).
 * Auth0 often throws `message: "Consent required"` without `error: "consent_required"`.
 */
export function getAuth0TokenErrorCode(error: unknown): string | null {
  if (error instanceof OAuthError) {
    return error.error.trim().toLowerCase().replace(/\s+/g, "_");
  }
  if (!error || typeof error !== "object") return null;
  const e = error as { error?: string; message?: unknown };
  if (typeof e.error === "string" && e.error.trim()) {
    return e.error.trim().toLowerCase().replace(/\s+/g, "_");
  }
  const msg = String(e.message ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!msg) return null;
  for (const code of RECOVERABLE_ERROR_CODES) {
    if (msg === code || msg.includes(code)) return code;
  }
  if (msg.includes("login") && msg.includes("required")) return "login_required";
  if (msg.includes("consent") && msg.includes("required")) return "consent_required";
  if (msg.includes("missing") && msg.includes("refresh")) {
    return "missing_refresh_token";
  }
  return null;
}

/** Auth0 SPA errors where we should renew the session (new refresh token). */
export function isRecoverableAuth0TokenError(error: unknown): boolean {
  const code = getAuth0TokenErrorCode(error);
  return code !== null && RECOVERABLE_ERROR_CODES.has(code);
}

export function getAuth0ReturnTo(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

let recoveryRedirectPromise: Promise<unknown> | null = null;

/** @internal Clears coalesced redirect state between unit tests. */
export function _resetAuth0AccessTokenRecoveryForTests(): void {
  recoveryRedirectPromise = null;
}

/**
 * Redirect to Auth0 to obtain a fresh access + refresh token pair.
 * Coalesces parallel callers so only one redirect is started.
 */
async function redirectToRenewSession(
  loginWithRedirect: (opts: object) => Promise<void>,
  errorCode: string | null
): Promise<string> {
  if (!recoveryRedirectPromise) {
    const authorizationParams: Record<string, string> = {
      ...AUTH0_API_ACCESS_TOKEN_OPTIONS.authorizationParams,
      scope: "openid profile email offline_access",
    };
    if (errorCode === "consent_required") {
      authorizationParams.prompt = "consent";
    }

    recoveryRedirectPromise = (async () => {
      try {
        await loginWithRedirect({
          appState: { returnTo: getAuth0ReturnTo() },
          authorizationParams,
        });
      } catch {
        recoveryRedirectPromise = null;
        throw new Error("Unable to start Auth0 session renewal.");
      }
      // Keep callers pending until navigation; avoid treating renewal as a query failure.
      await new Promise<string>(() => {});
    })();
  }
  return recoveryRedirectPromise as Promise<string>;
}

/**
 * Fetch an API access token, renewing the Auth0 session when refresh tokens
 * are missing or expired instead of surfacing a silent-auth error to the UI.
 */
export async function getApiAccessTokenSilently(
  getAccessTokenSilently: (
    options?: GetTokenSilentlyOptions
  ) => Promise<string>,
  loginWithRedirect: (opts: object) => Promise<void>,
  options?: GetTokenSilentlyOptions
): Promise<string> {
  try {
    const token = await getAccessTokenSilently({
      ...AUTH0_API_ACCESS_TOKEN_OPTIONS,
      ...options,
      authorizationParams: {
        ...AUTH0_API_ACCESS_TOKEN_OPTIONS.authorizationParams,
        ...options?.authorizationParams,
      },
    });
    if (!token?.trim()) {
      throw Object.assign(new Error("Not authenticated: no access token."), {
        error: "login_required",
      });
    }
    return token;
  } catch (error) {
    const code = getAuth0TokenErrorCode(error);
    if (code && RECOVERABLE_ERROR_CODES.has(code)) {
      return redirectToRenewSession(loginWithRedirect, code);
    }
    throw error;
  }
}
