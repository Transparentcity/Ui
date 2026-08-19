/**
 * Week Replay Export — canvas frame renderer.
 *
 * Paints one frame of the replay at a given playback time. Deterministic and
 * synchronous: the scene holds every bitmap and projected coordinate already,
 * so the same playMs always produces the same pixels. That is what lets the
 * encoder walk playback time at a fixed frame rate instead of screen-recording
 * the live DOM unit, and it is why the exported video matches on any machine.
 *
 * The visual language tracks WeekReplayMap deliberately: same dot colors and
 * sizes, same night scrim and weekend wash, same day/night ribbon, same
 * callout copy. A viewer who just watched the web unit should recognize the
 * video as the same thing rather than a redesign of it.
 */

import {
  weekendness,
  formatClockTime,
  formatClockWeekday,
  isNightAt,
  weekReplayScopePhrase,
} from "@/lib/weekReplay";
import { mixHex } from "../layerColors";
import type { ExportEvent, ExportScene } from "./scene";
import type { Rect } from "./formats";

// ── Look ────────────────────────────────────────────────────────────────────

const BRAND = "#ad35fa";
const MEDIA_GOLD = "#FFD700";

/** Matches WeekReplayMap: dimming spotlights the held event, not the clock. */
const SPOTLIGHT_SCRIM_MAX = 0.34;
/** Clear radius around the held event, in live-map units (see pulseRing). */
const SPOTLIGHT_CLEAR_R = 20;
const WEEKEND_WASH_MAX = 0.1;
/** Playback window after a dot lands during which its pulse ring shows. */
const PULSE_WINDOW_MS = 900;

const FONT_STACK =
  'Inter, "Helvetica Neue", Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

interface Palette {
  bg: string;
  panel: string;
  track: string;
  border: string;
  text: string;
  textDim: string;
  cardBg: string;
  cardBorder: string;
  ringDistrict: string;
  ringCity: string;
  /** Base the marker disc is tinted toward, so its icon stays readable. */
  markerFace: string;
}

function palette(theme: "light" | "dark"): Palette {
  return theme === "dark"
    ? {
        bg: "#0f172a",
        panel: "#1e293b",
        track: "rgba(148, 163, 184, 0.22)",
        border: "#334155",
        text: "#f1f5f9",
        textDim: "#94a3b8",
        cardBg: "rgba(15, 23, 42, 0.9)",
        cardBorder: "rgba(148, 163, 184, 0.32)",
        ringDistrict: "rgba(255, 255, 255, 0.3)",
        ringCity: "rgba(255, 255, 255, 0.5)",
        markerFace: "#0f172a",
      }
    : {
        bg: "#ffffff",
        panel: "#f8f9fa",
        track: "rgba(148, 163, 184, 0.2)",
        border: "#e5e7eb",
        text: "#111827",
        textDim: "#6b7280",
        cardBg: "rgba(255, 255, 255, 0.93)",
        cardBorder: "rgba(17, 24, 39, 0.12)",
        ringDistrict: "rgba(71, 85, 105, 0.35)",
        ringCity: "rgba(71, 85, 105, 0.6)",
        markerFace: "#ffffff",
      };
}

