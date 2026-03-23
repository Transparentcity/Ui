/**
 * Mock data enrichment layer for the Feed V2 redesign.
 *
 * Derives new fields (card_type, template, engagement counts, etc.) from the
 * existing FeedStory interface without changing the backend API contract.
 */

import type { FeedStory } from "@/lib/hooks/useFeed";
import { getApiBaseUrlForAssets } from "@/lib/apiBase";
import { cleanDescription } from "./textCleanup";

// ── Card types ──────────────────────────────────────────────────────────────

export type CardType =
  | "alert"
  | "trend"
  | "business"
  | "spending"
  | "justice"
  | "safety"
  | "311_images"
  | "my_block"
  | "context"
  | "multi_metric"
  | "off_the_charts";

export type TemplateType = "text_only" | "text_chart" | "text_photo" | "multi_metric";

// ── Enriched story type ─────────────────────────────────────────────────────

export interface EnrichedFeedStory extends FeedStory {
  card_type: CardType;
  template: TemplateType;
  applaud_count: number;
  escalate_count: number;
  investigate_count: number;
  type_icon: string;
  type_label: string;
  actor: string;
  neighborhood_label: string;
  subline: string;
  image_url_resolved: string | null;
  embed_url_resolved: string | null;
  cleaned_description: string;
}

// ── Type metadata maps ──────────────────────────────────────────────────────

const TYPE_ICONS: Record<CardType, string> = {
  alert: "\u{1F534}",          // 🔴
  trend: "\u{1F4CA}",          // 📊
  business: "\u{1F3EA}",       // 🏪
  spending: "\u{1F4B0}",       // 💰
  justice: "\u2696\uFE0F",     // ⚖️
  safety: "\u{1F6A8}",         // 🚨
  "311_images": "\u{1F4F8}",   // 📸
  my_block: "\u{1F3E0}",       // 🏠
  context: "\u{1F9ED}",        // 🧭
  multi_metric: "\u{1F4CB}",   // 📋
  off_the_charts: "\u{1F92F}", // 🤯
};

const TYPE_LABELS: Record<CardType, string> = {
  alert: "Alert",
  trend: "Trend",
  business: "Business",
  spending: "Spending",
  justice: "Justice",
  safety: "Safety",
  "311_images": "311 Photos",
  my_block: "My Block",
  context: "Context",
  multi_metric: "This Week",
  off_the_charts: "Off the Charts",
};

// ── Actor (city department) derivation ──────────────────────────────────────

/**
 * Derives the responsible city department ("actor") for a story based on
 * its card type and headline keywords.
 */
function deriveActor(cardType: CardType, headline: string): string {
  const hl = headline.toLowerCase();

  // Explicit keyword matches first
  if (/graffiti|pothole|street\s*light|sidewalk|trash|litter|dumping|street\s*clean/.test(hl)) return "Public Works";
  if (/fire\s*(?:dep|dept|department)|fire\s*call|fire\s*response|arson/.test(hl)) return "Fire Dept";
  if (/911|police|crime|theft|robbery|assault|homicide|shooting|burglary|arrest|patrol/.test(hl)) return "Police";
  if (/permit|building|inspection|housing|code\s*(?:enforce|violation)/.test(hl)) return "Building Dept";
  if (/park|recreation|playground|tree/.test(hl)) return "Parks & Rec";
  if (/transit|bus|muni|subway|metro|rail|bike\s*lane/.test(hl)) return "Transit";
  if (/school|education|student|enrollment/.test(hl)) return "Education";
  if (/health|hospital|overdose|mental\s*health/.test(hl)) return "Public Health";
  if (/budget|contract|spending|procurement|appropriat/.test(hl)) return "Controller";
  if (/restaurant|food|business\s*license|retail|storefront|open|close/.test(hl)) return "Business";
  if (/311|service\s*request|complaint/.test(hl)) return "311";
  if (/court|da\b|prosecutor|charges|sentenc/.test(hl)) return "District Attorney";
  if (/water|sewer|utility/.test(hl)) return "Utilities";

  // Fall back by card type
  switch (cardType) {
    case "safety": return "Police";
    case "business": return "Business";
    case "spending": return "Controller";
    case "justice": return "District Attorney";
    case "my_block": return "City Hall";
    case "311_images": return "311";
    case "context": return "City Hall";
    case "multi_metric": return "City Hall";
    case "off_the_charts": return "City Hall";
    default: return "City Hall";
  }
}

// ── Derive card_type from existing fields ───────────────────────────────────

