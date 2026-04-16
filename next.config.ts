import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * Merge SENDGRID_* from another repo's `.env` (e.g. transparentcity-platform)
 * so API routes like `/api/welcome-email` see the same keys as the Python API.
 * Set TRANSPARENTCITY_PLATFORM_ENV_DIR to that repo's root. Never overrides
 * variables already set in this app's env or the shell.
 */
function mergeSendgridFromPlatformEnvDir(): void {
  const root = process.env.TRANSPARENTCITY_PLATFORM_ENV_DIR?.trim();
  if (!root) return;
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key.startsWith("SENDGRID_")) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    const existing = process.env[key];
    if (existing !== undefined && existing !== "") continue;
    process.env[key] = val;
  }
}

mergeSendgridFromPlatformEnvDir();

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone", // standalone for Docker/Cloud Run; disabled on Vercel
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8001",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    // Proxy all /api/* calls to the backend, avoiding browser CORS issues.
    // Next.js filesystem API routes (geocode, research, cityreadiness, etc.)
    // take priority over rewrites automatically, so the catch-all is safe.
    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
    return [
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
    ];
  },
};

export default nextConfig;