// ── Canvas helpers ──────────────────────────────────────────────────────────

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT_STACK}`;
}

/** `roundRect` is recent enough that a manual path keeps older Safari alive. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
  lineWidth = 2,
): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** Single line clipped to `maxWidth`, with an ellipsis when it doesn't fit. */
function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

/** Word-wrap to at most `maxLines`, ellipsizing the last one. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
  const rest = words.slice(consumed).join(" ");
  lines.push(ellipsize(ctx, rest || current, maxWidth));
  return lines.slice(0, maxLines);
}

// ── Header ──────────────────────────────────────────────────────────────────

function drawHeader(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  p: Palette,
): void {
  const { header, pad } = scene.layout;
  const titleSize = header.h >= 170 ? 58 : 46;
  const metaSize = header.h >= 170 ? 30 : 26;
  const inner = header.w - pad * 2;

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = font(700, titleSize);
  ctx.fillStyle = p.text;
  const title = ellipsize(
    ctx,
    `Your week ${weekReplayScopePhrase(scene.scopeLabel, scene.isPlaceScope)}`,
    inner,
  );
  ctx.fillText(title, header.x + pad, header.y + header.h * 0.52);

  ctx.font = font(600, metaSize);
  ctx.fillStyle = p.textDim;
  const meta = [scene.dateRange, `${scene.totalEvents} events mapped`]
    .filter(Boolean)
    .join(" · ");
  ctx.fillText(ellipsize(ctx, meta, inner), header.x + pad, header.y + header.h * 0.82);
}

// ── Map ─────────────────────────────────────────────────────────────────────

function drawBasemap(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  p: Palette,
): void {
  const { map } = scene.layout;
  if (scene.basemap) {
    ctx.drawImage(scene.basemap, 0, 0, map.w, map.h);
  } else {
    ctx.fillStyle = p.panel;
    ctx.fillRect(0, 0, map.w, map.h);
  }

  for (const ring of scene.rings) {
    if (ring.points.length < 2) continue;
    ctx.beginPath();
    ring.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.strokeStyle = ring.isCityOutline ? p.ringCity : p.ringDistrict;
    ctx.lineWidth = ring.isCityOutline ? 3 : 2;
    ctx.stroke();
  }

  drawPlace(ctx, scene, p);
}

/**
 * The saved place: a dashed box around the area events were gathered from, and
 * a dot on the place itself.
 *
 * Matches the live unit's overlay. It is drawn regardless of whether the city
 * has district shapes, because for a place replay it is usually the only thing
 * on the map that says where you are.
 */
function drawPlace(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  p: Palette,
): void {
  const place = scene.place;
  if (!place) return;
  const scale = scene.layout.map.w / 960;

  ctx.save();
  ctx.setLineDash([6 * scale, 5 * scale]);
  ctx.strokeStyle = BRAND;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2 * scale;
  ctx.strokeRect(place.box.x, place.box.y, place.box.w, place.box.h);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(place.x, place.y, 8 * scale, 0, Math.PI * 2);
  ctx.fillStyle = BRAND;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;

  if (place.name) {
    ctx.font = font(700, 21 * scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    // Haloed, because it sits over streets and can't rely on the basemap.
    ctx.lineWidth = 4 * scale;
    ctx.strokeStyle = p.bg;
    ctx.strokeText(place.name, place.x, place.y - 18 * scale);
    ctx.fillStyle = BRAND;
    ctx.fillText(place.name, place.x, place.y - 18 * scale);
    ctx.textAlign = "left";
  }
}

function drawWeekendWash(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  weekMs: number,
): void {
  const { map } = scene.layout;
  const weekend = weekendness(weekMs) * WEEKEND_WASH_MAX;
  if (weekend <= 0.002) return;
  const g = ctx.createLinearGradient(0, 0, map.w * 0.35, map.h);
  g.addColorStop(0, BRAND);
  g.addColorStop(1, "#f0abfc");
  ctx.globalAlpha = weekend;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, map.w, map.h);
  ctx.globalAlpha = 1;
}

/**
 * One event: the metric's icon when it has one, else a colored dot.
 *
 * Matches the live unit, where icons let a glance read "graffiti, permit,
 * assault" instead of decoding a color legend.
 */
function drawEvent(
  ctx: CanvasRenderingContext2D,
  e: ExportEvent,
  playMs: number,
  isKeyNow: boolean,
  scale: number,
  p: Palette,
): void {
  const age = playMs - e.playMs;

  // Pulse ring: expands and fades over the window after the event lands, so
  // the eye is drawn to what is new without every marker competing.
  if (age <= PULSE_WINDOW_MS) {
    const f = age / PULSE_WINDOW_MS;
    ctx.beginPath();
    ctx.arc(e.x, e.y, (5 + f * 14) * scale, 0, Math.PI * 2);
    ctx.strokeStyle = e.color;
    ctx.globalAlpha = (1 - f) * 0.85;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (isKeyNow) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, 19 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = e.hasPhoto ? MEDIA_GOLD : BRAND;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Colored disc first, icon on top of it: the disc is what ties a marker back
  // to its row in the chart, since the icons carry no color of their own. Where
  // there is an icon the face is only tinted, so the glyph stays readable.
  const r = (isKeyNow ? 13 : e.isKey || e.hasPhoto ? 9.5 : 8.5) * scale;
  ctx.beginPath();
  ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
  ctx.fillStyle = e.icon ? mixHex(e.color, p.markerFace, 0.22) : e.color;
  ctx.globalAlpha = isKeyNow || age <= PULSE_WINDOW_MS ? 1 : 0.88;
  ctx.fill();
  ctx.strokeStyle = e.hasPhoto ? MEDIA_GOLD : e.color;
  ctx.lineWidth = (e.hasPhoto || isKeyNow ? 3 : 2) * scale;
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (e.icon) {
    ctx.font = `${r * 1.35}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(e.icon, e.x, e.y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}

