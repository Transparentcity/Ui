/**
 * Utility for processing visualization shortcodes in research report HTML.
 *
 * Shortcode formats:
 * - Charts: [chart:123]       → embeds chart with ID 123 (native period)
 *           [chart:123:ytd]   → embeds chart with period override (ytd/day/week/month/year)
 *                               appends ?period=ytd to the iframe src
 *           [chart:123|Tree Emergency] → isolates one group_value from a multi-series chart
 *           [chart:123:ytd|Tree Emergency] → period + single subseries
 * - Maps:   [map:abc123]      → embeds saved map by short hash (choropleth, delta, point, etc.)
 *                               the map type is encoded in the saved map record, not the shortcode
 * - Anomalies: [anomaly:456]  → embeds anomaly result with ID 456
 *
 * Note: Charts (/t/{id}) and Maps (/m/{hash}) are FRONTEND routes,
 * so we use relative URLs that work within the same Next.js app.
 */

export interface EmbedConfig {
  width?: string;
  height?: string;
  chartHeight?: string;
  mapHeight?: string;
  anomalyHeight?: string;
  className?: string;
  /** Show the shortcode debug label below each embed. Defaults to true. Set to false for public story pages. */
  showDebug?: boolean;
}

export interface StaticVisualizationAsset {
  src: string;
  alt?: string | null;
  caption?: string | null;
  title?: string | null;
  subtitle?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  sourceDescription?: string | null;
}

export type VisualizationEmbedChrome = Omit<StaticVisualizationAsset, "src">;

export interface StaticVisualizationConfig {
  charts?: Record<string, StaticVisualizationAsset>;
  maps?: Record<string, StaticVisualizationAsset>;
  anomalies?: Record<string, StaticVisualizationAsset>;
}

export interface VisualizationEmbedChromeConfig {
  charts?: Record<string, VisualizationEmbedChrome>;
  maps?: Record<string, VisualizationEmbedChrome>;
  anomalies?: Record<string, VisualizationEmbedChrome>;
}

export interface VisualizationShortcodeStoryLike {
  article_html?: string | null;
  detail_url?: string | null;
  image_url?: string | null;
  image_alt?: string | null;
  image_caption?: string | null;
  visualization_type?: string | null;
  primary_visualization?: Record<string, unknown> | null;
}

export interface VisualizationShortcodeConfig extends EmbedConfig {
  staticVisualizations?: StaticVisualizationConfig;
  embedChrome?: VisualizationEmbedChromeConfig;
  /** Render the text block below a static image replacement. Defaults to true. */
  showStaticCaptions?: boolean;
  /**
   * When a static image replaces a shortcode, also emit a disclosure that loads
   * the interactive iframe on first open. Set to false for image-only embeds.
   * @default true
   */
  deferInteractiveForStaticEmbeds?: boolean;
}

const DEFAULT_CONFIG: Required<EmbedConfig> = {
  width: "100%",
  height: "450px",
  chartHeight: "480px",  // header (36px) + period selector (~33px) + gap (12px) + chart (~380px) + padding (12px)
  mapHeight: "500px",
  anomalyHeight: "400px",
  className: "visualization-embed",
  showDebug: true,
};

function getEmbedThemeQuery(): string {
  if (typeof document === "undefined") return "";
  const root = document.documentElement;
  const theme =
    root.getAttribute("data-theme") === "dark" || root.classList.contains("dark")
      ? "dark"
      : null;
  return theme ? `&theme=${theme}` : "";
}

/** Escape HTML for safe use in attributes and text. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function nestedRecord(
  record: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getSourceUrlFromPrimaryVisualization(
  pv: Record<string, unknown> | null,
): string | null {
  const sourceInfo = nestedRecord(pv, "source_info");
  const metadata = nestedRecord(pv, "metadata");
  return firstString(
    pv?.source_url,
    pv?.dataset_url,
    pv?.data_url,
    sourceInfo?.dataset_url,
    sourceInfo?.query_url,
    metadata?.source_url,
    metadata?.dataset_url,
  );
}

function getSourceLabelFromPrimaryVisualization(
  pv: Record<string, unknown> | null,
): string | null {
  const sourceInfo = nestedRecord(pv, "source_info");
  const metadata = nestedRecord(pv, "metadata");
  return firstString(
    pv?.source_label,
    pv?.source_name,
    pv?.dataset_name,
    pv?.dataset_title,
    sourceInfo?.dataset_name,
    sourceInfo?.dataset_id,
    metadata?.source_label,
    metadata?.dataset_name,
    metadata?.dataset_title,
  );
}

function getExternalSourceUrl(url: string | null | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value, "https://transparent.city");
    const host = parsed.hostname.replace(/^www\./, "");
    if (!parsed.protocol.startsWith("http") || host === "transparent.city") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

const VALID_CHART_PERIODS = new Set(["day", "week", "month", "year", "ytd"]);

/** Chart shortcode: [chart:N], [chart:N:ytd], [chart:N|Group], [chart:N:ytd|Group] */
function chartShortcodeRegex(): RegExp {
  return /\[chart:(\d+)(?::([a-z]+))?(?:\|([^\]]+))?\]/g;
}

