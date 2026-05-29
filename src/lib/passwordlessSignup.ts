/**
 * Passwordless (magic link) signup via Auth0 `connection: "email"`.
 *
 * Two flavors live here:
 *  1. `startPasswordlessEmailSignup` – legacy path that uses Auth0
 *     Universal Login (`loginWithRedirect`). Kept for surfaces that
 *     still need Auth0's hosted login chrome.
 *  2. `sendPasswordlessEmailLink` – preferred path. Calls Auth0's
 *     `/passwordless/start` endpoint directly so the user stays on the
 *     current page and we can show an inline "check your inbox"
 *     confirmation. The magic link in the email lands back at the SPA
 *     and auth0-spa-js's `handleRedirectCallback` finishes the flow
 *     using the transaction we plant in sessionStorage.
 *
 * Do not pass `redirect_uri` to `loginWithRedirect` – Auth0Provider sets
 * it from `window.location.origin`. Use a narrower scope than the default
 * provider (omit `offline_access`), which can break passwordless authorize
 * requests when refresh tokens are not enabled for the email connection.
 */

import { getAuth0ApiAudience } from "./auth0ApiAudience";
import {
  persistAuth0LoginTransaction,
  type Auth0LoginTransaction,
} from "./auth0TransactionStorage";
import {
  getFunnelSessionId,
  recordFunnelEventBackend,
  trackSignupClick,
  trackSignupStart,
  type SignupEventContext,
} from "./analytics";

const POST_LOGIN_RETURN_KEY = "auth_return_after_check_email";

/** Scope used for the passwordless authorize/exchange. Must NOT include
 * `offline_access` – refresh tokens are not enabled for the email
 * connection in our tenant and Auth0 will reject the authorize call. */
const PASSWORDLESS_SCOPE = "openid profile email";

export type PasswordlessSignupOptions = {
  email: string;
  sourceSurface: string;
  signupIntent?: "resident" | "public-servant";
  citySlug?: string;
  cityName?: string;
  cityId?: number | null;
  /** Stored for /check-email → post-auth redirect (defaults to current path). */
  returnAfterCheckEmail?: string;
};

function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.includes("@");
}

/**
 * Inline magic links need Auth0's passwordless session cookie in the browser.
 * That cookie is only set reliably when /passwordless/start runs with
 * credentials on a host that is same-site with auth.*.transparent.city.
 * localhost and preview hosts are cross-site → use Auth0 hosted passwordless.
 */
export function requiresHostedPasswordlessFlow(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.endsWith(".localhost")) return true;
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

/** Production *.transparent.city can use credentialed /passwordless/start. */
function shouldPasswordlessStartUseCredentials(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "transparent.city" || host.endsWith(".transparent.city");
}

export function persistPasswordlessSignupContext(
  options: PasswordlessSignupOptions
): SignupEventContext {
  const intent = options.signupIntent ?? "resident";
  const ctx: SignupEventContext = {
    source_surface: options.sourceSurface,
    signup_intent: intent,
    city_slug: options.citySlug ?? null,
    city_name: options.cityName ?? null,
    city_id: options.cityId ?? null,
    district: null,
    landing_path:
      typeof window !== "undefined" ? window.location.pathname : null,
    funnel_session_id: getFunnelSessionId(),
  };

  if (typeof window === "undefined") return ctx;

  window.localStorage.setItem("transparentcity.signup_intent", intent);
  window.localStorage.setItem("transparentcity.signup_surface", options.sourceSurface);
  if (options.citySlug) {
    window.localStorage.setItem("transparentcity.follow_city_slug", options.citySlug);
  }
  if (options.cityName) {
    window.localStorage.setItem("transparentcity.follow_city_name", options.cityName);
  }
  if (options.cityId != null) {
    window.localStorage.setItem("transparentcity.follow_city_id", String(options.cityId));
  }

  const returnPath =
    options.returnAfterCheckEmail ??
    window.location.pathname + window.location.search;
  if (returnPath && returnPath !== "/check-email") {
    try {
      sessionStorage.setItem(POST_LOGIN_RETURN_KEY, returnPath);
    } catch {
      /* ignore */
    }
  }

  trackSignupStart(intent, ctx);
  trackSignupClick(intent, ctx);
  recordFunnelEventBackend("signup_start", ctx);

  return ctx;
}