/**
 * Pool of light around the held event, dark everywhere else.
 *
 * Painted between the routine markers and the held one, so it pushes back the
 * whole map except the thing the callout is naming. The clear radius matches
 * the reach of the pulse ring an event throws when it lands.
 */
function drawSpotlight(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  at: { x: number; y: number },
  level: number,
  scale: number,
): void {
  const { map } = scene.layout;
  const veil = level * SPOTLIGHT_SCRIM_MAX;
  if (veil <= 0.002) return;

  const clear = SPOTLIGHT_CLEAR_R * scale;
  const outer = Math.max(map.w, map.h);
  const g = ctx.createRadialGradient(at.x, at.y, clear, at.x, at.y, outer);
  g.addColorStop(0, "rgba(2, 6, 23, 0)");
  g.addColorStop(Math.min(0.999, (clear * 2.6) / outer), "rgba(2, 6, 23, 0.7)");
  g.addColorStop(Math.min(0.999, (clear * 6) / outer), "rgba(2, 6, 23, 0.95)");
  g.addColorStop(1, "rgba(2, 6, 23, 1)");
  ctx.globalAlpha = veil;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, map.w, map.h);
  ctx.globalAlpha = 1;
}

/** Sun or crescent, matching the clock's day/night glyph on the web unit. */
function drawDaypartGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  night: boolean,
  color: string,
): void {
  ctx.fillStyle = color;
  if (night) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.55, cy - r * 0.35, r * 0.95, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
}