function shouldDeferInteractiveForStatic(config: VisualizationShortcodeConfig): boolean {
  return config.deferInteractiveForStaticEmbeds !== false;
}

/** Base chart embed URL (no theme). Client may append `&theme=` when activating. */
function chartInteractiveBaseUrl(
  chartId: string | number,
  period?: string,
  groupValue?: string,
): string {
  const validPeriod =
    period && VALID_CHART_PERIODS.has(period.toLowerCase()) ? period.toLowerCase() : undefined;
  const periodQuery = validPeriod ? `&period=${validPeriod}` : "";
  const groupQuery =
    groupValue && groupValue.trim()
      ? `&group_value=${encodeURIComponent(groupValue.trim())}`
      : "";
  return `/t/${chartId}?embedded=true${periodQuery}${groupQuery}`;
}

function mapInteractiveBaseUrl(shortHash: string): string {
  return `/m/${shortHash}?embedded=true`;
}

function anomalyInteractiveBaseUrl(resultId: string | number): string {
  return `/a/${resultId}?embedded=true`;
}

function getStaticVisualizationAsset(
  visType: "chart" | "map" | "anomaly",
  ref: string,
  config: VisualizationShortcodeConfig,
): StaticVisualizationAsset | null {
  const sources =
    visType === "chart"
      ? config.staticVisualizations?.charts
      : visType === "map"
        ? config.staticVisualizations?.maps
        : config.staticVisualizations?.anomalies;
  return sources?.[ref] ?? null;
}

function getVisualizationEmbedChrome(
  visType: "chart" | "map" | "anomaly",
  ref: string,
  config: VisualizationShortcodeConfig,
): VisualizationEmbedChrome | null {
  const sources =
    visType === "chart"
      ? config.embedChrome?.charts
      : visType === "map"
        ? config.embedChrome?.maps
        : config.embedChrome?.anomalies;
  return sources?.[ref] ?? null;
}

function getEmbedCopyHtml(chrome: VisualizationEmbedChrome | null): string {
  if (!chrome) return "";
  const title = chrome.title?.trim() || chrome.alt?.trim() || "";
  const titleHtml = title
    ? `<div class="viz-embed-title">${escapeHtml(title)}</div>`
    : "";
  return titleHtml
    ? `<div class="viz-embed-copy">${titleHtml}</div>`
    : "";
}

function getEmbedCaptionHtml(chrome: VisualizationEmbedChrome | null): string {
  if (!chrome) return "";
  const caption = chrome.subtitle?.trim() || chrome.caption?.trim() || "";
  return caption
    ? `<div class="viz-embed-caption">${escapeHtml(caption)}</div>`
    : "";
}

function getEmbedFooterHtml(captionHtml: string, sourceHtml: string): string {
  return captionHtml || sourceHtml
    ? `<div class="viz-embed-footer">${captionHtml}${sourceHtml}</div>`
    : "";
}

