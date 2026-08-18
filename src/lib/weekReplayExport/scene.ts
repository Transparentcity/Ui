/**
 * Week Replay Export — scene builder.
 *
 * Turns the replay's API payload into everything the frame renderer needs,
 * resolved once up front: a Mapbox Static basemap at the chosen format's map
 * aspect, key-event photos as bitmaps, and every event coordinate and district
 * ring pre-projected into the map rect's pixel space. The renderer then paints
 * a frame at any playback time with no network and no per-frame projection.
 *
 * The playback timeline, key-moment picks, colors, and chart rows all mirror
 * WeekReplayMap so the exported video reads as the same unit the viewer just
 * watched, not a second interpretation of the same data.
 */

import type { BoundarySketch } from "@/lib/publicApiClient";
import {
  buildBasemapStaticUrl,
  lngToMercX,
  latToMercY,
  biasViewForLeftLabels,
  DEFAULT_PLACE_RADIUS_M,
  type MapBbox,
} from "@/lib/mapUtils";
import {
  buildDayNightBands,
  buildEventCallout,
  buildSubcategoryColors,
  buildPlaybackTimeline,
  eventDateKey,
  eventTimeMs,
  formatWindowRange,
  metricDisplayName,
  metricIcon,
  windowDateMs,
  type DayNightBand,
  type PlaybackTimeline,
  type WeekEventsResponse,
  type WeekEvent,
} from "@/lib/weekReplay";
import { computeScopeViewBbox, placePointBbox } from "@/components/MiniScopeMap";
import {
  basemapRequestSize,
  mapAspect,
  type ExportLayout,
} from "./formats";

/** Matches WeekReplayMap's cap so the exported timeline has the same holds. */
const MAX_KEY_MOMENTS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_COLOR = "#94a3b8";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ExportEvent {
  id: number;
  playMs: number;
  /** x within the layout's map rect. */
  x: number;
  /** y within the layout's map rect. */
  y: number;
  color: string;
  isKey: boolean;
  hasPhoto: boolean;
  /** The metric's emoji, drawn in place of a dot when it has one. */
  icon: string | null;
  /** Chart row this event counts toward (its section, or "Other"). */
  rowKey: string;
}

export interface ExportKeyMoment {
  playStartMs: number;
  playEndMs: number;
  event: ExportEvent;
  /** Metric emoji, drawn as the callout's leading glyph. */
  icon: string | null;
  label: string;
  /** Subcategory / metric · address · time. */
  meta: string;
  photo: ImageBitmap | null;
}

/** A district boundary ring, pre-projected into the map rect. */
export interface ExportRing {
  points: [number, number][];
  isCityOutline: boolean;
}

/** The saved place: its point, and the box the events were gathered from. */
export interface ExportPlace {
  x: number;
  y: number;
  box: { x: number; y: number; w: number; h: number };
  name: string | null;
}

export interface ExportChartRow {
  /** Metric id, and the key each event's `rowKey` points at. */
  key: string;
  label: string;
  icon: string | null;
  total: number;
  color: string;
}

export interface ExportScene {
  layout: ExportLayout;
  theme: "light" | "dark";
  /** Basemap bitmap sized to the map rect, or null without a Mapbox token. */
  basemap: ImageBitmap | null;
  events: ExportEvent[];
  keyMoments: ExportKeyMoment[];
  timeline: PlaybackTimeline;
  rings: ExportRing[];
  /** Null unless the replay is scoped to a saved place. */
  place: ExportPlace | null;
  chartRows: ExportChartRow[];
  /** Largest row total — the bar scale. */
  chartMax: number;
  dayNightBands: DayNightBand[];
  /** "Jul 12 – 18". */
  dateRange: string;
  /** "the Mission", "District 6", "San Francisco". */
  scopeLabel: string;
  /** Place scopes use "at"; district/city scopes use "in". */
  isPlaceScope: boolean;
  totalEvents: number;
}

// ── Chart rows (pure) ───────────────────────────────────────────────────────

interface ChartInput {
  metricId: number;
  metricName: string;
}

/**
 * Metric bars, busiest first.
 *
 * Mirrors WeekReplayMap's chart. The video can't scroll, so where the live
 * list caps its height and lets the rest scroll, this one keeps the top
 * `maxRows` metrics and folds the tail into a single "Other" bar.
 */
