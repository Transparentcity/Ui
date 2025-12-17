import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/api", "/debug"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