function getEmbedSourceHtml(
  chrome: VisualizationEmbedChrome | null,
  sourceRef?: {
    mapHash?: string;
    chartId?: string | number;
    anomalyId?: string | number;
  },
): string {
  const sourceUrl = chrome?.sourceUrl?.trim() || "";
  const sourceMapHash = sourceRef?.mapHash?.trim() || "";
  const sourceChartId =
    sourceRef?.chartId != null ? String(sourceRef.chartId).trim() : "";
  const sourceAnomalyId =
    sourceRef?.anomalyId != null ? String(sourceRef.anomalyId).trim() : "";
  if (!sourceUrl && !sourceMapHash && !sourceChartId && !sourceAnomalyId) return "";
  const sourceLabel = chrome?.sourceLabel?.trim() || "Source";
  const sourceDescription =
    chrome?.sourceDescription?.trim() ||
    "Open the original public data source.";
  return `
      <div class="viz-embed-source-row">
        <button
          type="button"
          class="viz-embed-source-button"
          data-viz-source-label="${escapeHtml(sourceLabel)}"
          data-viz-source-url="${escapeHtml(sourceUrl)}"
          data-viz-source-map-hash="${escapeHtml(sourceMapHash)}"
          data-viz-source-chart-id="${escapeHtml(sourceChartId)}"
          data-viz-source-anomaly-id="${escapeHtml(sourceAnomalyId)}"
          data-viz-source-description="${escapeHtml(sourceDescription)}"
        >
          Source
        </button>
      </div>
    `.trim();
}

function getStaticVisualizationEmbed(
  visType: "chart" | "map" | "anomaly",
  ref: string,
  asset: StaticVisualizationAsset,
  config: VisualizationShortcodeConfig = {},
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const height =
    visType === "chart"
      ? cfg.chartHeight || cfg.height
      : visType === "map"
        ? cfg.mapHeight || cfg.height
        : cfg.anomalyHeight || cfg.height;
  const attrName =
    visType === "chart"
      ? "data-chart-id"
      : visType === "map"
        ? "data-map-hash"
        : "data-anomaly-id";
  const shortcode =
    visType === "chart"
      ? `[chart:${ref}]`
      : visType === "map"
        ? `[map:${ref}]`
        : `[anomaly:${ref}]`;
  const shortcodeEscaped = escapeHtml(shortcode);
  const srcEscaped = escapeHtml(asset.src);
  const altEscaped = escapeHtml(asset.alt?.trim() || `Visualization ${ref}`);
  const copyHtml = getEmbedCopyHtml(asset);
  const captionHtml = getEmbedCaptionHtml(asset);
  const sourceHtml = getEmbedSourceHtml(
    asset,
    {
      mapHash: visType === "map" ? ref : undefined,
      chartId: visType === "chart" ? ref : undefined,
      anomalyId: visType === "anomaly" ? ref : undefined,
    },
  );
  const footerHtml = getEmbedFooterHtml(captionHtml, sourceHtml);
  const debugHtml = cfg.showDebug
    ? `<span class="visualization-embed-debug" style="display:block;font-size:0.75rem;color:#6b7280;margin-top:4px;">Shortcode: ${shortcodeEscaped}</span>`
    : "";

  const deferInteractive = shouldDeferInteractiveForStatic(config);
  const interactiveBase =
    visType === "chart"
      ? chartInteractiveBaseUrl(ref)
      : visType === "map"
        ? mapInteractiveBaseUrl(ref)
        : anomalyInteractiveBaseUrl(ref);
  const iframeTitle =
    visType === "chart"
      ? `Chart ${ref}`
      : visType === "map"
        ? `Map ${ref}`
        : `Anomaly ${ref}`;
  const interactiveBlock = deferInteractive
    ? `
      <details class="viz-deferred-interactive">
        <summary class="viz-deferred-interactive-summary">Load interactive version</summary>
        <div class="viz-deferred-interactive-frame-wrap">
          <iframe
            data-deferred-src="${escapeHtml(interactiveBase)}"
            width="${cfg.width}"
            height="${height}"
            frameborder="0"
            style="border: none; border-radius: 8px; background: #f8f9fa; display: block;"
            title="${escapeHtml(iframeTitle)}"
          ></iframe>
        </div>
      </details>
    `.trim()
    : "";

  return `
    <div class="${cfg.className} ${visType}-embed visualization-static-embed${
      deferInteractive ? " viz-has-deferred-interactive" : ""
    }" ${attrName}="${escapeHtml(ref)}" data-shortcode="${shortcodeEscaped}">
      ${copyHtml}
      <div class="viz-static-stack">
        <img
          src="${srcEscaped}"
          alt="${altEscaped}"
          loading="lazy"
          class="visualization-static-image"
          style="width: 100%; height: ${height}; object-fit: cover; display: block; background: #f8f9fa;"
        />
      </div>
      ${footerHtml}
      ${interactiveBlock}
      ${debugHtml}
    </div>
  `.trim();
}

