/**
 * Shared popup content helpers for point maps (/m/[hash] page and
 * ProgressiveMapView). Point records carry whatever columns the map query
 * selected, so label/detail picking must be generic — not hardcoded to
 * incident_* fields.
 */

import { extractMediaUrl, isMediaField } from "@/lib/mediaUtils";

const HIDDEN_KEYS = new Set([
  "id",
  "lat",
  "lon",
  "latitude",
  "longitude",
  "lng",
  "count",
  "allPoints",
  "point",
  "location",
  "the_geom",
  "geometry",
  "value",
]);

/** Keys tried in order for an item's primary label. */
const LABEL_KEY_PRIORITY = [
  "incident_description",
  "description",
  "business_name",
  "dba_name",
  "project_name",
  "title",
  "service_name",
  "service_subtype",
  "request_type",
  "complaint_type",
];

const DATE_KEY_HINTS = ["date", "datetime", "_at", "opened", "requested", "closed"];

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/** Best human-readable label for a point record. */
export function pickPointLabel(pt: Record<string, unknown>, fallback: string): string {
  for (const key of LABEL_KEY_PRIORITY) {
    if (isNonEmptyString(pt[key])) return String(pt[key]);
  }
  // Generic: any *name* column that isn't geographic.
  for (const key of Object.keys(pt)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("name") &&
      !lower.includes("city") &&
      !lower.includes("state") &&
      !lower.includes("neighborhood") &&
      isNonEmptyString(pt[key])
    ) {
      return String(pt[key]);
    }
  }
  for (const key of Object.keys(pt)) {
    const lower = key.toLowerCase();
    if ((lower.includes("category") || lower.includes("type")) && isNonEmptyString(pt[key])) {
      return String(pt[key]);
    }
  }
  return fallback;
}

/** First parseable date across common date-ish columns, formatted for display. */
export function pickPointDate(pt: Record<string, unknown>): string | null {
  for (const key of Object.keys(pt)) {
    const lower = key.toLowerCase();
    if (!DATE_KEY_HINTS.some((h) => lower.includes(h))) continue;
    const raw = pt[key];
    if (!isNonEmptyString(raw)) continue;
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) return parsed.toLocaleDateString();
  }
  return null;
}

/** First media (photo) URL found on a point record, if any. */
export function pickPointMediaUrl(pt: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(pt)) {
    if (!isMediaField(key)) continue;
    const url = extractMediaUrl(value);
    if (url) return url;
  }
  return null;
}

/** Inline thumbnail markup for a point's photo (hidden automatically if it fails to load). */
function inlineMediaHtml(url: string): string {
  const safe = escapeHtml(url);
  return (
    `<a href="${safe}" target="_blank" rel="noopener noreferrer" style="display:block;margin:6px 0;">` +
    `<img src="${safe}" alt="Photo" loading="lazy" ` +
    `style="max-width:100%;max-height:160px;border-radius:6px;display:block;" ` +
    `onerror="this.parentElement.style.display='none';"/></a>`
  );
}

function detailRowsHtml(pt: Record<string, unknown>): string {
  let rows = "";
  const mediaUrl = pickPointMediaUrl(pt);
  if (mediaUrl) rows += inlineMediaHtml(mediaUrl);
  for (const [key, value] of Object.entries(pt)) {
    if (HIDDEN_KEYS.has(key)) continue;
    if (value == null || value === "") continue;
    if (typeof value === "object") continue;
    if (isMediaField(key)) continue; // rendered as inline image above
    rows += `<p style="margin:2px 0;"><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</p>`;
  }
  return rows;
}

export interface AggregatedItemsOptions {
  itemNoun?: string;
  seriesField?: string | null;
  seriesColors?: Record<string, string> | null;
}

/**
 * HTML list of an aggregated point's constituent records: each item is a
 * tap-to-expand <details> block — summary shows a colored series swatch (when
 * series coloring is active), the item's label, and its date; expanding
 * reveals every remaining field.
 */
export function buildAggregatedItemsHtml(
  points: Array<Record<string, unknown>>,
  opts: AggregatedItemsOptions = {}
): string {
  const itemNoun = opts.itemNoun || "item";
  let html = "";
  points.forEach((pt, i) => {
    const label = pickPointLabel(pt, `${itemNoun.charAt(0).toUpperCase() + itemNoun.slice(1)} ${i + 1}`);
    const date = pickPointDate(pt);
    const hasMedia = !!pickPointMediaUrl(pt);
    let swatch = "";
    if (opts.seriesField && opts.seriesColors) {
      const seriesValue = pt[opts.seriesField];
      const color = isNonEmptyString(seriesValue)
        ? opts.seriesColors[String(seriesValue)] || opts.seriesColors["Other"]
        : undefined;
      if (color) {
        swatch = `<span style="background:${escapeHtml(color)};width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:5px;flex:none;"></span>`;
      }
    }
    html += `<details style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #eee;">`;
    html += `<summary style="cursor:pointer;list-style-position:outside;">${swatch}<strong>${escapeHtml(label)}</strong>`;
    if (date) html += ` <small style="color:#666;">${escapeHtml(date)}</small>`;
    if (hasMedia) html += ` <span title="Has photo" style="font-size:11px;">📷</span>`;
    html += `</summary>`;
    html += `<div style="margin:6px 0 0 12px;font-size:12px;">${detailRowsHtml(pt)}</div>`;
    html += `</details>`;
  });
  return html;
}
