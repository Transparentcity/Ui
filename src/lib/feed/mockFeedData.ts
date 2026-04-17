/**
 * Mock data enrichment layer for the Feed V2 redesign.
 *
 * Derives new fields (card_type, template, engagement counts, etc.) from the
 * existing FeedStory interface without changing the backend API contract.
 *
 * Also filters out incoherent multi-metric cards whose metrics span 3+
 * unrelated categories (e.g., Safety + Justice + Quality of Life), since
 * these produce confusing summary cards. See inferMetricCategory() and
 * isCoherentMultiMetric() for the filtering logic.
 */

import type { FeedStory } from "@/lib/hooks/useFeed";
import { getApiBaseUrlForAssets } from "@/lib/apiBase";
import { cleanDescription } from "./textCleanup";
import { resolveCanonicalUrl } from "./canonicalUrl";
import { normalizeHeadlineCaps, normalizeBusinessName, improveMultiMetricHeadline, stripLeadingEmoji, improveContextHeadline, improveGenericHeadline, truncateHeadline, truncateOtcHeadline } from "./headlineCleanup";

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
  | "off_the_charts"
  | "comparison"
  | "milestone"
  | "traction";

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
  /** Lucide icon name for the category (e.g. "Shield", "Flame"). */
  category_icon: string;
  /** CSS color for the category icon. */
  category_color: string;
  neighborhood_label: string;
  subline: string;
  image_url_resolved: string | null;
  /**
   * Resolved alt text for the story image. Prefers `story.image_alt`, then
   * `metadata.image_alt`, then falls back to the story headline so images
   * are never bare for screen readers.
   */
  image_alt_resolved: string;
  /**
   * Caption text to display below the static image (or as fallback text when
   * the image cannot be loaded). Prefers `story.image_caption`, then
   * `metadata.image_caption`.
   */
  image_caption_resolved: string | null;
  embed_url_resolved: string | null;
  cleaned_description: string;
  canonical_url: string;
}

// ── Category metadata maps ──────────────────────────────────────────────────

/** Category definition: Lucide icon name + color for the card header. */
export interface CategoryMeta {
  icon: string;   // Lucide icon name (e.g. "Shield", "Flame")
  color: string;  // CSS color for the icon
  label: string;  // Display label (e.g. "Police", "Fire Dept")
}

/**
 * Topic categories derived from headline keywords. These replace the old
 * "actor" concept. Each maps to a Lucide icon + accent color.
 */
const CATEGORY_MAP: Record<string, CategoryMeta> = {
  "Police":           { icon: "Shield",      color: "#dc2626", label: "Police" },
  "Fire Dept":        { icon: "Flame",       color: "#ea580c", label: "Fire Dept" },
  "Public Works":     { icon: "Wrench",      color: "#6b7280", label: "Public Works" },
  "311":              { icon: "Wrench",      color: "#6b7280", label: "311" },
  "Building Dept":    { icon: "Building2",   color: "#2563eb", label: "Building Dept" },
  "Parks & Rec":      { icon: "Trees",       color: "#16a34a", label: "Parks & Rec" },
  "Transit":          { icon: "Bus",         color: "#0d9488", label: "Transit" },
  "Spending":         { icon: "DollarSign",  color: "#d97706", label: "Spending" },
  "Controller":       { icon: "DollarSign",  color: "#d97706", label: "Spending" },
  "Business":         { icon: "Store",       color: "#7c3aed", label: "Business" },
  "Public Health":    { icon: "Heart",       color: "#db2777", label: "Public Health" },
  "Education":        { icon: "GraduationCap", color: "#4f46e5", label: "Education" },
  "District Attorney":{ icon: "Scale",       color: "#7c3aed", label: "Justice" },
  "Utilities":        { icon: "Droplets",    color: "#0284c7", label: "Utilities" },
  "City Hall":        { icon: "Landmark",    color: "#6b7280", label: "City Hall" },
};

/** Fallback category for unknown topics. */
const DEFAULT_CATEGORY: CategoryMeta = { icon: "Landmark", color: "#6b7280", label: "City Hall" };

/** Look up category metadata by category key. */
export function getCategoryMeta(categoryKey: string): CategoryMeta {
  return CATEGORY_MAP[categoryKey] ?? DEFAULT_CATEGORY;
}

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
  comparison: "Your District",
  milestone: "Milestone",
  traction: "Traction",
};

// ── Actor (city department) derivation ──────────────────────────────────────

/**
 * Derives the responsible city department ("actor") for a story based on
 * its card type and headline keywords.
 */