// Note: "my_block" is intentionally excluded — it's a metadata-based filter
// (metadata.my_block = true), not a backend story_type. Stories in the user's
// neighborhood keep their real card_type and are filtered via metadata in
// FeedContainer.
const KNOWN_CARD_TYPES = new Set<string>([
  "alert", "trend", "business", "spending",
  "justice", "safety", "311_images",
  "context", "multi_metric", "off_the_charts",
]);

function deriveCardType(story: FeedStory): CardType {
  const storyType = (story.story_type ?? "").toLowerCase();
  const meta = story.metadata ?? {};
  const headline = (story.headline ?? "").toLowerCase();

  // 1. Trust the backend story_type if it's a known card type
  if (KNOWN_CARD_TYPES.has(storyType)) return storyType as CardType;

  // 2. Fallback: read metadata.angle (interim for stories still typed 'research')
  const angle = (meta.angle as string ?? "").toLowerCase();
  if (angle === "metric_highlight") return "trend";

  // 3. Last resort: keyword matching (legacy stories without proper type)
  if (meta.anomaly_severity === "critical" || meta.anomaly_severity === "high") return "alert";
  if (meta.trend_direction) return "trend";
  if (/contract|spending|\$/.test(headline)) return "spending";
  if (/\bda\b|charges|court/.test(headline)) return "justice";
  if (/911|response time/.test(headline)) return "safety";
  if (storyType.includes("business") || /restaurant|retail|opens|closes/.test(headline)) return "business";
  if (story.visualization_type === "photo" || meta["311_image"]) return "311_images";

  return "alert";
}

// ── Derive template from card_type + visualization ──────────────────────────

function deriveTemplate(story: FeedStory, cardType: CardType): TemplateType {
  const pv = story.primary_visualization;
  const vizType = (story.visualization_type ?? pv?.type ?? "").toLowerCase();
  const meta = story.metadata ?? {};

  // Multi-metric cards: 3+ metrics in metadata
  if (cardType === "multi_metric" || (Array.isArray(meta.metrics) && (meta.metrics as unknown[]).length >= 2)) return "multi_metric";

  if (pv && (vizType === "map" || vizType === "chart" || vizType === "anomaly")) return "text_chart";
  // 311_images stories always get the photo template (photo URL may be in
  // image_url, metadata.311_image_url, or metadata.311_image).
  if (cardType === "311_images") return "text_photo";
  if ((story as unknown as Record<string, unknown>).image_url || story.visualization_type === "photo" || story.metadata?.["311_image"]) return "text_photo";

  return "text_only";
}

// ── Build image URL (mirrors FeedView.getImageUrl logic) ────────────────────

function resolveImageUrl(story: FeedStory): string | null {
  const base = getApiBaseUrlForAssets();
  const storyAny = story as unknown as Record<string, unknown>;
  if (storyAny.image_url) return `${base}${storyAny.image_url}`;
  // 311 photos: backend stores the Socrata photo URL in metadata.311_image_url
  const meta311Url = story.metadata?.["311_image_url"];
  if (typeof meta311Url === "string" && meta311Url) return meta311Url;
  const pv = story.primary_visualization;
  if (!pv) return null;
  const type = (story.visualization_type || pv.type || "").toLowerCase();
  const id = pv.id;
  const hash = pv.short_hash;
  if (type === "chart" && id != null) return `${base}/api/time-series/public/${id}/image`;
  if (type === "anomaly" && id != null) return `${base}/api/anomalies/public/result/${id}/image`;
  if (type === "map" && hash) return `${base}/api/maps/public/${hash}/image`;
  return null;
}

// ── Build embed URL for iframe previews on cards ────────────────────────────

function resolveEmbedUrl(story: FeedStory): string | null {
  const pv = story.primary_visualization;
  if (!pv) return null;

  // Use existing embed_url from the API if available
  if (pv.embed_url) return pv.embed_url;

  const type = (story.visualization_type || pv.type || "").toLowerCase();
  const id = pv.id;
  const hash = pv.short_hash;

  if ((type === "anomaly" || type === "anomaly_chart") && id != null) return `/a/${id}?embedded=true`;
  if (type === "chart" && id != null) return `/t/${id}?embedded=true`;
  if (type === "map" && hash) return `/m/${hash}?embedded=true`;
  if (type === "map" && id != null) return `/m/${id}?embedded=true`;

  return null;
}

// ── Format subline ──────────────────────────────────────────────────────────

