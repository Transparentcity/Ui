import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/apiBase";
import { sendEmail, isSendGridConfigured } from "@/lib/email-sender";
import { getSiteOrigin } from "@/lib/siteUrl";

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
  const heading = cityName
    ? `Here's what's happening in ${cityName}`
    : "Here's a taste of what we cover";

  const subheading = cityName
    ? "Your first weekly briefing is on its way. In the meantime, here are recent stories from your city."
    : "Your first weekly briefing is on its way. Here are recent stories from cities we cover.";

  const ctaUrl = citySlug
    ? `${siteOrigin}/c/${citySlug}`
    : siteOrigin;

  const ctaLabel = cityName
    ? `Explore ${cityName}`
    : "Explore Transparent.city";

  const storyRows = stories
    .map((s) => {
      const emoji = s.city_emoji || typeEmoji(s.story_type);
      const url = storyUrl(s, siteOrigin);
      const desc = truncate(s.description, 120);
      const cityLabel = !cityName && s.city_name ? `<span style="color:#888;font-size:12px;">${s.city_name}</span><br/>` : "";

      return `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #eee;">
            ${cityLabel}
            <a href="${url}" style="color:#1a1a1a;text-decoration:none;font-weight:600;font-size:15px;">
              ${emoji} ${s.headline}
            </a>
            <div style="color:#555;font-size:13px;line-height:1.5;margin-top:4px;">
              ${desc}
            </div>
            <a href="${url}" style="color:#6B46C1;font-size:13px;text-decoration:none;margin-top:4px;display:inline-block;">
              Read more &rarr;
            </a>
          </td>
        </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 24px 0;">
              <div style="font-size:13px;color:#888;font-weight:600;letter-spacing:0.5px;margin-bottom:8px;">TRANSPARENT.CITY</div>
              <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a;font-weight:700;">Welcome!</h1>
              <h2 style="margin:0 0 8px;font-size:17px;color:#1a1a1a;font-weight:600;">${heading}</h2>
              <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.5;">
                ${subheading}
              </p>
            </td>
          </tr>

          <!-- Stories -->
          <tr>
            <td style="padding:0 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${storyRows}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:24px;text-align:center;">
              <a href="${ctaUrl}" style="display:inline-block;background:#6B46C1;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
                ${ctaLabel}
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px 24px;text-align:center;color:#999;font-size:12px;line-height:1.5;">
              You're receiving this because you signed up at Transparent.city.<br/>
              <a href="${siteOrigin}/settings" style="color:#999;">Manage email preferences</a>
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
    }
  } catch (err) {
    console.error("[welcome-email] Failed to fetch stories:", err);
    // Continue without stories rather than failing the email entirely
  }

  if (stories.length === 0) {
    // Nothing to show; skip the email rather than sending an empty one
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