/**
 * Generate an iframe embed HTML for a chart.
 * Uses relative URL since /t/{id} is a frontend route.
 * @param period - Optional period override (day, week, month, year, ytd).
 *                 Appends ?period=... to the embed URL for the correct time window.
 * @param groupValue - Optional single category from a multi-series chart.
 */
export function getChartEmbed(
  chartId: string | number,
  config: EmbedConfig = {},
  period?: string,
  groupValue?: string,
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const height = cfg.chartHeight || cfg.height;
  const validPeriod = period && VALID_CHART_PERIODS.has(period.toLowerCase()) ? period.toLowerCase() : undefined;
  const trimmedGroup = groupValue?.trim() || undefined;
  let shortcode = `[chart:${chartId}`;
  if (validPeriod) shortcode += `:${validPeriod}`;
  if (trimmedGroup) shortcode += `|${trimmedGroup}`;
  shortcode += "]";
  const shortcodeEscaped = escapeHtml(shortcode);
  const themeQuery = getEmbedThemeQuery();
  const url = `${chartInteractiveBaseUrl(chartId, validPeriod, trimmedGroup)}${themeQuery}`;
  const chrome = getVisualizationEmbedChrome(
    "chart",
    String(chartId),
    config as VisualizationShortcodeConfig,
  );
  const copyHtml = getEmbedCopyHtml(chrome);
  const captionHtml = getEmbedCaptionHtml(chrome);
  const sourceHtml = getEmbedSourceHtml(chrome, { chartId });
  const footerHtml = getEmbedFooterHtml(captionHtml, sourceHtml);
  
  const debugHtml = cfg.showDebug
    ? `<span class="visualization-embed-debug" style="display:block;font-size:0.75rem;color:#6b7280;margin-top:4px;">Shortcode: ${shortcodeEscaped}</span>`
    : "";
  const groupAttr = trimmedGroup
    ? ` data-group-value="${escapeHtml(trimmedGroup)}"`
    : "";
  return `
    <div class="${cfg.className} chart-embed" data-chart-id="${chartId}"${validPeriod ? ` data-period="${validPeriod}"` : ""}${groupAttr} data-shortcode="${shortcodeEscaped}">
      ${copyHtml}
      <iframe
        src="${url}"
        width="${cfg.width}"
        height="${height}"
        frameborder="0"
        loading="lazy"
        style="border: none; border-radius: 8px; background: #f8f9fa;"
        title="Chart ${chartId}"
      ></iframe>
      ${footerHtml}
      ${debugHtml}
    </div>
  `.trim();
}

/**
 * Generate an iframe embed HTML for a map.
 * Uses relative URL since /m/{hash} is a frontend route.
 */
export function getMapEmbed(shortHash: string, config: EmbedConfig = {}): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const height = cfg.mapHeight || cfg.height;
  const shortcode = `[map:${shortHash}]`;
  const shortcodeEscaped = escapeHtml(shortcode);
  const themeQuery = getEmbedThemeQuery();
  const url = `${mapInteractiveBaseUrl(shortHash)}${themeQuery}`;
  const chrome = getVisualizationEmbedChrome(
    "map",
    shortHash,
    config as VisualizationShortcodeConfig,
  );
  const copyHtml = getEmbedCopyHtml(chrome);
  const captionHtml = getEmbedCaptionHtml(chrome);
  const sourceHtml = getEmbedSourceHtml(chrome, { mapHash: shortHash });
  const footerHtml = getEmbedFooterHtml(captionHtml, sourceHtml);
  
  const debugHtml = cfg.showDebug
    ? `<span class="visualization-embed-debug" style="display:block;font-size:0.75rem;color:#6b7280;margin-top:4px;">Shortcode: ${shortcodeEscaped}</span>`
    : "";
  return `
    <div class="${cfg.className} map-embed" data-map-hash="${shortHash}" data-shortcode="${shortcodeEscaped}">
      ${copyHtml}
      <iframe 
        src="${url}" 
        width="${cfg.width}" 
        height="${height}" 
        frameborder="0" 
        loading="lazy"
        style="border: none; border-radius: 8px; background: #f8f9fa;"
        title="Map ${shortHash}"
      ></iframe>
      ${footerHtml}
      ${debugHtml}
    </div>
  `.trim();
}

/**
 * Generate an iframe embed HTML for an anomaly chart.
 * Uses relative URL since /a/{id} is a frontend route.
 */
