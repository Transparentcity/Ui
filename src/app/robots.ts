import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/lib/siteUrl";

// Crawlers that fetch pages to train foundation models. We block these from
// the entire site. robots.txt is voluntary — see README / WAF for hard blocks.
const AI_TRAINING_BOTS = [
  "GPTBot", // OpenAI training
  "Google-Extended", // Gemini / Vertex training (separate from Googlebot)
  "ClaudeBot", // Anthropic training
  "anthropic-ai", // Legacy Anthropic UA
  "CCBot", // Common Crawl (feeds most open models)
  "Applebot-Extended", // Apple Intelligence training (separate from Applebot)
  "Bytespider", // ByteDance / TikTok
  "Meta-ExternalAgent", // Meta AI training
  "Amazonbot", // Amazon AI
  "cohere-ai",
  "Diffbot",
  "Omgilibot",
  "ImagesiftBot",
  "PanguBot", // Huawei
  "Timpibot",
  "YouBot",
];

// Retrieval / answer-engine bots. These cite pages live with attribution,
// matching our mission (surface civic data). Same access as human visitors.
const AI_ANSWER_ENGINE_BOTS = [
  "OAI-SearchBot", // ChatGPT Search crawler
  "ChatGPT-User", // On-demand fetches from ChatGPT
  "PerplexityBot", // Perplexity indexing
  "Perplexity-User", // Perplexity on-demand
  "Claude-Web", // Anthropic on-demand
];

const HUMAN_DISALLOW = [
  // App / auth
  "/home",
  "/settings",
  "/check-email",
  "/add-your-city",
  // Internal tools & admin
  "/debug",
  "/signals",
  "/applause",
  "/flags",
  "/analytics",
  "/anomalies",
  "/cityreadiness",
  "/research-queue",
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
];

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: HUMAN_DISALLOW,
      },
      ...AI_TRAINING_BOTS.map((userAgent) => ({
        userAgent,
        disallow: "/",
      })),
      ...AI_ANSWER_ENGINE_BOTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: HUMAN_DISALLOW,
      })),
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
