/**
 * Server-only Auth0 credentials for embedded passwordless OTP.
 *
 * Auth0 allows grant type `http://auth0.com/oauth/grant-type/passwordless/otp`
 * only on Regular Web Applications and Native apps — not on SPA clients.
 * The browser SPA client still handles normal login; these credentials are
 * used only by Next.js API routes that proxy /passwordless/start (send=code)
 * and /oauth/token OTP exchange.
 */
const OTP_GRANT_TYPE = "http://auth0.com/oauth/grant-type/passwordless/otp";

export { OTP_GRANT_TYPE };

export interface PasswordlessServerCredentials {
  clientId: string;
  clientSecret: string;
}

export function getPasswordlessServerCredentials():
  | PasswordlessServerCredentials
  | { error: string } {
  const clientId = process.env.AUTH0_PASSWORDLESS_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTH0_PASSWORDLESS_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return {
      error:
        "Passwordless OTP is not configured. Set AUTH0_PASSWORDLESS_CLIENT_ID " +
        "and AUTH0_PASSWORDLESS_CLIENT_SECRET (Regular Web Application) on the server.",
    };
  }

  return { clientId, clientSecret };
}

/** Prefer the request Origin header so localhost ports match the browser. */
export function resolveRedirectUri(request: Request): string {
  const origin = request.headers.get("origin")?.trim();
  if (origin) return origin.replace(/\/$/, "");

  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  return "http://localhost:3000";
}