export function getAnomalyEmbed(resultId: string | number, config: EmbedConfig = {}): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const height = cfg.anomalyHeight || cfg.height;
  const shortcode = `[anomaly:${resultId}]`;
  const shortcodeEscaped = escapeHtml(shortcode);
  const themeQuery = getEmbedThemeQuery();
  const url = `${anomalyInteractiveBaseUrl(resultId)}${themeQuery}`;
  const chrome = getVisualizationEmbedChrome(
    "anomaly",
    String(resultId),
    config as VisualizationShortcodeConfig,
  );
  const copyHtml = getEmbedCopyHtml(chrome);
  const captionHtml = getEmbedCaptionHtml(chrome);
  const sourceHtml = getEmbedSourceHtml(chrome, { anomalyId: resultId });
  const footerHtml = getEmbedFooterHtml(captionHtml, sourceHtml);
  
  const debugHtml = cfg.showDebug
    ? `<span class="visualization-embed-debug" style="display:block;font-size:0.75rem;color:#6b7280;margin-top:4px;">Shortcode: ${shortcodeEscaped}</span>`
    : "";
  return `
    <div class="${cfg.className} anomaly-embed" data-anomaly-id="${resultId}" data-shortcode="${shortcodeEscaped}">
      ${copyHtml}
      <iframe 
        src="${url}" 
        width="${cfg.width}" 
        height="${height}" 
        frameborder="0" 
        loading="lazy"
        style="border: none; border-radius: 8px; background: #f8f9fa;"
        title="Anomaly ${resultId}"
      ></iframe>
      ${footerHtml}
      ${debugHtml}
    </div>
  `.trim();
}

/**
 * Process HTML content and replace visualization shortcodes with iframe embeds.
 * 
 * Shortcode patterns:
 * - [chart:123]      - Time series chart (native period)
 * - [chart:123:ytd]  - Time series chart with period override (ytd/day/week/month/year)
 * - [chart:123|Group Value] - single subseries from a multi-category chart
 * - [chart:123:ytd|Group Value] - period + single subseries
 * - [map:abc123] or [map:AzOP6s-N] - Saved map by short hash (choropleth, delta, point, etc.)
 * - [anomaly:456]    - Anomaly detection result
 * 
 * @param html - The HTML content containing shortcodes
 * @param config - Optional embed configuration
 * @returns HTML with shortcodes replaced by iframe embeds
 */
/** Pipeline-only image prompt shortcodes; not rendered as embeds (strip for readers). */
const FEED_IMAGE_SHORTCODE_RE = /\[feed-image:[^\]]+\]/gi;

export function processVisualizationShortcodes(
  html: string,
  config: VisualizationShortcodeConfig = {},
): string {
  if (!html) return html;
  
  let processed = html;
  processed = processed.replace(FEED_IMAGE_SHORTCODE_RE, "");

  // Process chart shortcodes (period and optional |group_value)
  processed = processed.replace(chartShortcodeRegex(), (match, chartId, period, groupValue) => {
    const staticAsset = getStaticVisualizationAsset("chart", chartId, config);
    if (staticAsset && !period && !groupValue) {
      return getStaticVisualizationEmbed("chart", chartId, staticAsset, config);
    }
    return getChartEmbed(chartId, config, period, groupValue);
  });
  
  // Process map shortcodes: [map:abc123] or [map:AzOP6s-N] - alphanumeric + hyphens + underscores
  const mapRegex = /\[map:([a-zA-Z0-9_-]+)\]/g;
  processed = processed.replace(mapRegex, (match, shortHash) => {
    const staticAsset = getStaticVisualizationAsset("map", shortHash, config);
    if (staticAsset) {
      return getStaticVisualizationEmbed("map", shortHash, staticAsset, config);
    }
    return getMapEmbed(shortHash, config);
  });
  
  // Process anomaly shortcodes: [anomaly:456]
  const anomalyRegex = /\[anomaly:(\d+)\]/g;
  processed = processed.replace(anomalyRegex, (match, resultId) => {
    const staticAsset = getStaticVisualizationAsset("anomaly", resultId, config);
    if (staticAsset) {
      return getStaticVisualizationEmbed("anomaly", resultId, staticAsset, config);
    }
    return getAnomalyEmbed(resultId, config);
  });
  
  return processed;
}

/**
 * Extract all visualization references from HTML content.
 * Useful for preloading or debugging.
 */
