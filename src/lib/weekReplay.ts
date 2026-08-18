/**
 * Week Replay — pure timeline math and shared types for the animated
 * "Your Week Replay" hero unit (WeekReplayMap).
 *
 * The 7-day window maps linearly onto playback time (each day =
 * DAY_PLAYBACK_MS), except around key events where playback eases to a slow
 * rate for a short hold so the callout card is readable. The mapping is a
 * piecewise-linear set of anchors, so week-time ↔ playback-time conversion
 * is exact in both directions (scrub round-trips cleanly).
 *
 * Time of day and weekends are surfaced two ways, both driven from here:
 * continuously (:func:`nightness` / :func:`weekendness` dim and tint the map
 * as the clock runs) and as a static overview (:func:`buildDayNightBands`
 * draws the whole week's rhythm under the scrubber).
 */

import { LAYER_COLOR_PALETTE } from "./layerColors";

// ── API types (mirror /api/user/week-events) ───────────────────────────────

export type WeekEventGroup =
  | "crime"
  | "safety"
  | "311"
  | "permits"
  | "business"
  | "transit"
  | "government"
  | "other";

export interface WeekEvent {
  id: number;
  ts: string;
  lat: number;
  lon: number;
  label: string;
  /**
   * Which one it was: the row's most identifying value, picked server-side from
   * the metric's own SELECT list ("Corgi Cafe" for a business opening). Null
   * when the dataset has nothing beyond the type.
   */
  detail?: string | null;
  address: string | null;
  metric_id: number;
  metric_name: string;
  /** Metric subcategory — drives dot colors and the live bar chart. */
  subcategory?: string | null;
  /** Dashboard section this metric belongs to (city_metric_ordering rename,
      else metric category) — the chart's top level mirrors the dashboard. */
  dash_category?: string | null;
  /** Dashboard section order (lower = earlier; 1000 = unordered default). */
  dash_category_order?: number | null;
  group: WeekEventGroup;
  score: number;
  is_key: boolean;
  rank: number | null;
  /** Direct-linkable 311 photo (Cloudinary), when the map row had one. */
  media_url?: string | null;
}

export interface WeekKeyEvent {
  id: number;
  rank: number;
  ts: string;
  label: string;
  address: string | null;
  metric_name: string;
  group: WeekEventGroup;
  media_url?: string | null;
}

export interface WeekEventsResponse {
  status: string;
  events: WeekEvent[];
  key_events: WeekKeyEvent[];
  group_counts: Record<string, number>;
  total_before_cap: number;
  window: { start: string; end: string };
  scope: { city_id: number; district: number | null; is_place: boolean };
  /** True while the server-side fan-out is still running (poll for more). */
  partial?: boolean;
  /** Data sources completed vs total for the current fill. */
  progress?: { done: number; total: number };
}

// ── Display groups ─────────────────────────────────────────────────────────

/** Dot colors per display group. Brand purple is reserved for key-event pins. */
export const GROUP_COLORS: Record<WeekEventGroup, string> = {
  crime: "#ef4444",
  safety: "#f97316",
  "311": "#0ea5e9",
  permits: "#10b981",
  business: "#eab308",
  transit: "#6366f1",
  government: "#14b8a6",
  other: "#94a3b8",
};

export const GROUP_LABELS: Record<WeekEventGroup, string> = {
  crime: "Crime",
  safety: "Safety",
  "311": "311",
  permits: "Permits",
  business: "Business",
  transit: "Transit",
  government: "City",
  other: "Other",
};

export function groupColor(group: string): string {
  return GROUP_COLORS[group as WeekEventGroup] ?? GROUP_COLORS.other;
}

export function groupLabel(group: string): string {
  return GROUP_LABELS[group as WeekEventGroup] ?? GROUP_LABELS.other;
}

// ── Subcategory colors ─────────────────────────────────────────────────────

/**
 * Categorical palette for dashboard sections (dot colors + bar chart).
 *
 * Taken from the shared layer palette in the order it defines, so a category
 * here reads as the same family of colors the metric and shape map layers use
 * rather than as a second, unrelated scheme. Brand purple leads that palette
 * but is skipped here: on this unit it is already spoken for by key-event pins,
 * the weekend wash, and the scrubber's playhead.
 */
