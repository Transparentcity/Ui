/**
 * Get the API base URL based on environment.
 *
 * Browser (production): "" (empty — all /api/* calls go through Next.js
 *   rewrites which proxy to the backend, avoiding CORS issues)
 * Server-side (SSR/API routes): uses NEXT_PUBLIC_API_BASE_URL env var
 * Development: http://localhost:8001 (or from env var)
 */
function computeServerSideApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    return "https://api.transparent.city";
  }
  return "http://localhost:8001";
}

/**
 * Resolve the API origin for HTTP fetches.
 *
 * Prefer calling this at fetch time from client code. Do not rely on a stale
 * snapshot of `API_BASE` in the browser if the module was ever evaluated in a
 * non-browser context during tooling.
 */
export function getApiBaseUrl(): string {
  // Real browsers only (jsdom in tests counts too).
  if (globalThis.window?.location) {
    const hostname = globalThis.location.hostname;
    const onTransparentCitySite =
      hostname === "transparent.city" || hostname === "www.transparent.city";

    // Production build, or the live site host: always same-origin /api/* so
    // Next rewrites proxy to the backend (avoids cross-origin CORS to api.*).
    if (process.env.NODE_ENV === "production" || onTransparentCitySite) {
      return "";
    }

    const fromEnv = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
    if (fromEnv) {
      return fromEnv;
    }
    return "";
  }

  return computeServerSideApiBase();
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

