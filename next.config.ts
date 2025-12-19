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
    // Optional: Proxy API requests in development to avoid CORS issues
    if (process.env.NODE_ENV === "development") {
      // In development, use env var or default to localhost
      const apiBase =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
      return [
        {
          source: "/api/:path*",
          destination: `${apiBase}/api/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