export function buildExportChartRows(
  events: ChartInput[],
  colors: Map<string, string>,
  maxRows: number,
): ExportChartRow[] {
  const totals = new Map<number, { name: string; total: number }>();
  for (const e of events) {
    const current = totals.get(e.metricId);
    if (current) current.total += 1;
    else totals.set(e.metricId, { name: e.metricName, total: 1 });
  }
  const ordered = [...totals.entries()].sort(
    (a, b) =>
      b[1].total - a[1].total ||
      metricDisplayName(a[1].name).localeCompare(metricDisplayName(b[1].name)),
  );

  const rows: ExportChartRow[] = ordered
    .slice(0, maxRows)
    .map(([metricId, v]) => ({
      key: String(metricId),
      label: metricDisplayName(v.name),
      icon: metricIcon(v.name),
      total: v.total,
      color: colors.get(String(metricId)) ?? FALLBACK_COLOR,
    }));
  const overflow = ordered.slice(maxRows);
  if (overflow.length > 0) {
    rows.push({
      key: "other",
      label: "Other",
      icon: null,
      total: overflow.reduce((n, [, v]) => n + v.total, 0),
      color: FALLBACK_COLOR,
    });
  }
  return rows;
}

// ── Projection ──────────────────────────────────────────────────────────────

function project(
  lng: number,
  lat: number,
  bbox: MapBbox,
  w: number,
  h: number,
): [number, number] {
  const x0 = lngToMercX(bbox.min_lng);
  const x1 = lngToMercX(bbox.max_lng);
  const yTop = latToMercY(bbox.max_lat);
  const yBottom = latToMercY(bbox.min_lat);
  return [
    ((lngToMercX(lng) - x0) / (x1 - x0 || 1e-9)) * w,
    ((latToMercY(lat) - yTop) / (yBottom - yTop || 1e-9)) * h,
  ];
}

// ── Image loading ───────────────────────────────────────────────────────────

/**
 * Bitmap for a cross-origin image, or null when it can't be read.
 *
 * A frame drawn from a tainted canvas can't be encoded, so anything the
 * browser won't hand over under CORS has to be dropped rather than drawn:
 * the export degrades to no basemap or no photo instead of failing.
 */
async function loadBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

/** Fallback path for hosts that allow `crossOrigin` img but not fetch. */
async function loadBitmapViaImage(url: string): Promise<ImageBitmap | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      createImageBitmap(img)
        .then(resolve)
        .catch(() => resolve(null));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ── Scene builder ───────────────────────────────────────────────────────────

export interface BuildExportSceneParams {
  data: WeekEventsResponse;
  layout: ExportLayout;
  sketch: BoundarySketch | null | undefined;
  /** 0 = citywide, >0 = district scope. */
  selectedDistrict: number;
  isPlaceScope: boolean;
  placeDistrict?: number | null;
  placeLat?: number | null;
  placeLng?: number | null;
  placeRadiusM?: number | null;
  scopeLabel: string;
  theme: "light" | "dark";
}