export async function startPasswordlessEmailSignup(
  loginWithRedirect: (opts: object) => Promise<void>,
  options: PasswordlessSignupOptions
): Promise<void> {
  const email = options.email.trim();
  if (!isValidEmail(email)) {
    throw new Error("A valid email address is required.");
  }

  persistPasswordlessSignupContext(options);

  const returnTo =
    options.returnAfterCheckEmail ??
    (typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/check-email");

  await loginWithRedirect({
    authorizationParams: {
      connection: "email",
      login_hint: email,
      scope: PASSWORDLESS_SCOPE,
    },
    appState: { returnTo },
  });
}

/** Scroll to the get-landing hero email field and focus it. */
export function focusGetLandingHeroSignup(): void {
  if (typeof window === "undefined") return;
  const anchor = document.getElementById("get-hero-signup");
  if (!anchor) return;
  anchor.scrollIntoView({ behavior: "smooth", block: "center" });
  const input = anchor.querySelector('input[type="email"]');
  if (input instanceof HTMLInputElement) {
    window.setTimeout(() => input.focus(), 300);
  }
}

/* ─────────────────────────────────────────────────────────────────────
 * Inline magic-link flow — send email via /passwordless/start directly
 * so the user never leaves the current page.
 * ───────────────────────────────────────────────────────────────────── */

export class PasswordlessSendError extends Error {
  public code: string;
  public detail?: string;
  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = "PasswordlessSendError";
    this.code = code;
    this.detail = detail;
  }
}

const PKCE_VERIFIER_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function randomString(byteLength = 43): string {
  const arr = new Uint8Array(byteLength);
  window.crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    out += PKCE_VERIFIER_ALPHABET[arr[i] % PKCE_VERIFIER_ALPHABET.length];
  }
  return out;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(input: string): Promise<ArrayBuffer> {
  const data = new TextEncoder().encode(input);
  return window.crypto.subtle.digest("SHA-256", data);
}

function readAuth0Config(): { domain: string; clientId: string } {
  const domain = (process.env.NEXT_PUBLIC_AUTH0_DOMAIN ?? "").trim();
  const clientId = (process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID ?? "").trim();
  if (!domain || !clientId) {
    throw new PasswordlessSendError(
      "missing_config",
      "Auth0 is not configured for this environment.",
      "NEXT_PUBLIC_AUTH0_DOMAIN and NEXT_PUBLIC_AUTH0_CLIENT_ID must be set."
    );
  }
  return { domain, clientId };
}

/**
 * Send a passwordless magic-link email directly from the browser via
 * Auth0's `/passwordless/start` endpoint. The user stays on the current
 * page; the caller is responsible for rendering a "check your inbox"
 * confirmation.
 *
 * The magic link in the email returns the user to `window.location.origin`
 * with `code` + `state` params; auth0-spa-js (via Auth0Provider) finishes
 * the exchange because we plant a matching transaction in sessionStorage.
 */
