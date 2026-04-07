/**
 * Utility for processing visualization shortcodes in research report HTML.
 *
 * Shortcode formats:
 * - Charts: [chart:123]       → embeds chart with ID 123 (native period)
 *           [chart:123:ytd]   → embeds chart with period override (ytd/day/week/month/year)
 *                               appends ?period=ytd to the iframe src
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

const DEFAULT_CONFIG: Required<EmbedConfig> = {
  width: "100%",
  height: "450px",
  chartHeight: "450px",  // Increased to accommodate header (36px) + chart content
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

const VALID_CHART_PERIODS = new Set(["day", "week", "month", "year", "ytd"]);

/**
 * Generate an iframe embed HTML for a chart.
 * Uses relative URL since /t/{id} is a frontend route.
 * @param period - Optional period override (day, week, month, year, ytd).
 *                 Appends ?period=... to the embed URL for the correct time window.
 */
export function getChartEmbed(chartId: string | number, config: EmbedConfig = {}, period?: string): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const height = cfg.chartHeight || cfg.height;
  const validPeriod = period && VALID_CHART_PERIODS.has(period.toLowerCase()) ? period.toLowerCase() : undefined;
  const shortcode = validPeriod ? `[chart:${chartId}:${validPeriod}]` : `[chart:${chartId}]`;
  const shortcodeEscaped = escapeHtml(shortcode);
  const themeQuery = getEmbedThemeQuery();
  const periodQuery = validPeriod ? `&period=${validPeriod}` : "";
  // Relative URL - /t/{id} is a frontend route in this same app
  const url = `/t/${chartId}?embedded=true${periodQuery}${themeQuery}`;
  
  const debugHtml = cfg.showDebug
    ? `<span class="visualization-embed-debug" style="display:block;font-size:0.75rem;color:#6b7280;margin-top:4px;">Shortcode: ${shortcodeEscaped}</span>`
    : "";
  return `
    <div class="${cfg.className} chart-embed" data-chart-id="${chartId}"${validPeriod ? ` data-period="${validPeriod}"` : ""} data-shortcode="${shortcodeEscaped}">
      <iframe 
        src="${url}" 
        width="${cfg.width}" 
        height="${height}" 
        frameborder="0" 
        loading="lazy"
        style="border: none; border-radius: 8px; background: #f8f9fa;"
        title="Chart ${chartId}"
      ></iframe>
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
  // Relative URL - /m/{hash} is a frontend route in this same app
  const url = `/m/${shortHash}?embedded=true${themeQuery}`;
  
  const debugHtml = cfg.showDebug
    ? `<span class="visualization-embed-debug" style="display:block;font-size:0.75rem;color:#6b7280;margin-top:4px;">Shortcode: ${shortcodeEscaped}</span>`
    : "";
  return `
    <div class="${cfg.className} map-embed" data-map-hash="${shortHash}" data-shortcode="${shortcodeEscaped}">
      <iframe 
        src="${url}" 
        width="${cfg.width}" 
        height="${height}" 
        frameborder="0" 
        loading="lazy"
        style="border: none; border-radius: 8px; background: #f8f9fa;"
        title="Map ${shortHash}"
      ></iframe>
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
  // Relative URL - /a/{id} is a frontend route
  const url = `/a/${resultId}?embedded=true${themeQuery}`;
  
  const debugHtml = cfg.showDebug
    ? `<span class="visualization-embed-debug" style="display:block;font-size:0.75rem;color:#6b7280;margin-top:4px;">Shortcode: ${shortcodeEscaped}</span>`
    : "";
  return `
    <div class="${cfg.className} anomaly-embed" data-anomaly-id="${resultId}" data-shortcode="${shortcodeEscaped}">
      <iframe 
        src="${url}" 
        width="${cfg.width}" 
        height="${height}" 
        frameborder="0" 
        loading="lazy"
        style="border: none; border-radius: 8px; background: #f8f9fa;"
        title="Anomaly ${resultId}"
      ></iframe>
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
 * - [map:abc123] or [map:AzOP6s-N] - Saved map by short hash (choropleth, delta, point, etc.)
 * - [anomaly:456]    - Anomaly detection result
 * 
 * @param html - The HTML content containing shortcodes
 * @param config - Optional embed configuration
 * @returns HTML with shortcodes replaced by iframe embeds
 */
/** Pipeline-only image prompt shortcodes; not rendered as embeds (strip for readers). */
const FEED_IMAGE_SHORTCODE_RE = /\[feed-image:[^\]]+\]/gi;

export function processVisualizationShortcodes(html: string, config: EmbedConfig = {}): string {
  if (!html) return html;
  
  let processed = html;
  processed = processed.replace(FEED_IMAGE_SHORTCODE_RE, "");

  // Process chart shortcodes: [chart:123] or [chart:123:ytd] (period-aware)
  const chartRegex = /\[chart:(\d+)(?::([a-z]+))?\]/g;
  processed = processed.replace(chartRegex, (match, chartId, period) => {
    return getChartEmbed(chartId, config, period);
  });
  
  // Process map shortcodes: [map:abc123] or [map:AzOP6s-N] - alphanumeric + hyphens + underscores
  const mapRegex = /\[map:([a-zA-Z0-9_-]+)\]/g;
  processed = processed.replace(mapRegex, (match, shortHash) => {
    return getMapEmbed(shortHash, config);
  });
  
  // Process anomaly shortcodes: [anomaly:456]
  const anomalyRegex = /\[anomaly:(\d+)\]/g;
  processed = processed.replace(anomalyRegex, (match, resultId) => {
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
  
  // Extract chart IDs (supports [chart:123] and [chart:123:ytd])
  const chartMatches = html.matchAll(/\[chart:(\d+)(?::[a-z]+)?\]/g);
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
  // Match [chart:123], [chart:123:ytd], [map:abc-123], [anomaly:456] patterns
  return /\[(chart|map|anomaly):[a-zA-Z0-9_-]+(?::[a-z]+)?\]/.test(html);
}
