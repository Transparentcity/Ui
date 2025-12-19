/**
 * Get the API base URL based on environment.
 * 
 * Production: https://api.transparent.city
 * Development: http://localhost:8001 (or from env var)
 */
export function getApiBaseUrl(): string {
  // If explicitly set, use it (highest priority)
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  // Detect production environment
  // Check multiple indicators for production
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL === "1" ||
    (typeof window !== "undefined" &&
      (window.location.hostname === "app.transparent.city" ||
        window.location.hostname === "transparent.city" ||
        window.location.hostname.endsWith(".vercel.app")));

  // Production defaults to api.transparent.city
  if (isProduction) {
    return "https://api.transparent.city";
  }

  // Development defaults to localhost
  return "http://localhost:8001";
}

// Export the API base URL as a constant
export const API_BASE = getApiBaseUrl();