function formatSubline(story: FeedStory): string {
  const d = story.published_at ?? story.story_date;
  if (!d) return "";
  try {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ── Place labels map (populated from /api/feed/public/places) ────────────────

type PlaceMap = Map<string, string>; // "cityId:district" -> label

function placesKey(cityId: number, district: number): string {
  return `${cityId}:${district}`;
}

/** Build a lookup map from FeedPlace[] array. */
export function buildPlaceMap(places: Array<{ city_id: number; district: number; label: string }>): PlaceMap {
  const map: PlaceMap = new Map();
  for (const p of places) {
    map.set(placesKey(p.city_id, p.district), p.label);
  }
  return map;
}

// ── Derive neighborhood label ───────────────────────────────────────────────

function deriveNeighborhoodLabel(story: FeedStory, placeMap?: PlaceMap): string {
  const city = story.city_name ?? "City";
  const d = story.district;

  // Use real place label from API if it contains a neighborhood name beyond "City – District N"
  if (placeMap && d != null) {
    const label = placeMap.get(placesKey(story.city_id, d));
    if (label) {
      // Labels are like "Chicago – District 1" or "San Francisco"
      // Only use if it contains info beyond the city+district pattern
      const stripped = label
        .replace(new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '')
        .replace(/\s*[–—-]\s*District\s+\d+/i, '')
        .trim();
      // If there's extra content (a neighborhood name), use the full label
      if (stripped.length > 2) {
        return `${city} \u00B7 ${stripped}`;
      }
    }
  }

  if (d != null && d !== 0) return `${city} \u00B7 District ${d}`;

  // If the headline mentions a specific district, surface it even if the API says citywide
  if (d === 0 || d == null) {
    const districtMatch = (story.headline ?? "").match(/\bDistrict\s+(\d+)\b/i);
    if (districtMatch) return `${city} \u00B7 District ${districtMatch[1]}`;
  }

  if (d === 0) return `${city} \u00B7 City-wide`;
  return city;
}

// ── Main enrichment function ────────────────────────────────────────────────

export function enrichStory(story: FeedStory, placeMap?: PlaceMap): EnrichedFeedStory {
  const cardType = deriveCardType(story);
  const template = deriveTemplate(story, cardType);
  const neighborhoodLabel = deriveNeighborhoodLabel(story, placeMap);

  // Prefer summary field (when backend populates it), fall back to description
  // If description is just metadata breadcrumbs, try summary first
  const descriptionSource = (story.summary && story.summary.trim().length > 20)
    ? story.summary
    : (story.description && story.description.trim().length > 20)
      ? story.description
      : story.summary || story.description;

  return {
    ...story,
    card_type: cardType,
    template,
    applaud_count: story.applaud_count ?? story.like_count ?? 0,
    escalate_count: story.escalate_count ?? story.comment_count ?? 0,
    investigate_count: story.investigate_count ?? 0,
    type_icon: TYPE_ICONS[cardType],
    type_label: TYPE_LABELS[cardType],
    actor: deriveActor(cardType, story.headline ?? ""),
    neighborhood_label: neighborhoodLabel,
    subline: formatSubline(story),
    image_url_resolved: resolveImageUrl(story),
    embed_url_resolved: resolveEmbedUrl(story),
    cleaned_description: cleanDescription(descriptionSource, story.headline, story.city_name ?? undefined, neighborhoodLabel)
      || story.summary?.trim()
      || "",
  };
}

/** Enrich an array of stories and interleave viz stories among text-only. */
export function enrichStories(stories: FeedStory[], placeMap?: PlaceMap): EnrichedFeedStory[] {
  const enriched = stories.map((s) => enrichStory(s, placeMap));

  // Separate stories with visualizations from text-only
  const withViz = enriched.filter((s) => s.embed_url_resolved);
  const textOnly = enriched.filter((s) => !s.embed_url_resolved);

  // Interleave: insert a viz story every 2-3 text stories
  if (withViz.length === 0) return enriched;

  const result: EnrichedFeedStory[] = [];
  let ti = 0;
  let vi = 0;
  let count = 0;

  while (ti < textOnly.length || vi < withViz.length) {
    // Every 3rd card, insert a viz story (if available)
    if (count > 0 && count % 3 === 0 && vi < withViz.length) {
      result.push(withViz[vi++]);
    } else if (ti < textOnly.length) {
      result.push(textOnly[ti++]);
    } else if (vi < withViz.length) {
      result.push(withViz[vi++]);
    }
    count++;
  }

  return result;
}