function deriveActor(cardType: CardType, headline: string): string {
  const hl = headline.toLowerCase();

  // Explicit keyword matches first
  if (/graffiti|pothole|street\s*light|traffic\s*(?:light|signal)|sidewalk|trash|litter|dumping|street\s*clean/.test(hl)) return "Public Works";
  if (/fire\s*(?:dep|dept|department)|fire\s*call|fire\s*response|arson/.test(hl)) return "Fire Dept";
  if (/911|police|crime|theft|robbery|assault|homicide|shooting|burglary|arrest|patrol/.test(hl)) return "Police";
  if (/permit|building|inspection|housing|code\s*(?:enforce|violation)/.test(hl)) return "Building Dept";
  if (/\bparks?\b(?!\s+(?:traffic|light|signal|ave|avenue|blvd|boulevard|street|st|rd|road|dr|drive|place|pl|way|lane|ln|ct|court))|recreation|playground|\btree(?:s|\b)(?!\s*light)/.test(hl)) return "Parks & Rec";
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
    case "comparison": return "City Hall";
    case "milestone": return "City Hall";
    case "traction": return "City Hall";
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
  "comparison", "milestone", "traction",
]);

function deriveCardType(story: FeedStory): CardType {
  const storyType = (story.story_type ?? "").toLowerCase();
  const meta = story.metadata ?? {};
  const headline = (story.headline ?? "").toLowerCase();

  // 0. Override: business stories mis-typed as alert/trend in the backend.
  //    If headline has business-action verbs AND food/retail/venue keywords,
  //    reclassify as "business" regardless of backend story_type.
  if (
    (storyType === "alert" || storyType === "trend") &&
    /\b(?:opens?|closes?|registers?|files?|launches?|lands?|brings?|brews?|shutters?|plants?|pops?\s*up)\b/.test(headline) &&
    /\b(?:caf[eé]|coffee|restaurant|bar|grill|market|shop|store|bakery|ramen|pizza|taco|burger|sushi|studio|gallery|boutique|salon|clinic|bookstore|pharmacy|popcorn|ice\s*cream|tattoo|ceramics|jewelry|beer|wine|liquor|patio|tavern|food|deli)\b/.test(headline)
  ) {
    return "business";
  }

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
  // Photo-worthy 311 keywords in headline (catches manual stories that weren't typed correctly)
  if (/graffiti|pothole|sidewalk|litter|dumping|rodent|blocked|streetlight/.test(headline)) return "311_images";
  if (/record low|improved|lowest in|best in|all-time low|community pride|celebrates/.test(headline)) return "traction";

  return "alert";
}

// ── Derive template from card_type + visualization ──────────────────────────

