/**
 * Sends an Auth0 passwordless magic-link email while correctly storing the
 * PKCE transaction in localStorage so auth0-spa-js's handleRedirectCallback
 * can complete the code exchange when the user clicks through.
 *
 * Background: loginWithRedirect() with connection="email" redirects to Auth0's
 * hosted Universal Login page, which just shows a generic sign-in form rather
 * than automatically dispatching a magic link. This helper bypasses that by
 * calling /passwordless/start directly (via our Next.js proxy), but replicates
 * the exact PKCE transaction storage that auth0-spa-js expects so the callback
 * flow works identically to a normal loginWithRedirect.
 *
 * Transaction format reverse-engineered from auth0-spa-js 2.13.0:
 *   localStorage key : "a0.spajs.txs.<clientId>"
 *   value            : JSON.stringify({ state, nonce, code_verifier, scope,
 *                        audience, redirect_uri, appState, created_at })
 *
 * providers.tsx's clearStaleAuth0State() removes transactions where
 * created_at < Date.now() - 5min, so we include created_at: Date.now().
 * providers.tsx's shouldSkipRedirectCallback() looks for parsed.state === state
 * — the matching transaction means it returns false and lets Auth0Provider
 * handle the callback normally.
 */

function randomBase64url(byteLength: number): string {
  const arr = new Uint8Array(byteLength);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}


export interface PasswordlessMagicLinkOptions {
  email: string;
  clientId: string;
  audience?: string;
  appState?: Record<string, unknown>;
}

/**
 * Sends a passwordless magic-link email and stores the matching PKCE
 * transaction so auth0-spa-js can complete authentication when the link is
 * clicked. Throws on any error (caller should catch and show error UI).
 */
