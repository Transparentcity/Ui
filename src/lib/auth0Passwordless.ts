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