function deriveTemplate(story: FeedStory, cardType: CardType): TemplateType {
  const pv = story.primary_visualization;
  const vizType = (story.visualization_type ?? pv?.type ?? "").toLowerCase();
  const meta = story.metadata ?? {};

  // Comparison stories use the multi-metric template with "vs." layout
  if (cardType === "comparison") return "multi_metric";
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

function isPrivateScopedStory(story: FeedStory): boolean {
  const meta = story.metadata ?? {};
  if (story.user_place_id != null) return true;
  if (meta.category === "personal_newsletter") return true;
  const rawPlaceIds = meta.user_place_ids;
  return Array.isArray(rawPlaceIds) && rawPlaceIds.length > 0;
}

function deriveVisualizationImageUrl(story: FeedStory, base: string): string | null {
  const pv = story.primary_visualization;
  if (!pv) return null;
  const type = (story.visualization_type || pv.type || "").toLowerCase();
  const id = pv.id;
  const hash = pv.short_hash;
  if (type === "chart" && id != null) return `${base}/api/time-series/public/${id}/image`;
  if ((type === "anomaly" || type === "anomaly_chart") && id != null) {
    return `${base}/api/anomalies/public/result/${id}/image`;
  }
  if (type === "map" && hash) return `${base}/api/maps/public/${hash}/image`;
  if (type === "map" && id != null) return `${base}/api/maps/public/${id}/image`;
  return null;
}

function resolveImageUrl(story: FeedStory): string | null {
  const base = getApiBaseUrlForAssets();
  const storyAny = story as unknown as Record<string, unknown>;
  if (storyAny.image_url) {
    const url = storyAny.image_url as string;
    const isPublicStoryImageProxy = url.startsWith("/api/feed/public/story-image/");
    if (isPublicStoryImageProxy && isPrivateScopedStory(story)) {
      const visualizationImageUrl = deriveVisualizationImageUrl(story, base);
      if (visualizationImageUrl) return visualizationImageUrl;
    }
    // External URLs (e.g. Cloudinary 311 photos) are already absolute
    return url.startsWith("http") ? url : `${base}${url}`;
  }
  // 311 photos: backend stores the Socrata photo URL in metadata.311_image_url
  const meta311Url = story.metadata?.["311_image_url"];
  if (typeof meta311Url === "string" && meta311Url) return meta311Url;
  const visualizationImageUrl = deriveVisualizationImageUrl(story, base);
  if (visualizationImageUrl) return visualizationImageUrl;

  // Fallback: derive image URL from the embed URL when the visualization type
  // doesn't match known patterns (e.g. backend set pv.embed_url directly).
  const pv = story.primary_visualization;
  if (!pv) return null;
  const embedUrl = pv.embed_url as string | undefined;
  if (embedUrl) {
    // /t/{id}... -> time-series image
    const tMatch = embedUrl.match(/^\/t\/(\d+)/);
    if (tMatch) return `${base}/api/time-series/public/${tMatch[1]}/image`;
    // /a/{id}... -> anomaly image
    const aMatch = embedUrl.match(/^\/a\/(\d+)/);
    if (aMatch) return `${base}/api/anomalies/public/result/${aMatch[1]}/image`;
    // /m/{hash}... -> map image
    const mMatch = embedUrl.match(/^\/m\/([^?/]+)/);
    if (mMatch) return `${base}/api/maps/public/${mMatch[1]}/image`;
  }

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

  if ((type === "anomaly" || type === "anomaly_chart") && id != null) return `/a/${id}?thumbnail=true`;
  if (type === "chart" && id != null) return `/t/${id}?thumbnail=true`;
  if (type === "map" && hash) return `/m/${hash}?thumbnail=true`;
  if (type === "map" && id != null) return `/m/${id}?thumbnail=true`;

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
type UserPlaceLabelMap = Map<number, string>;

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

function deriveSavedPlaceLabel(
  story: FeedStory,
  userPlaceLabelMap?: UserPlaceLabelMap,
): string | null {
  const meta = story.metadata ?? {};
  const metaPlaceLabels = [
    meta.place_label,
    meta.user_place_label,
    meta.saved_place_label,
  ];

  for (const value of metaPlaceLabels) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  if (!userPlaceLabelMap || userPlaceLabelMap.size === 0) {
    return null;
  }

  if (story.user_place_id != null) {
    const label = userPlaceLabelMap.get(story.user_place_id);
    if (label?.trim()) {
      return label.trim();
    }
  }

  const rawPlaceIds = meta.user_place_ids;
  if (!Array.isArray(rawPlaceIds)) {
    return null;
  }

  const uniquePlaceIds = Array.from(
    new Set(
      rawPlaceIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value)),
    ),
  );

  if (uniquePlaceIds.length !== 1) {
    return null;
  }

  const label = userPlaceLabelMap.get(uniquePlaceIds[0]);
  return label?.trim() || null;
}

// ── Main enrichment function ────────────────────────────────────────────────

export function enrichStory(
  story: FeedStory,
  placeMap?: PlaceMap,
  userPlaceLabelMap?: UserPlaceLabelMap,
): EnrichedFeedStory {
  const cardType = deriveCardType(story);
  const template = deriveTemplate(story, cardType);
  const neighborhoodLabel =
    deriveSavedPlaceLabel(story, userPlaceLabelMap) ??
    deriveNeighborhoodLabel(story, placeMap);

  // Prefer summary field (when backend populates it), fall back to description
  // If description is just metadata breadcrumbs, try summary first
  const descriptionSource = (story.summary && story.summary.trim().length > 20)
    ? story.summary
    : (story.description && story.description.trim().length > 20)
      ? story.description
      : story.summary || story.description;

  // 0. Replace generic placeholder headlines ("The Fact", etc.) with something meaningful
  let normalizedHeadline = improveGenericHeadline(story.headline ?? "", {
    metadata: story.metadata,
    summary: story.summary,
    description: story.description,
    cityName: story.city_name,
  });

  // 1. Strip leading emoji (card header already shows type_icon)
  normalizedHeadline = stripLeadingEmoji(normalizedHeadline);

  // 2. Normalize ALL-CAPS business names in headline
  normalizedHeadline = normalizeHeadlineCaps(normalizedHeadline);

  // 3. Improve generic multi-metric headlines ("District N This Week — N Metrics Moving")
  const meta = story.metadata ?? {};
  if (cardType === "multi_metric" || template === "multi_metric") {
    const metrics = Array.isArray(meta.metrics) ? meta.metrics as Array<{ name?: string | null; direction?: string; pct?: string | number }> : null;
    normalizedHeadline = improveMultiMetricHeadline(normalizedHeadline, metrics);
  }

  // 4. Improve generic context story labels ("Top 311 complaints" → "Chicago's Top 311 Complaints This Month")
  if (cardType === "context") {
    normalizedHeadline = improveContextHeadline(normalizedHeadline, story.city_name ?? undefined);
  }

  // 5. Enforce max headline length (shorter limit for OTC / milestone cards)
  normalizedHeadline =
    cardType === "off_the_charts" || cardType === "milestone"
      ? truncateOtcHeadline(normalizedHeadline)
      : truncateHeadline(normalizedHeadline);

  // Also normalize business_name in metadata for display
  if (meta.business_name && typeof meta.business_name === "string") {
    meta.business_name = normalizeBusinessName(meta.business_name);
  }

  const categoryKey = deriveActor(cardType, normalizedHeadline);
  const catMeta = getCategoryMeta(categoryKey);
  // Resolve alt and caption: prefer top-level fields, then metadata, then fallbacks.
  const imageAltResolved: string =
    story.image_alt ||
    (typeof meta.image_alt === "string" ? meta.image_alt : null) ||
    normalizedHeadline;
  const imageCaptionResolved: string | null =
    story.image_caption ||
    (typeof meta.image_caption === "string" ? meta.image_caption : null) ||
    null;

  const enriched: EnrichedFeedStory = {
    ...story,
    headline: normalizedHeadline,
    metadata: meta,
    card_type: cardType,
    template,
    applaud_count: story.applaud_count ?? story.like_count ?? 0,
    escalate_count: story.escalate_count ?? story.comment_count ?? 0,
    investigate_count: story.investigate_count ?? 0,
    type_icon: catMeta.icon,
    type_label: TYPE_LABELS[cardType],
    actor: catMeta.label,
    category_icon: catMeta.icon,
    category_color: catMeta.color,
    neighborhood_label: neighborhoodLabel,
    subline: formatSubline(story),
    image_url_resolved: resolveImageUrl(story),
    image_alt_resolved: imageAltResolved,
    image_caption_resolved: imageCaptionResolved,
    embed_url_resolved: resolveEmbedUrl(story),
    cleaned_description: cleanDescription(descriptionSource, normalizedHeadline, story.city_name ?? undefined, neighborhoodLabel)
      || story.summary?.trim()
      || "",
    canonical_url: "", // placeholder, resolved below
  };
  enriched.canonical_url = resolveCanonicalUrl(enriched);
  return enriched;
}