export const SUBCATEGORY_PALETTE: readonly string[] = LAYER_COLOR_PALETTE.filter(
  (color) => color.toLowerCase() !== "#ad35fa",
);

const SUBCATEGORY_FALLBACK_COLOR = "#94a3b8";

/** Chart key for an event: subcategory when present, else its display group. */
export function eventSubcategoryKey(e: {
  subcategory?: string | null;
  group: string;
}): string {
  const sub = (e.subcategory || "").trim();
  return sub || groupLabel(e.group);
}

/** "public_safety" → "Public Safety" (same as the dashboard's section labels). */
export function formatDashCategoryLabel(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Top-level chart key: the metric's dashboard section, formatted like the
 * dashboard's headers. Falls back to the subcategory key for events from
 * older snapshots that don't carry the field.
 */
export function eventDashCategoryKey(e: {
  dash_category?: string | null;
  subcategory?: string | null;
  group: string;
}): string {
  const raw = (e.dash_category || "").trim();
  return raw ? formatDashCategoryLabel(raw) : eventSubcategoryKey(e);
}

// ── Metric icons ───────────────────────────────────────────────────────────

/** Leading emoji sequence in a metric name ("🧽 311 Offensive Graffiti…"). */
const LEADING_ICON_RE =
  /^\s*((?:\p{Extended_Pictographic}[\uFE0F\u200D]?)+)\s*/u;

/** The metric's emoji icon (e.g. "🧽", "📋✅"), or null when it has none. */
export function metricIcon(metricName: string): string | null {
  const m = (metricName || "").match(LEADING_ICON_RE);
  return m ? m[1] : null;
}

/** Metric name with its leading emoji icon stripped. */
export function metricDisplayName(metricName: string): string {
  return (metricName || "").replace(LEADING_ICON_RE, "").trim();
}

/**
 * Text with every leading icon removed, not just the first run.
 *
 * Event labels fall back to the metric name server-side, so a label can arrive
 * already carrying the metric's emoji — and sometimes more than one, separated
 * by spaces, which a single strip leaves behind. Callouts render the icon as
 * its own element, so anything left at the front of the text shows up as a
 * duplicate of it.
 */
export function stripLeadingIcons(text: string): string {
  let out = (text || "").trim();
  for (;;) {
    const next = out.replace(LEADING_ICON_RE, "").trim();
    if (next === out) return out;
    out = next;
  }
}

// ── Event callouts ─────────────────────────────────────────────────────────

export interface EventCallout {
  /** The metric's emoji, rendered once as its own element. */
  icon: string | null;
  /** The metric's name — the same for every event of that metric. */
  title: string;
  /** What narrows it to this event: subtype, address, time. */
  detail: string;
}

/**
 * Compose the one-icon, no-repetition callout used by every event card.
 *
 * Every metric is treated the same way: the metric's icon and name are the
 * title, and the line beneath narrows it to this particular event. Titling a
 * card with whatever descriptor a dataset happened to supply made the same
 * metric read differently city to city — Oakland's property crime rows carry
 * their own subtype text and so were titled by it, while SF's business openings
 * carry none and were titled by the metric. Now the title is always the metric
 * and the subtype always sits below it.
 *
 * The line beneath leads with the most specific thing available: the row's own
 * identifying value ("Corgi Cafe"), else its subtype text ("Burglary - Auto"),
 * else the metric's subcategory or dashboard section. Candidates that merely
 * echo the title are skipped, so a metric named after its own subtype doesn't
 * say it twice.
 */
export function buildEventCallout(e: {
  label: string;
  metric_name: string;
  detail?: string | null;
  subcategory?: string | null;
  dash_category?: string | null;
  address?: string | null;
  ts: string;
}): EventCallout {
  const icon = metricIcon(e.metric_name) ?? metricIcon(e.label);
  const title = stripLeadingIcons(e.metric_name) || stripLeadingIcons(e.label);

  /**
   * Redundant when either string contains the other, not just on an exact
   * match: "Abandoned Vehicle" under "Abandoned Vehicle Complaints (311)" is
   * an echo, and reads as one.
   */
  const echoesTitle = (value: string) => {
    const a = value.trim().toLowerCase();
    const b = title.toLowerCase();
    if (!a) return true;
    return a === b || b.includes(a) || a.includes(b);
  };

  const section = (e.dash_category || "").trim()
    ? formatDashCategoryLabel((e.dash_category || "").trim())
    : "";
  const candidates = [
    (e.detail || "").trim(),
    stripLeadingIcons(e.label),
    (e.subcategory || "").trim(),
    section,
  ];
  const context = candidates.find((value) => value && !echoesTitle(value)) ?? null;

  return {
    icon,
    title,
    detail: [context, (e.address || "").trim() || null, formatEventTime(e.ts)]
      .filter(Boolean)
      .join(" · "),
  };
}

/**
 * Assign palette colors to chart keys by descending event count so the most
 * common series get the most distinguishable hues. Deterministic for a given
 * event set (ties broken alphabetically); overflow gets gray. Keys default to
 * the subcategory but callers can group differently (e.g. dashboard section).
 */
export function buildSubcategoryColors<
  E extends { subcategory?: string | null; group: string },
>(events: E[], keyOf: (e: E) => string = eventSubcategoryKey): Map<string, string> {
  const counts = new Map<string, number>();
  for (const e of events) {
    const key = keyOf(e);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ordered = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const colors = new Map<string, string>();
  ordered.forEach(([key], i) => {
    colors.set(
      key,
      i < SUBCATEGORY_PALETTE.length
        ? SUBCATEGORY_PALETTE[i]
        : SUBCATEGORY_FALLBACK_COLOR,
    );
  });
  return colors;
}

// ── Playback timeline ──────────────────────────────────────────────────────

/**
 * Playback duration per day of week-time (before key-event holds). Fast
 * enough that routine dots and the bar chart build up as texture between
 * key moments rather than asking to be read one by one.
 */
export const DAY_PLAYBACK_MS = 1800;
/** Real (playback) duration of a key-event hold — long enough to read. */
export const KEY_HOLD_PLAYBACK_MS = 2400;
/**
 * Week-time advances at this fraction of normal speed during a hold — almost,
 * but not quite, frozen. At a full day per DAY_PLAYBACK_MS a hold would
 * otherwise run the clock forward by hours while a callout sits on screen
 * naming a specific minute, and the two would visibly disagree. Kept just
 * above zero so week-time ↔ playback-time stays invertible for scrubbing.
 */
export const KEY_HOLD_RATE = 0.02;

interface TimelineAnchor {
  playMs: number;
  weekMs: number;
}

export interface PlaybackTimeline {
  /** Total playback duration in ms (includes key-event holds). */
  durationMs: number;
  weekStartMs: number;
  weekEndMs: number;
  /** Week timestamp (ms epoch) at a playback time. Clamped to the window. */
  weekTimeAt(playMs: number): number;
  /** Playback time (ms) at which a week timestamp is reached. */
  playTimeAt(weekMs: number): number;
  /** Playback windows [start, end] of each key-event hold, in event order. */
  holds: Array<{ playStartMs: number; playEndMs: number; weekMs: number }>;
}

/**
 * Build the piecewise-linear playback ↔ week-time mapping.
 *
 * @param weekStartMs  epoch ms of the window start (inclusive)
 * @param weekEndMs    epoch ms of the window end (exclusive-ish; clock max)
 * @param keyEventTimesMs  epoch ms of key events (any order; out-of-window
 *   and duplicate/overlapping holds are merged or dropped)
 */
export function buildPlaybackTimeline(
  weekStartMs: number,
  weekEndMs: number,
  keyEventTimesMs: number[],
  opts?: {
    dayPlaybackMs?: number;
    holdPlaybackMs?: number;
    holdRate?: number;
  }
): PlaybackTimeline {
  const dayMs = 24 * 60 * 60 * 1000;
  const dayPlaybackMs = opts?.dayPlaybackMs ?? DAY_PLAYBACK_MS;
  const holdPlaybackMs = opts?.holdPlaybackMs ?? KEY_HOLD_PLAYBACK_MS;
  const holdRate = opts?.holdRate ?? KEY_HOLD_RATE;

  /** Week-ms that elapse per playback-ms at normal speed. */
  const normalRate = dayMs / dayPlaybackMs;

  const anchors: TimelineAnchor[] = [{ playMs: 0, weekMs: weekStartMs }];
  const holds: PlaybackTimeline["holds"] = [];

  const keyTimes = [...keyEventTimesMs]
    .filter((t) => t >= weekStartMs && t <= weekEndMs)
    .sort((a, b) => a - b);

  let playMs = 0;
  let weekMs = weekStartMs;
  for (const t of keyTimes) {
    if (t <= weekMs) {
      // Inside (or before) the previous hold — merged; no extra hold.
      continue;
    }
    // Normal-speed run up to the key event.
    playMs += (t - weekMs) / normalRate;
    weekMs = t;
    anchors.push({ playMs, weekMs });
    // Hold: slow week-time advance while the callout shows.
    const holdWeekSpan = holdPlaybackMs * normalRate * holdRate;
    const holdEndWeek = Math.min(weekMs + holdWeekSpan, weekEndMs);
    const actualHoldPlay =
      holdWeekSpan > 0
        ? holdPlaybackMs * ((holdEndWeek - weekMs) / holdWeekSpan)
        : holdPlaybackMs;
    holds.push({
      playStartMs: playMs,
      playEndMs: playMs + actualHoldPlay,
      weekMs: t,
    });
    playMs += actualHoldPlay;
    weekMs = holdEndWeek;
    anchors.push({ playMs, weekMs });
    if (weekMs >= weekEndMs) break;
  }
  if (weekMs < weekEndMs) {
    playMs += (weekEndMs - weekMs) / normalRate;
    weekMs = weekEndMs;
    anchors.push({ playMs, weekMs });
  }

  const durationMs = playMs;

  function weekTimeAt(p: number): number {
    if (p <= 0) return weekStartMs;
    if (p >= durationMs) return weekEndMs;
    for (let i = 1; i < anchors.length; i++) {
      if (p <= anchors[i].playMs) {
        const a = anchors[i - 1];
        const b = anchors[i];
        const f = (p - a.playMs) / (b.playMs - a.playMs || 1e-9);
        return a.weekMs + f * (b.weekMs - a.weekMs);
      }
    }
    return weekEndMs;
  }

  function playTimeAt(w: number): number {
    if (w <= weekStartMs) return 0;
    if (w >= weekEndMs) return durationMs;
    for (let i = 1; i < anchors.length; i++) {
      if (w <= anchors[i].weekMs) {
        const a = anchors[i - 1];
        const b = anchors[i];
        const f = (w - a.weekMs) / (b.weekMs - a.weekMs || 1e-9);
        return a.playMs + f * (b.playMs - a.playMs);
      }
    }
    return durationMs;
  }

  return { durationMs, weekStartMs, weekEndMs, weekTimeAt, playTimeAt, holds };
}

// ── Day / night / weekend ──────────────────────────────────────────────────

/** Hours bounding the visually dark part of a day (used for the ribbon). */
const NIGHT_START_HOUR = 20;
const NIGHT_END_HOUR = 6;
/** Twilight ramps for the continuous map dimming. */
const DAWN_START_HOUR = 5;
const DAWN_END_HOUR = 8;
const DUSK_START_HOUR = 17;
const DUSK_END_HOUR = 21;
/** Half-width of the weekend tint's cross-fade either side of midnight. */
const WEEKEND_RAMP_MS = 90 * 60 * 1000;

function isWeekendDay(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/** Local midnight starting the day ``offset`` days from ``d``. */
function midnightOffset(d: Date, offset: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
}

/** Is this instant on a Saturday or Sunday (local time)? */
export function isWeekendAt(weekMs: number): boolean {
  return isWeekendDay(new Date(weekMs).getDay());
}

/** Is this instant in the night window (local 8pm–6am), matching the ribbon. */
export function isNightAt(weekMs: number): boolean {
  const h = new Date(weekMs).getHours();
  return h < NIGHT_END_HOUR || h >= NIGHT_START_HOUR;
}

/**
 * How dark it is: 0 in full daylight, 1 in deep night, ramping across dawn
 * and dusk. Drives the map's night scrim, so it has to be continuous —
 * a step at sunset would read as a glitch mid-playback.
 */
export function nightness(weekMs: number): number {
  const d = new Date(weekMs);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= DAWN_END_HOUR && h <= DUSK_START_HOUR) return 0;
  if (h < DAWN_START_HOUR || h >= DUSK_END_HOUR) return 1;
  if (h < DAWN_END_HOUR) {
    return 1 - (h - DAWN_START_HOUR) / (DAWN_END_HOUR - DAWN_START_HOUR);
  }
  return (h - DUSK_START_HOUR) / (DUSK_END_HOUR - DUSK_START_HOUR);
}

/**
 * Weekend membership as a 0–1 value, cross-fading across midnight so the
 * map's warm weekend wash arrives with the evening rather than popping on.
 *
 * The fade is centered on midnight and reaches exactly 0.5 there from either
 * side, so the value stays continuous as the clock crosses the boundary.
 */
export function weekendness(weekMs: number): number {
  const d = new Date(weekMs);
  const here = isWeekendDay(d.getDay()) ? 1 : 0;
  const dayStart = midnightOffset(d, 0).getTime();
  const dayEnd = midnightOffset(d, 1).getTime();

  if (weekMs - dayStart < WEEKEND_RAMP_MS) {
    const before = isWeekendDay(midnightOffset(d, -1).getDay()) ? 1 : 0;
    const f = 0.5 + (weekMs - dayStart) / (2 * WEEKEND_RAMP_MS);
    return before + (here - before) * f;
  }
  if (dayEnd - weekMs < WEEKEND_RAMP_MS) {
    const after = isWeekendDay(midnightOffset(d, 1).getDay()) ? 1 : 0;
    const f = 0.5 + (dayEnd - weekMs) / (2 * WEEKEND_RAMP_MS);
    return after + (here - after) * f;
  }
  return here;
}

/** One day/night stretch of the week, positioned in playback time. */
export interface DayNightBand {
  /** Start as a fraction [0,1] of total playback duration. */
  startF: number;
  /** End as a fraction [0,1] of total playback duration. */
  endF: number;
  isNight: boolean;
  isWeekend: boolean;
}

/**
 * The week's day/night stretches laid out along the scrubber.
 *
 * Positions run through ``playTimeAt`` rather than straight week-time
 * fractions: key-event holds stretch parts of the week, and the bands have to
 * stay under the same playhead the day ticks and labels use.
 *
 * Bands break at midnight as well as at dusk and dawn, so each one belongs to
 * a single calendar day. Without that, the night straddling Friday into
 * Saturday would be tagged as weekend and contradict the day labels.
 */
export function buildDayNightBands(timeline: PlaybackTimeline): DayNightBand[] {
  const { weekStartMs, weekEndMs, durationMs } = timeline;
  if (!(durationMs > 0) || !(weekEndMs > weekStartMs)) return [];

  const first = new Date(weekStartMs);
  const edges = new Set<number>([weekStartMs, weekEndMs]);
  for (let day = 0; day <= 7; day++) {
    const base = midnightOffset(first, day);
    for (const hour of [0, NIGHT_END_HOUR, NIGHT_START_HOUR]) {
      const t = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate(),
        hour,
      ).getTime();
      if (t > weekStartMs && t < weekEndMs) edges.add(t);
    }
  }

  const sorted = [...edges].sort((a, b) => a - b);
  const bands: DayNightBand[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const mid = new Date((from + to) / 2);
    const hour = mid.getHours();
    bands.push({
      startF: timeline.playTimeAt(from) / durationMs,
      endF: timeline.playTimeAt(to) / durationMs,
      isNight: hour < NIGHT_END_HOUR || hour >= NIGHT_START_HOUR,
      isWeekend: isWeekendDay(mid.getDay()),
    });
  }
  return bands;
}

// ── Formatting ─────────────────────────────────────────────────────────────

export function formatClockWeekday(weekMs: number): string {
  const d = new Date(weekMs);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${weekday} ${month} ${d.getDate()}`;
}

export function formatClockTime(weekMs: number): string {
  return new Date(weekMs).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "8:14 PM" for callout cards and tooltips.
 *
 * No weekday: callouts sit directly under the replay's own clock, which names
 * the day already, and repeating it there costs a line that could carry
 * something the reader doesn't have.
 *
 * Datasets that record a date but no time arrive as exact midnight, and
 * printing "12:00 AM" for them claims a precision the source doesn't have, so
 * those return nothing at all.
 */
export function formatEventTime(ts: string): string {
  const ms = eventTimeMs(ts);
  if (!ms) return "";
  const d = new Date(ms);
  const isMidnight =
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0;
  if (isMidnight) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Playback position as a clock ("0:24"), for the scrubber's time readout.
 *
 * Floors rather than rounds, so the readout never claims a second that hasn't
 * elapsed and never shows a total longer than the replay actually runs.
 */
export function formatPlaybackClock(playMs: number): string {
  const total = Math.max(0, Math.floor(playMs / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/** 1-based day index within the window (1..7) for "day N of 7". */
export function dayIndexInWindow(weekMs: number, weekStartMs: number): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.min(7, Math.max(1, Math.floor((weekMs - weekStartMs) / dayMs) + 1));
}

/** Parse an event timestamp to epoch ms for the playback clock.

 * Date-only strings (`YYYY-MM-DD`) are treated as *local* midnight. JS's
 * `Date` parses them as UTC midnight, which shifts events a day earlier in
 * US timezones and can drop them outside the week window entirely.
 */
export function eventTimeMs(ts: string): number {
  const trimmed = (ts || "").trim();
  if (!trimmed) return 0;
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    return new Date(y, m - 1, d).getTime();
  }
  // Naive local datetime (no Z / offset): keep as local.
  const naive = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/,
  );
  if (naive) {
    return new Date(
      Number(naive[1]),
      Number(naive[2]) - 1,
      Number(naive[3]),
      Number(naive[4]),
      Number(naive[5]),
      Number(naive[6] || 0),
    ).getTime();
  }
  const t = new Date(trimmed).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Local-midnight epoch ms for an API window date (`YYYY-MM-DD` or ISO). */
export function windowDateMs(isoDate: string): number {
  const key = (isoDate || "").slice(0, 10);
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** Calendar YYYY-MM-DD from an event timestamp (prefer prefix; else local). */
export function eventDateKey(ts: string): string {
  const trimmed = (ts || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const ms = eventTimeMs(trimmed);
  if (!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Weekday + date labels ("Mon 13") for the scrubber's 7 day segments. */
export function windowDayLabels(weekStartMs: number): string[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartMs + i * dayMs);
    labels.push(
      `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()}`
    );
  }
  return labels;
}

/** "Jul 12 – 18" (or "Jul 28 – Aug 3" across months) for a window. */
export function formatWindowRange(startIso: string, endIso: string): string {
  const startMs = windowDateMs(startIso);
  const endMs = windowDateMs(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "";
  const s = new Date(startMs);
  const e = new Date(endMs);
  const sLabel = s.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const eLabel =
    s.getMonth() === e.getMonth()
      ? String(e.getDate())
      : e.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${sLabel} – ${eLabel}`;
}

/**
 * Prepositional phrase for a replay scope. A place is somewhere you are
 * ("at Bay"); a district or city is somewhere things happen ("in District 6").
 * Shared by the live unit, share sheet, and exported video title card.
 */
export function weekReplayScopePhrase(
  scopeLabel: string,
  isPlaceScope: boolean,
): string {
  const label = scopeLabel.trim() || (isPlaceScope ? "your place" : "your city");
  return isPlaceScope ? `at ${label}` : `in ${label}`;
}
