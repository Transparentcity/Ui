/**
 * Build copyable permalink assets (absolute URLs, iframe snippets) from the
 * site-relative paths the ops API returns for a metric's charts, maps, and
 * anomalies.
 */

export type MetricAssetKind = "chart" | "map" | "anomaly";

/** Default iframe heights, matched to the shortcode embeds in story HTML. */
export const EMBED_HEIGHTS: Record<MetricAssetKind, number> = {
  chart: 480,
  map: 500,
  anomaly: 400,
};

/** Public origin for shared links; the configured site URL wins over the admin's host. */
export function shareOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function absoluteUrl(path: string, origin: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = origin.replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function iframeSnippet(
  embedPath: string,
  title: string,
  kind: MetricAssetKind,
  origin: string,
): string {
  const src = escapeAttr(absoluteUrl(embedPath, origin));
  return (
    `<iframe src="${src}" title="${escapeAttr(title)}" width="100%" ` +
    `height="${EMBED_HEIGHTS[kind]}" style="border:0;" loading="lazy"></iframe>`
  );
}