export function extractVisualizationRefs(html: string): {
  charts: number[];
  maps: string[];
  anomalies: number[];
} {
  const charts: number[] = [];
  const maps: string[] = [];
  const anomalies: number[] = [];
  
  if (!html) return { charts, maps, anomalies };
  
  // Extract chart IDs (supports period and |group_value suffixes)
  const chartMatches = html.matchAll(chartShortcodeRegex());
  for (const match of chartMatches) {
    charts.push(parseInt(match[1], 10));
  }
  
  // Extract map hashes (alphanumeric + hyphens + underscores)
  const mapMatches = html.matchAll(/\[map:([a-zA-Z0-9_-]+)\]/g);
  for (const match of mapMatches) {
    maps.push(match[1]);
  }
  
  // Extract anomaly IDs
  const anomalyMatches = html.matchAll(/\[anomaly:(\d+)\]/g);
  for (const match of anomalyMatches) {
    anomalies.push(parseInt(match[1], 10));
  }
  
  return { charts, maps, anomalies };
}

/**
 * Check if HTML content contains any visualization shortcodes.
 */
export function hasVisualizationShortcodes(html: string): boolean {
  if (!html) return false;
  // Match [chart:123], [chart:123:ytd], [chart:123|Group], [map:abc-123], [anomaly:456]
  return /\[(chart|map|anomaly):[^\]]+\]/.test(html);
}

export function buildPrimaryVisualizationShortcodeConfig(
  story: VisualizationShortcodeStoryLike,
): VisualizationShortcodeConfig {
  const imageUrl = story.image_url?.trim();
  const visType = (story.visualization_type ?? "").toLowerCase();
  const pv = story.primary_visualization ?? null;

  if (!imageUrl || !pv || !visType) {
    return {};
  }

  const asset: StaticVisualizationAsset = {
    src: imageUrl,
    alt: story.image_alt,
    caption: story.image_caption,
    title: firstString(
      pv.title,
      pv.name,
      pv.label,
      story.image_alt,
    ),
    subtitle: story.image_caption,
    sourceLabel: getSourceLabelFromPrimaryVisualization(pv),
    sourceUrl:
      getSourceUrlFromPrimaryVisualization(pv) ||
      getExternalSourceUrl(story.detail_url),
  };
  const chrome: VisualizationEmbedChrome = {
    alt: asset.alt,
    caption: asset.caption,
    title: asset.title,
    subtitle: asset.subtitle,
    sourceLabel: asset.sourceLabel,
    sourceUrl: asset.sourceUrl,
    sourceDescription: asset.sourceDescription,
  };

  if (visType === "chart" && pv.id != null) {
    return {
      staticVisualizations: { charts: { [String(pv.id)]: asset } },
      embedChrome: { charts: { [String(pv.id)]: chrome } },
    };
  }

  if ((visType === "anomaly" || visType === "anomaly_chart") && pv.id != null) {
    return {
      staticVisualizations: { anomalies: { [String(pv.id)]: asset } },
      embedChrome: { anomalies: { [String(pv.id)]: chrome } },
    };
  }

  if (visType === "map" && typeof pv.short_hash === "string" && pv.short_hash) {
    return {
      staticVisualizations: { maps: { [pv.short_hash]: asset } },
      embedChrome: { maps: { [pv.short_hash]: chrome } },
    };
  }

  if (visType === "map" && pv.id != null) {
    return {
      staticVisualizations: { maps: { [String(pv.id)]: asset } },
      embedChrome: { maps: { [String(pv.id)]: chrome } },
    };
  }

  return {};
}

export function articleUsesPrimaryVisualizationShortcode(
  html: string | null | undefined,
  story: VisualizationShortcodeStoryLike,
): boolean {
  if (!html) return false;

  const visType = (story.visualization_type ?? "").toLowerCase();
  const pv = story.primary_visualization ?? null;
  if (!pv || !visType) return false;

  if (visType === "chart" && pv.id != null) {
    return new RegExp(`\\[chart:${String(pv.id)}(?:[:\\]])`).test(html);
  }

  if ((visType === "anomaly" || visType === "anomaly_chart") && pv.id != null) {
    return new RegExp(`\\[anomaly:${String(pv.id)}\\]`).test(html);
  }

  if (visType === "map") {
    if (typeof pv.short_hash === "string" && pv.short_hash) {
      return html.includes(`[map:${pv.short_hash}]`);
    }
    if (pv.id != null) {
      return html.includes(`[map:${String(pv.id)}]`);
    }
  }

  return false;
}
