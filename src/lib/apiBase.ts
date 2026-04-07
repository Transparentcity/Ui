/**
 * Get the API base URL based on environment.
 *
 * Browser (production): "" (empty — all /api/* calls go through Next.js
 *   rewrites which proxy to the backend, avoiding CORS issues)
 * Server-side (SSR/API routes): uses NEXT_PUBLIC_API_BASE_URL env var
 * Development: http://localhost:8001 (or from env var)
 */
export function getApiBaseUrl(): string {
  // Browser: prefer an explicit API origin when set so requests include Authorization
  // on a direct cross-origin call (CORS is allowed for localhost in the platform).
  // Otherwise use same-origin /api/* (Next.js rewrites proxy to the backend).
  if (typeof window !== "undefined") {
    const fromEnv = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
    if (fromEnv) {
      return fromEnv;
    }
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

/**
 * Base URL for public asset URLs (e.g. img src for map/chart images).
 * Always returns the full API origin so images load correctly in production
 * even when the app uses same-origin rewrites for fetch(). Use this for
 * <img src>, og:image, etc.
 */
export function getApiBaseUrlForAssets(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (base) return base.replace(/\/$/, "");
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    return "https://api.transparent.city";
  }
  return "http://localhost:8001";
}

export const API_BASE_FOR_ASSETS = getApiBaseUrlForAssets();

// Default city used by CRM pages; configurable via env.
export const CRM_DEFAULT_CITY_ID = Number(
  process.env.NEXT_PUBLIC_CRM_CITY_ID ?? 57260
);

