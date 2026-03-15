/**
 * Get the API base URL based on environment.
 *
 * Browser: "" (empty) so all /api/* calls go through Next.js rewrites to the
 *   backend, avoiding CORS and "Failed to fetch" when UI and backend run on
 *   different ports.
 * Server-side: NEXT_PUBLIC_API_BASE_URL or production/development fallback.
 */
export function getApiBaseUrl(): string {
  // Browser: always use same-origin so Next.js rewrites proxy to the backend (avoids CORS / "Failed to fetch")
  if (typeof window !== "undefined") {
    return "";
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