export async function sendPasswordlessMagicLink({
  email,
  clientId,
  audience,
  appState = { returnTo: "/home" },
}: PasswordlessMagicLinkOptions): Promise<void> {
  const codeVerifier = randomBase64url(32);
  const state = randomBase64url(32);
  const nonce = randomBase64url(32);
  const redirectUri = window.location.origin;
  // Passwordless email connection does not support offline_access / refresh tokens.
  const scope = "openid profile email";

  // Store transaction BEFORE calling the API so that if Auth0 delivers the
  // link faster than expected, the callback finds it.
  const txKey = `a0.spajs.txs.${clientId}`;
  const transaction = {
    state,
    nonce,
    code_verifier: codeVerifier,
    scope,
    audience: audience ?? "default",
    redirect_uri: redirectUri,
    appState,
    created_at: Date.now(), // required by clearStaleAuth0State in providers.tsx
  };
  localStorage.setItem(txKey, JSON.stringify(transaction));

  try {
    const response = await fetch("/api/auth/passwordless-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        connection: "email",
        email,
        send: "link",
        authParams: {
          scope,
          state,
          nonce,
          redirect_uri: redirectUri,
          response_type: "code",
          ...(audience ? { audience } : {}),
          // code_challenge is intentionally omitted. When present, Auth0 ties
          // the magic link to a Universal Login browser session that was never
          // created (we bypassed /authorize), which produces the "same device
          // and browser" error. Per RFC 7636 §4.6, Auth0 only verifies
          // code_verifier during token exchange when a code_challenge was
          // registered with the authorization — so omitting it here lets Auth0
          // issue a plain code that auth0-spa-js exchanges normally.
        },
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(
        (body?.error_description as string) ||
          (body?.error as string) ||
          `Auth0 responded with ${response.status}`
      );
    }
  } catch (err) {
    // Clean up the stored transaction so a retry can start fresh.
    localStorage.removeItem(txKey);
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Inline OTP passwordless flow
 *
 * Instead of a magic link (which is session-bound to the browser that called
 * /passwordless/start — impossible here because that call is server-side
 * proxied), we send a 6-digit code, collect it in the page, and exchange it via
 * the /oauth/token passwordless-OTP grant. That returns tokens directly, which
 * we write into auth0-spa-js's localStorage cache so useAuth0() recognizes the
 * session on the next navigation — no redirect, no "same device and browser".
 * ───────────────────────────────────────────────────────────────────────── */

// Must match the scope set on <Auth0Provider> in providers.tsx so the seeded
// cache key matches what getAccessTokenSilently() looks up.
const AUTH0_SPA_SCOPE = "openid profile email offline_access";
const CACHE_KEY_PREFIX = "@@auth0spajs@@";
const CACHE_KEY_ID_TOKEN_SUFFIX = "@@user@@";

// Standard OIDC/JWT claims auth0-spa-js excludes from the `user` object.
const NON_PROFILE_CLAIMS = new Set([
  "iss", "aud", "exp", "nbf", "iat", "jti", "azp", "nonce", "auth_time",
  "at_hash", "c_hash", "acr", "amr", "sub_jwk", "cnf", "sip_from_tag",
  "sip_date", "sip_callid", "sip_cseq_num", "sip_via_branch", "orig", "dest",
  "mky", "events", "toe", "txn", "rph", "sid", "vot", "vtm",
]);

interface Auth0TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in: number;
  scope?: string;
}

function urlDecodeB64(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(b64);
  // Handle UTF-8 payloads correctly.
  try {
    return decodeURIComponent(
      decoded
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    return decoded;
  }
}

function decodeIdToken(idToken: string): {
  claims: Record<string, unknown>;
  user: Record<string, unknown>;
} {
  const parts = idToken.split(".");
  const payload = JSON.parse(urlDecodeB64(parts[1])) as Record<string, unknown>;
  const claims: Record<string, unknown> = { __raw: idToken };
  const user: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    claims[key] = payload[key];
    if (!NON_PROFILE_CLAIMS.has(key)) {
      user[key] = payload[key];
    }
  }
  return { claims, user };
}

function buildCacheKey(
  clientId: string,
  audience: string | undefined,
  scope: string | undefined,
  suffix?: string
): string {
  return [CACHE_KEY_PREFIX, clientId, audience, scope, suffix]
    .filter(Boolean)
    .join("::");
}

/**
 * Writes an auth0-spa-js 2.x cache entry so that a subsequent page load with
 * <Auth0Provider> treats the user as authenticated. Format reverse-engineered
 * from auth0-spa-js 2.13.0 (cache/shared.ts, cache-manager.ts, LocalStorageCache).
 */
function seedAuth0SpaSession(params: {
  clientId: string;
  audience: string;
  tokens: Auth0TokenResponse;
}): void {
  const { clientId, audience, tokens } = params;
  const decodedToken = decodeIdToken(tokens.id_token);
  const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

  // Access-token entry, keyed by client/audience/scope.
  const accessKey = buildCacheKey(clientId, audience, AUTH0_SPA_SCOPE);
  const accessEntry = {
    body: {
      client_id: clientId,
      access_token: tokens.access_token,
      id_token: tokens.id_token,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      expires_in: tokens.expires_in,
      token_type: tokens.token_type ?? "Bearer",
      scope: AUTH0_SPA_SCOPE,
      audience,
      decodedToken,
    },
    expiresAt,
  };
  localStorage.setItem(accessKey, JSON.stringify(accessEntry));

  // Id-token entry (@@user@@), read by getUser() to populate isAuthenticated.
  const idKey = buildCacheKey(clientId, undefined, undefined, CACHE_KEY_ID_TOKEN_SUFFIX);
  localStorage.setItem(
    idKey,
    JSON.stringify({ id_token: tokens.id_token, decodedToken })
  );
}

export interface SendPasswordlessCodeOptions {
  email: string;
  clientId: string;
}

/** Sends a 6-digit passwordless email code (send: "code"). Throws on error. */
export async function sendPasswordlessCode({
  email,
  clientId,
}: SendPasswordlessCodeOptions): Promise<void> {
  const response = await fetch("/api/auth/passwordless-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      connection: "email",
      email,
      send: "code",
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(
      (body?.error_description as string) ||
        (body?.error as string) ||
        `Auth0 responded with ${response.status}`
    );
  }
}

export interface VerifyPasswordlessCodeOptions {
  email: string;
  otp: string;
  clientId: string;
  audience: string;
}

/**
 * Exchanges the emailed OTP for tokens and seeds the auth0-spa-js session so the
 * user is authenticated after the next navigation. Throws on invalid/expired
 * code (caller shows error UI).
 */
export async function verifyPasswordlessCode({
  email,
  otp,
  clientId,
  audience,
}: VerifyPasswordlessCodeOptions): Promise<void> {
  const response = await fetch("/api/auth/passwordless-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      otp,
      email,
      audience,
      // Passwordless email connections do not issue refresh tokens, so request
      // only the base scopes; the cache key still uses the provider scope.
      scope: "openid profile email",
    }),
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      (body?.error_description as string) ||
        (body?.error as string) ||
        `Auth0 responded with ${response.status}`
    );
  }

  if (!body?.access_token || !body?.id_token) {
    throw new Error("Auth0 did not return a valid session. Please try again.");
  }

  seedAuth0SpaSession({
    clientId,
    audience,
    tokens: body as unknown as Auth0TokenResponse,
  });
}

export interface GiftTrustedLoginOptions {
  token: string;
  clientId: string;
  audience: string;
}

/**
 * Trusted welcome-link activation: exchange the gift token for Auth0 tokens
 * without OTP when the click occurred within the email trust window.
 * Seeds the auth0-spa-js session and returns true on success.
 */
export async function giftTrustedLogin({
  token,
  clientId,
  audience,
}: GiftTrustedLoginOptions): Promise<void> {
  const redirectUri = window.location.origin.replace(/\/$/, "");

  const trustedRes = await fetch("/api/auth/gift-trusted-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      client_id: clientId,
      audience,
      redirect_uri: redirectUri,
    }),
  });

  const body = (await trustedRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!trustedRes.ok) {
    throw new Error(
      (body?.error_description as string) ||
        (body?.error as string) ||
        (body?.detail as string) ||
        `Gift trusted login failed: ${trustedRes.status}`
    );
  }

  if (!body?.access_token || !body?.id_token) {
    throw new Error("Gift trusted login did not return a valid session.");
  }

  seedAuth0SpaSession({
    clientId,
    audience,
    tokens: body as unknown as Auth0TokenResponse,
  });
}