export async function buildExportScene(
  params: BuildExportSceneParams,
): Promise<ExportScene | null> {
  const {
    data,
    layout,
    sketch,
    selectedDistrict,
    isPlaceScope,
    placeDistrict,
    placeLat,
    placeLng,
    placeRadiusM,
    scopeLabel,
    theme,
  } = params;

  const aspect = mapAspect(layout);
  const highlightDistrict = isPlaceScope
    ? (placeDistrict ?? null)
    : selectedDistrict > 0
      ? selectedDistrict
      : null;

  let viewBbox = computeScopeViewBbox({
    sketch,
    highlightDistrict,
    isPlaceScope,
    placeLat,
    placeLng,
    placeRadiusM,
    aspect,
  });
  if (!viewBbox) return null;

  // Place scope: the same tightened, right-shifted crop the web unit uses, so
  // the block reads large and the left of the frame stays quiet for labels.
  if (isPlaceScope) {
    viewBbox = biasViewForLeftLabels(viewBbox, aspect, {
      leftGutter: 0.26,
      zoom: 0.6,
    });
  }

  const startKey = (data.window?.start || "").slice(0, 10);
  const endKey = (data.window?.end || "").slice(0, 10);
  const weekStartMs = windowDateMs(startKey);
  const weekEndMs = windowDateMs(endKey) + DAY_MS;
  if (!Number.isFinite(weekStartMs) || !Number.isFinite(weekEndMs)) return null;

  const mapW = layout.map.w;
  const mapH = layout.map.h;

  const placed: Array<WeekEvent & { weekMs: number; x: number; y: number }> = [];
  for (const e of data.events) {
    const key = eventDateKey(e.ts);
    if (key < startKey || key > endKey) continue;
    const weekMs = eventTimeMs(e.ts);
    if (!weekMs) continue;
    const [x, y] = project(e.lon, e.lat, viewBbox, mapW, mapH);
    if (x < -40 || x > mapW + 40 || y < -40 || y > mapH + 40) continue;
    placed.push({
      ...e,
      weekMs: Math.min(weekEndMs, Math.max(weekStartMs, weekMs)),
      x,
      y,
    });
  }
  if (!placed.length) return null;
  placed.sort((a, b) => a.weekMs - b.weekMs);

  // Photo-bearing events make the best slides; ranked key events fill the rest.
  const keyPicks: typeof placed = [];
  const seen = new Set<number>();
  for (const e of [
    ...placed.filter((e) => e.media_url).sort((a, b) => a.weekMs - b.weekMs),
    ...placed.filter((e) => e.is_key).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)),
  ]) {
    if (seen.has(e.id)) continue;
    keyPicks.push(e);
    seen.add(e.id);
    if (keyPicks.length >= MAX_KEY_MOMENTS) break;
  }
  keyPicks.sort((a, b) => a.weekMs - b.weekMs);

  const timeline = buildPlaybackTimeline(
    weekStartMs,
    weekEndMs,
    keyPicks.map((e) => e.weekMs),
  );
  // Keyed on the metric, matching the live unit: a bar, the events it stands
  // for, and that metric's note in the soundtrack all share one identity.
  const colors = buildSubcategoryColors(placed, (e) => String(e.metric_id));

  const chartRows = buildExportChartRows(
    placed.map((e) => ({ metricId: e.metric_id, metricName: e.metric_name })),
    colors,
    layout.maxChartRows,
  );
  const namedRows = new Set(chartRows.map((r) => r.key).filter((k) => k !== "other"));

  const events: ExportEvent[] = placed.map((e) => {
    const metricKey = String(e.metric_id);
    return {
      id: e.id,
      playMs: timeline.playTimeAt(e.weekMs),
      x: e.x,
      y: e.y,
      color: colors.get(metricKey) ?? FALLBACK_COLOR,
      isKey: e.is_key,
      hasPhoto: !!e.media_url,
      icon: metricIcon(e.metric_name),
      rowKey: namedRows.has(metricKey) ? metricKey : "other",
    };
  });
  const exportById = new Map(events.map((e) => [e.id, e] as const));

  // Load key-event photos up front; a failed fetch just means no image.
  const photos = new Map<number, ImageBitmap>();
  await Promise.all(
    keyPicks
      .filter((e) => e.media_url)
      .map(async (e) => {
        const bm = await loadBitmapViaImage(e.media_url!);
        if (bm) photos.set(e.id, bm);
      }),
  );

  // Holds are keyed by the exact week time they were built from. Picks that
  // merged into an earlier hold produce none and stay ordinary dots.
  const placedByWeekMs = new Map(placed.map((e) => [e.weekMs, e] as const));
  const keyMoments: ExportKeyMoment[] = [];
  for (const hold of timeline.holds) {
    const source = placedByWeekMs.get(hold.weekMs);
    const event = source ? exportById.get(source.id) : undefined;
    if (!source || !event) continue;
    // Same composition as the live callout, so a shared clip reads identically.
    const callout = buildEventCallout(source);
    keyMoments.push({
      playStartMs: hold.playStartMs,
      playEndMs: hold.playEndMs,
      event,
      icon: callout.icon,
      label: callout.title,
      meta: callout.detail,
      photo: photos.get(source.id) ?? null,
    });
  }

  const rings: ExportRing[] = [];
  for (const d of sketch?.districts ?? []) {
    for (const ring of d.rings) {
      rings.push({
        points: ring.map(([lng, lat]) => project(lng, lat, viewBbox!, mapW, mapH)),
        isCityOutline: false,
      });
    }
  }
  for (const ring of sketch?.outline ?? []) {
    rings.push({
      points: ring.map(([lng, lat]) => project(lng, lat, viewBbox!, mapW, mapH)),
      isCityOutline: true,
    });
  }

  // The place marker and its capture box, drawn whether or not the city has
  // shapes — for most place replays it is the only geography on the map.
  let place: ExportPlace | null = null;
  if (isPlaceScope && placeLat != null && placeLng != null) {
    const [px, py] = project(placeLng, placeLat, viewBbox, mapW, mapH);
    const box = placePointBbox(placeLat, placeLng, placeRadiusM ?? DEFAULT_PLACE_RADIUS_M);
    const [bx0, by0] = project(box.min_lng, box.max_lat, viewBbox, mapW, mapH);
    const [bx1, by1] = project(box.max_lng, box.min_lat, viewBbox, mapW, mapH);
    place = {
      x: px,
      y: py,
      box: { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 },
      name: scopeLabel.trim() || null,
    };
  }

  const { width: reqW, height: reqH } = basemapRequestSize(layout);
  const basemapUrl = buildBasemapStaticUrl(viewBbox, reqW, reqH, theme, 0);
  const basemap = basemapUrl
    ? ((await loadBitmap(basemapUrl)) ?? (await loadBitmapViaImage(basemapUrl)))
    : null;

  return {
    layout,
    theme,
    basemap,
    events,
    keyMoments,
    timeline,
    rings,
    place,
    chartRows,
    chartMax: Math.max(1, ...chartRows.map((r) => r.total)),
    dayNightBands: buildDayNightBands(timeline),
    dateRange: formatWindowRange(data.window?.start || "", data.window?.end || ""),
    scopeLabel,
    isPlaceScope,
    totalEvents: events.length,
  };
}
