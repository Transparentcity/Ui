/**
 * Get the API base URL based on environment.
 *
 * Browser (production): "" (empty — all /api/* calls go through Next.js
 *   rewrites which proxy to the backend, avoiding CORS issues)
 * Server-side (SSR/API routes): uses NEXT_PUBLIC_API_BASE_URL env var
 * Development: http://localhost:8001 (or from env var)
 */
export function getApiBaseUrl(): string {
  // Browser: detect production and use same-origin proxy
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "app.transparent.city" || hostname === "transparent.city") {
      return "";
    }
  }

  // Server-side or dev: use explicit env var if set
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  // Fallback for server-side production (SSR, API routes)
  if (process.env.NODE_ENV === "production") {
    return "https://api.transparent.city";
  }

  // Development defaults to localhost
  return "http://localhost:8001";
}

// Export the API base URL as a constant
export const API_BASE = getApiBaseUrl();

// Default city used by CRM pages; configurable via env.
export const CRM_DEFAULT_CITY_ID = Number(
  process.env.NEXT_PUBLIC_CRM_CITY_ID ?? 57260
);