function drawClock(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  weekMs: number,
  p: Palette,
): number {
  const x = 28;
  const y = 28;
  const h = 62;
  const glyphR = 15;

  ctx.font = font(700, 30);
  const dayText = formatClockWeekday(weekMs);
  const timeText = formatClockTime(weekMs);
  const dayW = ctx.measureText(dayText).width;
  ctx.font = font(600, 28);
  const timeW = ctx.measureText(timeText).width;
  const w = 24 + glyphR * 2 + 14 + dayW + 14 + timeW + 24;

  fillRoundRect(ctx, x, y, w, h, 14, p.cardBg, p.cardBorder, 1.5);

  const night = isNightAt(weekMs);
  drawDaypartGlyph(ctx, x + 24 + glyphR, y + h / 2, glyphR, night, p.text);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = font(700, 30);
  ctx.fillStyle = p.text;
  ctx.fillText(dayText, x + 24 + glyphR * 2 + 14, y + h / 2 + 1);
  ctx.font = font(600, 28);
  ctx.fillStyle = p.textDim;
  ctx.fillText(timeText, x + 24 + glyphR * 2 + 14 + dayW + 14, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";

  void scene;
  return y + h;
}

/**
 * The callout for the key event currently holding the screen.
 *
 * Drops in under the clock and fades out over the tail of its hold, so
 * consecutive key moments read as separate cards rather than one card whose
 * text swaps mid-shot.
 */
function drawKeyCallout(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  playMs: number,
  topY: number,
  p: Palette,
): void {
  const moment = scene.keyMoments.find(
    (m) => playMs >= m.playStartMs && playMs <= m.playEndMs,
  );
  if (!moment) return;

  const { map } = scene.layout;
  const enter = Math.min(1, (playMs - moment.playStartMs) / 260);
  const leave = Math.min(1, Math.max(0, (moment.playEndMs - playMs) / 320));
  const alpha = Math.min(enter, leave);
  if (alpha <= 0.01) return;

  const x = 28;
  const w = Math.min(map.w - 56, Math.max(420, map.w * 0.6));
  const inner = w - 40;
  const photoH = moment.photo ? Math.round(w * 0.46) : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, (1 - enter) * -12);

  ctx.font = font(700, 38);
  const labelLines = wrap(
    ctx,
    moment.icon ? `${moment.icon} ${moment.label}` : moment.label,
    inner,
    2,
  );
  ctx.font = font(600, 27);
  const metaLine = moment.meta ? ellipsize(ctx, moment.meta, inner) : "";

  const h =
    20 +
    photoH +
    (photoH ? 18 : 0) +
    labelLines.length * 46 +
    (metaLine ? 38 : 0) +
    18;
  const y = topY + 16;

  fillRoundRect(ctx, x, y, w, h, 18, p.cardBg, p.cardBorder, 1.5);

  let cursor = y + 20;
  if (moment.photo && photoH) {
    ctx.save();
    roundRectPath(ctx, x + 20, cursor, inner, photoH, 12);
    ctx.clip();
    // Cover-fit: fill the slot and crop the overflow rather than letterbox.
    const scale = Math.max(inner / moment.photo.width, photoH / moment.photo.height);
    const dw = moment.photo.width * scale;
    const dh = moment.photo.height * scale;
    ctx.drawImage(
      moment.photo,
      x + 20 + (inner - dw) / 2,
      cursor + (photoH - dh) / 2,
      dw,
      dh,
    );
    ctx.restore();
    cursor += photoH + 18;
  }

  ctx.textAlign = "left";
  ctx.font = font(700, 38);
  ctx.fillStyle = p.text;
  for (const line of labelLines) {
    cursor += 38;
    ctx.fillText(line, x + 20, cursor);
    cursor += 8;
  }
  if (metaLine) {
    ctx.font = font(600, 27);
    ctx.fillStyle = p.textDim;
    cursor += 28;
    ctx.fillText(metaLine, x + 20, cursor);
  }

  ctx.restore();
}

/**
 * Day/night/weekend ribbon along the bottom of the map, with the playhead.
 *
 * Same rhythm the map washes itself with, laid out across the whole week, so
 * time of day and day of week stay readable without a separate scrubber.
 */
