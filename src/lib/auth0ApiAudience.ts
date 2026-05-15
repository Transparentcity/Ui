/**
 * Auth0 API audience for SPA access tokens. Must match the platform `AUTH0_AUDIENCE`.
 *
 * Some envs set only the API host (`https://api.transparent.city`) while the Auth0
 * resource identifier and FastAPI verification use the `/api` suffix. Normalizing
 * avoids JWT "audience mismatch" 401s on admin metrics and other API calls.
 */
export function getAuth0ApiAudience(): string {
  const raw = (process.env.NEXT_PUBLIC_AUTH0_AUDIENCE ?? "").trim();
  if (!raw) {
    return "https://api.transparent.city/api";
  }
  const base = raw.replace(/\/+$/, "");
  if (
    base === "https://api.transparent.city" ||
    base === "http://api.transparent.city"
  ) {
    return `${base}/api`;
  }
  return base;
}

/** Options for `getAccessTokenSilently` so the access token matches the API audience. */
export const AUTH0_API_ACCESS_TOKEN_OPTIONS = {
  authorizationParams: { audience: getAuth0ApiAudience() },
} as const;
