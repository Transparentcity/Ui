import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // App / auth
          "/home",
          "/settings",
          "/check-email",
          "/pro",
          // Internal tools & admin
          "/debug",
          "/signals",
          "/applause",
          "/flags",
          "/analytics",
          "/anomalies",
          "/cityreadiness",
          "/research-queue",
          "/feed-preview",
          // CRM / comms
          "/contacts",
          "/compose",
          "/campaigns",
          "/templates",
          "/keywords",
          "/responses",
          "/followups",
          "/send-queue",
          "/message-review",
          "/review-and-send",
          // Internal modules
          "/foia",
          "/waste",
          // API routes
          "/api",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