function drawRibbon(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  playMs: number,
): void {
  const { map } = scene.layout;
  const h = 14;
  const y = map.h - h - 22;
  const x = 24;
  const w = map.w - 48;

  ctx.save();
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.clip();
  ctx.fillStyle = "rgba(148, 163, 184, 0.34)";
  ctx.fillRect(x, y, w, h);
  for (const band of scene.dayNightBands) {
    ctx.fillStyle =
      band.isNight && band.isWeekend
        ? "rgba(126, 34, 206, 0.9)"
        : band.isNight
          ? "rgba(51, 65, 85, 0.9)"
          : band.isWeekend
            ? "rgba(173, 53, 250, 0.45)"
            : "rgba(148, 163, 184, 0.34)";
    ctx.fillRect(x + band.startF * w, y, Math.max(1, (band.endF - band.startF) * w), h);
  }
  ctx.restore();

  const f = scene.timeline.durationMs
    ? Math.min(1, playMs / scene.timeline.durationMs)
    : 0;
  ctx.save();
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.clip();
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  ctx.fillRect(x, y, f * w, h);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x + f * w, y + h / 2, h * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = BRAND;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function drawMap(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  playMs: number,
  p: Palette,
): void {
  const { map } = scene.layout;
  const weekMs = scene.timeline.weekTimeAt(playMs);
  const activeKey =
    scene.keyMoments.find((m) => playMs >= m.playStartMs && playMs <= m.playEndMs) ??
    null;
  // Ramped in and out with the callout, so the map falls back rather than cuts.
  const spotlight = activeKey
    ? Math.max(
        0,
        Math.min(
          Math.min(1, (playMs - activeKey.playStartMs) / 260),
          Math.min(1, Math.max(0, (activeKey.playEndMs - playMs) / 320)),
        ),
      )
    : 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(map.x, map.y, map.w, map.h);
  ctx.clip();
  ctx.translate(map.x, map.y);

  // Markers are sized against the live unit's map so the two read alike.
  const scale = map.w / 960;
  drawBasemap(ctx, scene, p);
  drawWeekendWash(ctx, scene, weekMs);

  const heldId = activeKey?.event.id ?? null;
  for (const e of scene.events) {
    if (e.playMs > playMs || e.id === heldId) continue;
    drawEvent(ctx, e, playMs, false, scale, p);
  }
  if (activeKey) {
    drawSpotlight(ctx, scene, activeKey.event, spotlight, scale);
    drawEvent(ctx, activeKey.event, playMs, true, scale, p);
  }
  drawRibbon(ctx, scene, playMs);
  const clockBottom = drawClock(ctx, scene, weekMs, p);
  drawKeyCallout(ctx, scene, playMs, clockBottom, p);

  ctx.restore();
}

// ── Chart ───────────────────────────────────────────────────────────────────

function drawChart(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  playMs: number,
  p: Palette,
): void {
  const { chart, pad, chartBesideMap } = scene.layout;
  const rows = scene.chartRows;
  if (!rows.length) return;

  const live = new Map<string, number>();
  for (const e of scene.events) {
    if (e.playMs > playMs) continue;
    live.set(e.rowKey, (live.get(e.rowKey) ?? 0) + 1);
  }

  const left = chart.x + (chartBesideMap ? 24 : pad);
  const right = chart.x + chart.w - pad;
  const width = right - left;
  const labelW = Math.round(width * (chartBesideMap ? 0.44 : 0.34));
  const countW = 78;
  const trackX = left + labelW + 16;
  const trackW = Math.max(60, width - labelW - countW - 32);

  const rowH = Math.min(76, (chart.h - 24) / rows.length);
  const barH = Math.min(26, rowH * 0.42);
  const fontSize = Math.min(30, Math.max(20, rowH * 0.42));
  const blockH = rowH * rows.length;
  let y = chart.y + (chart.h - blockH) / 2;

  ctx.textBaseline = "middle";
  for (const row of rows) {
    const count = live.get(row.key) ?? 0;
    const cy = y + rowH / 2;

    ctx.textAlign = "left";
    ctx.font = font(600, fontSize);
    ctx.fillStyle = p.textDim;
    const label = row.icon ? `${row.icon} ${row.label}` : row.label;
    ctx.fillText(ellipsize(ctx, label, labelW), left, cy);

    fillRoundRect(ctx, trackX, cy - barH / 2, trackW, barH, barH / 2, p.track);
    const barW = (count / scene.chartMax) * trackW;
    if (barW > 1) {
      fillRoundRect(
        ctx,
        trackX,
        cy - barH / 2,
        Math.max(barH, barW),
        barH,
        barH / 2,
        row.color,
      );
    }

    ctx.textAlign = "right";
    ctx.font = font(700, fontSize);
    ctx.fillStyle = p.text;
    ctx.fillText(String(count), right, cy);

    y += rowH;
  }
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

// ── Footer ──────────────────────────────────────────────────────────────────

/** The corner-brace mark: opposite L braces, as in the favicon and loader. */
function drawBracketMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  const arm = size * 0.42;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, size * 0.13);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(x + arm, y + size);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x, y + size - arm);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + size - arm, y);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + size, y + arm);
  ctx.stroke();
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  p: Palette,
): void {
  const { footer, pad } = scene.layout;
  const cy = footer.y + footer.h / 2;
  const markSize = Math.min(46, footer.h * 0.42);

  drawBracketMark(ctx, footer.x + pad, cy - markSize / 2, markSize, BRAND);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = font(700, 34);
  ctx.fillStyle = p.text;
  ctx.fillText("transparent.city", footer.x + pad + markSize + 20, cy + 1);

  ctx.textAlign = "right";
  ctx.font = font(600, 27);
  ctx.fillStyle = p.textDim;
  const tagline = "See your city clearly.";
  if (
    ctx.measureText(tagline).width <
    footer.w - pad * 2 - markSize - 260
  ) {
    ctx.fillText(tagline, footer.x + footer.w - pad, cy + 1);
  }
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

// ── Outro ───────────────────────────────────────────────────────────────────

/**
 * Closing card over the finished map.
 *
 * The last thing on screen in a shared clip is what a viewer screenshots or
 * pauses on, so the tail states the count, the scope, and where it came from.
 */
function drawOutro(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  level: number,
  p: Palette,
): void {
  if (level <= 0.01) return;
  const { map } = scene.layout;

  ctx.save();
  ctx.globalAlpha = Math.min(1, level);

  ctx.fillStyle = scene.theme === "dark" ? "rgba(15, 23, 42, 0.62)" : "rgba(255, 255, 255, 0.7)";
  ctx.fillRect(map.x, map.y, map.w, map.h);

  const w = Math.min(map.w - 96, 760);
  const h = 300;
  const x = map.x + (map.w - w) / 2;
  const y = map.y + (map.h - h) / 2;
  // Rises slightly as it fades in, so the card lands rather than appears.
  ctx.translate(0, (1 - Math.min(1, level)) * 18);
  fillRoundRect(ctx, x, y, w, h, 24, p.cardBg, p.cardBorder, 2);

  ctx.textAlign = "center";
  ctx.font = font(800, 108);
  ctx.fillStyle = p.text;
  ctx.fillText(String(scene.totalEvents), x + w / 2, y + 130);

  ctx.font = font(700, 34);
  ctx.fillStyle = p.text;
  ctx.fillText(
    ellipsize(
      ctx,
      `events mapped ${weekReplayScopePhrase(scene.scopeLabel, scene.isPlaceScope)}`,
      w - 60,
    ),
    x + w / 2,
    y + 190,
  );

  ctx.font = font(600, 28);
  ctx.fillStyle = p.textDim;
  ctx.fillText(
    [scene.dateRange, "transparent.city"].filter(Boolean).join(" · "),
    x + w / 2,
    y + 244,
  );

  ctx.textAlign = "left";
  ctx.restore();
}

// ── Frame ───────────────────────────────────────────────────────────────────

export interface RenderFrameOptions {
  /** 0–1 fade-in of the closing card during the tail after playback ends. */
  outro?: number;
}

/** Paint one frame of `scene` at `playMs`. */
export function renderExportFrame(
  ctx: CanvasRenderingContext2D,
  scene: ExportScene,
  playMs: number,
  options: RenderFrameOptions = {},
): void {
  const p = palette(scene.theme);
  const clamped = Math.min(Math.max(0, playMs), scene.timeline.durationMs);

  ctx.save();
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, scene.layout.width, scene.layout.height);

  drawHeader(ctx, scene, p);
  drawMap(ctx, scene, clamped, p);
  drawChart(ctx, scene, clamped, p);
  drawFooter(ctx, scene, p);
  drawOutro(ctx, scene, options.outro ?? 0, p);

  ctx.restore();
}

/** Rects the renderer paints into — exported for preview overlays and tests. */
export function frameRects(scene: ExportScene): Record<string, Rect> {
  const { header, map, chart, footer } = scene.layout;
  return { header, map, chart, footer };
}
