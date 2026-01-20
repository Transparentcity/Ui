import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // For Docker/Cloud Run compatibility if needed later
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
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
    // Proxy specific API paths to the backend in both dev and production.
    // Keeps /api/geocode, /api/research, /api/research-media, /api/reverse-geocode
    // as Next.js Route Handlers; only /api/maps and /api/public go to the backend.
    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
    return [
      { source: "/api/maps/:path*", destination: `${apiBase}/api/maps/:path*` },
      { source: "/api/public/:path*", destination: `${apiBase}/api/public/:path*` },
    ];
  },
};

export default nextConfig;