export async function sendPasswordlessEmailLink(
  options: PasswordlessSignupOptions
): Promise<void> {
  const email = options.email.trim();
  if (!isValidEmail(email)) {
    throw new PasswordlessSendError(
      "invalid_email",
      "Please enter a valid email address."
    );
  }

  if (typeof window === "undefined") {
    throw new PasswordlessSendError(
      "no_window",
      "Passwordless signup must run in the browser."
    );
  }

  if (requiresHostedPasswordlessFlow()) {
    throw new PasswordlessSendError(
      "hosted_required",
      "On localhost, use the Auth0 email sign-in page so your magic link works in this browser.",
      "Call startPasswordlessEmailSignup instead of sendPasswordlessEmailLink."
    );
  }

  const { domain, clientId } = readAuth0Config();
  const audience = getAuth0ApiAudience();
  const redirectUri = window.location.origin;

  const state = randomString(43);
  const nonce = randomString(43);
  const code_verifier = randomString(43);
  const code_challenge = bufferToBase64Url(await sha256(code_verifier));

  const returnTo =
    options.returnAfterCheckEmail ??
    window.location.pathname + window.location.search;

  // Persist analytics + follow-city context (writes localStorage, fires GA).
  persistPasswordlessSignupContext(options);

  // Plant the auth0-spa-js transaction so handleRedirectCallback finishes
  // the PKCE exchange when the user comes back via the magic link.
  const transaction: Auth0LoginTransaction = {
    nonce,
    code_verifier,
    scope: PASSWORDLESS_SCOPE,
    audience,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    appState: { returnTo },
  };
  persistAuth0LoginTransaction(clientId, transaction);

  const body = {
    client_id: clientId,
    connection: "email",
    email,
    send: "link",
    authParams: {
      scope: PASSWORDLESS_SCOPE,
      response_type: "code",
      redirect_uri: redirectUri,
      state,
      nonce,
      code_challenge,
      code_challenge_method: "S256",
      audience,
    },
  };

  const auth0Endpoint = `https://${domain}/passwordless/start`;
  const proxyEndpoint = "/api/auth/passwordless-start";
  const useCredentials = shouldPasswordlessStartUseCredentials();

  let response: Response;
  try {
    response = await fetch(auth0Endpoint, {
      method: "POST",
      credentials: useCredentials ? "include" : "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (useCredentials) {
      throw new PasswordlessSendError(
        "cors_config",
        "Could not reach Auth0 with a secure session. Add this site to Auth0 Allowed Web Origins, or use “Send link via secure sign-in page”.",
        err instanceof Error ? err.message : String(err)
      );
    }
    try {
      response = await fetch(proxyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (proxyErr) {
      throw new PasswordlessSendError(
        "network_error",
        "We couldn’t reach Auth0 to send your link. Please try again.",
        proxyErr instanceof Error ? proxyErr.message : String(proxyErr)
      );
    }
  }

  // Read the raw body once so we can parse it for both success and error
  // shapes (Auth0 occasionally returns 2xx with an error payload, and even
  // a healthy success body is useful when debugging dashboard misconfig).
  const rawBody = await response.text();
  let parsed: Record<string, unknown> | null = null;
  if (rawBody) {
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      /* non-JSON body is treated as opaque */
    }
  }

  const errorCode =
    (parsed?.error as string | undefined) ??
    (parsed?.code as string | undefined);
  const errorDescription =
    (parsed?.error_description as string | undefined) ??
    (parsed?.description as string | undefined) ??
    (typeof parsed?.message === "string"
      ? (parsed.message as string)
      : undefined);

  if (process.env.NODE_ENV !== "production") {
    /* eslint-disable no-console */
    console.groupCollapsed(
      `[passwordless] /passwordless/start → ${response.status}`
    );
    console.log("endpoint:", auth0Endpoint, "or", proxyEndpoint);
    console.log("request:", body);
    console.log("response status:", response.status);
    console.log("response body:", parsed ?? rawBody);
    console.groupEnd();
    /* eslint-enable no-console */
  }

  if (!response.ok || errorCode) {
    throw new PasswordlessSendError(
      "auth0_error",
      errorDescription ??
        errorCode ??
        `Auth0 returned ${response.status} but couldn’t send the link.`,
      errorDescription ?? errorCode ?? rawBody
    );
  }

  // Auth0 returns the queued passwordless ticket on success — typically
  // { _id, email, email_verified }. If we got 2xx but neither an error
  // nor any recognisable ticket fields, the connection is likely
  // misconfigured (e.g. wrong tenant default email provider).
  const looksLikeSuccess =
    parsed &&
    (typeof parsed._id === "string" ||
      typeof parsed.email === "string" ||
      parsed.email_verified !== undefined);
  if (!looksLikeSuccess && process.env.NODE_ENV !== "production") {
    /* eslint-disable-next-line no-console */
    console.warn(
      "[passwordless] /passwordless/start returned a non-standard 2xx body. " +
        "If the email never arrives, check Auth0 Dashboard → Monitoring → " +
        "Logs and confirm the Email passwordless connection is enabled for " +
        "this SPA application."
    );
  }
}
