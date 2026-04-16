import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/apiBase";
import { sendEmail, isSendGridConfigured } from "@/lib/email-sender";
import { getSiteOrigin } from "@/lib/siteUrl";
import { slugify } from "@/lib/utils";

interface StoryFromApi {
  id: number;
  story_type: string;
  city_id: number;
  city_name?: string | null;
  city_emoji?: string | null;
  headline: string;
  description: string;
  short_hash?: string | null;
  canonical_path?: string | null;
  public_url?: string | null;
}

interface FeedResponse {
  stories: StoryFromApi[];
  count: number;
}

/**
 * Pick 5 stories from different cities with diverse story types.
 * Prefers variety: one story per city, spread across story types.
 */
function pickDiverseStories(stories: StoryFromApi[], count: number): StoryFromApi[] {
  const picked: StoryFromApi[] = [];
  const seenCities = new Set<number>();
  const seenTypes = new Set<string>();

  // First pass: one per city, diverse types
  for (const s of stories) {
    if (picked.length >= count) break;
    if (seenCities.has(s.city_id)) continue;
    if (seenTypes.has(s.story_type) && picked.length < stories.length - 1) continue;
    picked.push(s);
    seenCities.add(s.city_id);
    seenTypes.add(s.story_type);
  }

  // Second pass: fill remaining slots (different cities still preferred)
  if (picked.length < count) {
    for (const s of stories) {
      if (picked.length >= count) break;
      if (picked.some((p) => p.id === s.id)) continue;
      if (!seenCities.has(s.city_id)) {
        picked.push(s);
        seenCities.add(s.city_id);
      }
    }
  }

  // Third pass: just fill whatever's left
  if (picked.length < count) {
    for (const s of stories) {
      if (picked.length >= count) break;
      if (picked.some((p) => p.id === s.id)) continue;
      picked.push(s);
    }
  }

  return picked;
}

function storyUrl(story: StoryFromApi, siteOrigin: string): string {
  if (story.public_url) return story.public_url;
  if (story.canonical_path) return `${siteOrigin}${story.canonical_path}`;
  if (story.short_hash) return `${siteOrigin}/s/${story.short_hash}`;
  return siteOrigin;
}

function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "...";
}

/** Escape HTML special characters to prevent injection in email templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function typeEmoji(storyType: string): string {
  const map: Record<string, string> = {
    alert: "🔴",
    trend: "📊",
    spending: "💰",
    justice: "⚖️",
    safety: "🚨",
    multi_metric: "📋",
    off_the_charts: "🤯",
    comparison: "🔄",
    milestone: "🎯",
    traction: "🌟",
    business: "🏪",
    "311_images": "📸",
    context: "🧭",
  };
  return map[storyType] || "📰";
}

function buildEmailHtml(
  stories: StoryFromApi[],
  cityName: string | null,
  citySlug: string | null,
  siteOrigin: string,
): string {
  const isMultiCity = !cityName;

  const safeCityName = cityName ? escapeHtml(cityName) : null;

  const heading = safeCityName
    ? `Welcome! Here's what's happening in ${safeCityName}.`
    : "Welcome! Here's a taste of what we cover.";

  const subtext = "Your first weekly briefing is on its way.";

  const pathSegment = citySlug || (cityName ? slugify(cityName) : "");
  const ctaUrl = pathSegment
    ? `${siteOrigin}/c/${encodeURIComponent(pathSegment)}`
    : siteOrigin;

  const ctaLabel = safeCityName
    ? `Explore ${safeCityName}`
    : "Explore all cities";

  const storyRows = stories
    .map((s) => {
      const emoji = typeEmoji(s.story_type);
      const url = escapeHtml(storyUrl(s, siteOrigin));
      const desc = escapeHtml(truncate(s.description, 120));
      const headline = escapeHtml(s.headline);
      const cityTag = isMultiCity && s.city_name
        ? `<div style="font-size:11px;font-weight:600;color:#6B46C1;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${escapeHtml(s.city_emoji || "")} ${escapeHtml(s.city_name)}</div>`
        : "";

      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #f0f0f0;">
            ${cityTag}<a href="${url}" style="color:#1a1a1a;text-decoration:none;font-weight:600;font-size:15px;line-height:1.35;">${emoji} ${headline}</a>
            <div style="color:#555;font-size:13px;line-height:1.5;margin-top:4px;">${desc}</div>
          </td>
        </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:24px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 24px 0;">
              <div style="font-size:12px;color:#888;font-weight:600;letter-spacing:0.5px;margin-bottom:12px;">TRANSPARENT.CITY</div>
              <h1 style="margin:0 0 8px;font-size:20px;color:#1a1a1a;font-weight:700;line-height:1.3;">${heading}</h1>
              <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.5;">${subtext}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${storyRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;text-align:center;">
              <a href="${ctaUrl}" style="display:inline-block;background:#6B46C1;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
                ${ctaLabel}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 24px 24px;text-align:center;color:#999;font-size:12px;line-height:1.5;">
              You signed up at <a href="${siteOrigin}" style="color:#999;">Transparent.city</a><br/>
              <a href="${siteOrigin}/settings/feed" style="color:#999;">Manage preferences</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest): Promise<Response> {
  // Only allow calls from the same origin or Vercel preview deployments.
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  const siteOriginForAuth = getSiteOrigin();
  const isAllowed =
    origin.startsWith(siteOriginForAuth) ||
    origin.includes(".vercel.app") ||
    origin.startsWith("http://localhost");
  if (!isAllowed) {
    console.warn("[welcome-email] Blocked origin:", origin, "expected:", siteOriginForAuth);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { email?: string; cityId?: number; citySlug?: string; cityName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, cityId, citySlug, cityName } = body;
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  if (!isSendGridConfigured()) {
    return NextResponse.json(
      { error: "Email sending not configured" },
      { status: 503 },
    );
  }

  const apiBase = getApiBaseUrl();
  const siteOrigin = getSiteOrigin();

  // Fetch stories
  let stories: StoryFromApi[] = [];
  try {
    const params = new URLSearchParams({ limit: "20" });
    if (cityId) {
      params.set("city_id", String(cityId));
      params.set("limit", "5");
    } else {
      params.set("all_cities", "true");
    }

    const res = await fetch(`${apiBase}/api/feed/public?${params}`, {
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data: FeedResponse = await res.json();
      stories = cityId
        ? data.stories.slice(0, 5)
        : pickDiverseStories(data.stories, 5);
    } else {
      console.error("[welcome-email] Feed API returned", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[welcome-email] Failed to fetch stories:", err);
  }

  if (stories.length === 0) {
    console.warn("[welcome-email] No stories found for", { email, cityId }, "- skipping email");
    return NextResponse.json({ sent: false, reason: "no_stories" });
  }

  const subject = cityName
    ? `Welcome! Here's what's happening in ${cityName}`
    : "Welcome to Transparent.city";

  const html = buildEmailHtml(stories, cityName ?? null, citySlug ?? null, siteOrigin);

  const result = await sendEmail({ to: email, subject, body: html });

  if (!result.success) {
    console.error("[welcome-email] SendGrid error:", result.error);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ sent: true, messageId: result.messageId });
}