// ── Multi-metric coherence check ───────────────────────────────────────────

const METRIC_CATEGORIES: Array<[string, RegExp]> = [
  ["Safety", /crime|assault|theft|burglary|robbery|shooting|homicide|911|response time|fire|arson|drone|police|sfpd|weapon|battery|motor vehicle|larceny|violent/i],
  ["Justice", /\bda\b|conviction|charges|court|prosecution|filing|arrest|sentence|incarcerat/i],
  ["Quality of Life", /311|graffiti|pothole|litter|noise|encampment|tent|dumping|sidewalk|streetlight|rodent|illegal dumping|blocked|offensive/i],
  ["Housing", /housing|rent|eviction|permit|unit|building|construction|zoning/i],
  ["Business", /business|restaurant|store|license|opening|closing|retail/i],
  ["Transit", /transit|muni|bus|bart|bike|traffic|parking|pedestrian/i],
  ["Spending", /budget|spending|contract|cost|revenue|funding|expenditure/i],
];

export function inferMetricCategory(name: string): string {
  for (const [category, pattern] of METRIC_CATEGORIES) {
    if (pattern.test(name)) return category;
  }
  return "Other";
}

/**
 * Returns true if a multi-metric card's metrics are thematically coherent
 * (span fewer than 3 distinct inferred categories). Non-multi-metric cards
 * always return true.
 */
export function isCoherentMultiMetric(story: EnrichedFeedStory): boolean {
  if (story.template !== "multi_metric") return true;
  // Comparison cards (district vs city) are inherently coherent
  if (story.card_type === "comparison") return true;

  const metrics = story.metadata?.metrics as
    | Array<{ name?: string | null }>
    | undefined;
  if (!Array.isArray(metrics) || metrics.length < 2) return true;

  const categories = new Set(
    metrics.map((m) => inferMetricCategory(m.name ?? ""))
  );
  return categories.size < 3;
}

/** Enrich an array of stories and optionally interleave viz stories among text-only. */
export function enrichStories(
  stories: FeedStory[],
  placeMap?: PlaceMap,
  userPlaceLabelMap?: UserPlaceLabelMap,
  options?: { skipInterleave?: boolean },
): EnrichedFeedStory[] {
  const enriched = stories
    .map((s) => enrichStory(s, placeMap, userPlaceLabelMap))
    .filter(isCoherentMultiMetric);

  if (options?.skipInterleave) return enriched;

  // Separate visual stories (embeds OR photos) from text-only
  const isVisual = (s: EnrichedFeedStory) => s.embed_url_resolved || s.template === "text_photo";
  const withViz = enriched.filter(isVisual);
  const textOnly = enriched.filter((s) => !isVisual(s));

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
