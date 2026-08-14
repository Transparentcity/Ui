/**
 * Export renderer tests.
 *
 * jsdom has no real 2D context, so these drive the renderer through a
 * recording stand-in. That still covers what actually breaks a video export:
 * a frame that throws, a NaN coordinate (which silently drops a shape), an
 * unbalanced save/restore (which leaks a clip into the next frame), or a frame
 * that stops being a pure function of playback time.
 */
import { describe, it, expect } from "vitest";

import { mixHex } from "@/lib/layerColors";
import { buildPlaybackTimeline } from "@/lib/weekReplay";
import { buildExportLayout, getExportFormat, EXPORT_FORMATS } from "./formats";
import { renderExportFrame } from "./renderer";
import type { ExportScene } from "./scene";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_START = new Date(2026, 6, 20).getTime(); // Monday local
const WEEK_END = WEEK_START + 7 * DAY_MS;

interface Call {
  method: string;
  args: unknown[];
}

/** Records every drawing call and every numeric argument passed to it. */
class RecordingContext {
  calls: Call[] = [];
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";
  globalAlpha = 1;
  font = "10px sans-serif";
  textAlign = "left";
  textBaseline = "alphabetic";

  private record(method: string, args: unknown[]): void {
    this.calls.push({ method, args });
  }

  // Colors are recorded too, so tests can assert on what a shape was painted
  // with and not just where it landed.
  private currentFill: unknown = "";
  private currentStroke: unknown = "";

  get fillStyle(): unknown {
    return this.currentFill;
  }
  set fillStyle(value: unknown) {
    this.currentFill = value;
    this.record("set:fillStyle", [value]);
  }
  get strokeStyle(): unknown {
    return this.currentStroke;
  }
  set strokeStyle(value: unknown) {
    this.currentStroke = value;
    this.record("set:strokeStyle", [value]);
  }

  save() {
    this.record("save", []);
  }
  restore() {
    this.record("restore", []);
  }
  translate(...a: number[]) {
    this.record("translate", a);
  }
  setTransform(...a: number[]) {
    this.record("setTransform", a);
  }
  beginPath() {
    this.record("beginPath", []);
  }
  closePath() {
    this.record("closePath", []);
  }
  moveTo(...a: number[]) {
    this.record("moveTo", a);
  }
  lineTo(...a: number[]) {
    this.record("lineTo", a);
  }
  arc(...a: number[]) {
    this.record("arc", a);
  }
  arcTo(...a: number[]) {
    this.record("arcTo", a);
  }
  rect(...a: number[]) {
    this.record("rect", a);
  }
  clip(...a: unknown[]) {
    this.record("clip", a);
  }
  fill(...a: unknown[]) {
    this.record("fill", a);
  }
  stroke() {
    this.record("stroke", []);
  }
  fillRect(...a: number[]) {
    this.record("fillRect", a);
  }
  strokeRect(...a: number[]) {
    this.record("strokeRect", a);
  }
  setLineDash(...a: unknown[]) {
    this.record("setLineDash", a);
  }
  strokeText(text: string, x: number, y: number) {
    this.record("strokeText", [text, x, y]);
  }
  fillText(text: string, x: number, y: number) {
    this.record("fillText", [text, x, y]);
  }
  drawImage(...a: unknown[]) {
    this.record("drawImage", a);
  }
  createLinearGradient(...a: number[]) {
    this.record("createLinearGradient", a);
    return { addColorStop: () => undefined };
  }
  createRadialGradient(...a: number[]) {
    this.record("createRadialGradient", a);
    return { addColorStop: () => undefined };
  }
  measureText(text: string) {
    const size = Number(this.font.match(/(\d+)px/)?.[1] ?? 10);
    return { width: text.length * size * 0.55 };
  }

  /** Every number the renderer handed to a drawing call. */
  numbers(): number[] {
    return this.calls.flatMap((c) => c.args.filter((a): a is number => typeof a === "number"));
  }

  countOf(method: string): number {
    return this.calls.filter((c) => c.method === method).length;
  }

  texts(): string[] {
    return this.calls
      .filter((c) => c.method === "fillText")
      .map((c) => String(c.args[0]));
  }

  /** Depth after replaying save/restore; 0 means the frame cleaned up. */
  saveBalance(): number {
    let depth = 0;
    for (const c of this.calls) {
      if (c.method === "save") depth += 1;
      if (c.method === "restore") depth -= 1;
      if (depth < 0) return depth;
    }
    return depth;
  }

  asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
}

function makeScene(overrides: Partial<ExportScene> = {}): ExportScene {
  const layout = buildExportLayout(getExportFormat("story"));
  // Two key events, so the timeline has holds and the callout has something
  // to show at the times the tests probe.
  const keyTimes = [WEEK_START + 2 * DAY_MS, WEEK_START + 5 * DAY_MS];
  const timeline = buildPlaybackTimeline(WEEK_START, WEEK_END, keyTimes);

  const events = Array.from({ length: 40 }, (_, i) => ({
    id: i + 1,
    playMs: (i / 40) * timeline.durationMs,
    x: (i % 8) * 130 + 20,
    y: Math.floor(i / 8) * 190 + 30,
    color: i % 2 ? "#ef4444" : "#0ea5e9",
    isKey: i % 13 === 0,
    hasPhoto: i % 11 === 0,
    // Every third metric has no emoji, so both marker paths get exercised.
    icon: i % 3 === 0 ? null : i % 2 ? "🚨" : "🧽",
    // Points at one of the chart rows below, keyed by metric id.
    rowKey: i % 3 === 0 ? "1" : "2",
  }));

  const keyMoments = timeline.holds.map((hold, i) => ({
    playStartMs: hold.playStartMs,
    playEndMs: hold.playEndMs,
    event: events[i * 10 + 3],
    icon: i === 0 ? "🧽" : null,
    label: "Graffiti reported on a very long street name that has to wrap somewhere",
    meta: "Offensive Graffiti · 1234 Mission St",
    photo: i === 0 ? ({ width: 800, height: 600 } as ImageBitmap) : null,
  }));

  return {
    layout,
    theme: "light",
    basemap: null,
    events,
    keyMoments,
    timeline,
    rings: [
      { points: [[10, 10], [200, 20], [180, 300]], isCityOutline: false },
      { points: [[0, 0], [1080, 0], [1080, 1020], [0, 1020]], isCityOutline: true },
    ],
    place: null,
    chartRows: [
      { key: "1", label: "Assaults", icon: "🚨", total: 14, color: "#ef4444" },
      { key: "2", label: "Housing Permits", icon: null, total: 26, color: "#0ea5e9" },
    ],
    chartMax: 26,
    dayNightBands: [
      { startF: 0, endF: 0.3, isNight: true, isWeekend: false },
      { startF: 0.3, endF: 0.7, isNight: false, isWeekend: false },
      { startF: 0.7, endF: 1, isNight: true, isWeekend: true },
    ],
    dateRange: "Jul 20 – 26",
    scopeLabel: "the Mission",
    totalEvents: 40,
    ...overrides,
  };
}

describe("renderExportFrame", () => {
  it("draws every format without throwing, and cleans up its state", () => {
    for (const format of EXPORT_FORMATS) {
      const scene = makeScene({ layout: buildExportLayout(format) });
      for (const theme of ["light", "dark"] as const) {
        const ctx = new RecordingContext();
        renderExportFrame(ctx.asContext(), { ...scene, theme }, scene.timeline.durationMs * 0.5);
        expect(ctx.calls.length).toBeGreaterThan(50);
        expect(ctx.saveBalance()).toBe(0);
      }
    }
  });

  it("never emits a NaN or infinite coordinate", () => {
    const scene = makeScene();
    for (const f of [0, 0.17, 0.5, 0.83, 1]) {
      const ctx = new RecordingContext();
      renderExportFrame(ctx.asContext(), scene, scene.timeline.durationMs * f);
      for (const n of ctx.numbers()) expect(Number.isFinite(n)).toBe(true);
    }
  });

  it("is a pure function of playback time", () => {
    const scene = makeScene();
    const at = scene.timeline.durationMs * 0.4;
    const first = new RecordingContext();
    const second = new RecordingContext();
    renderExportFrame(first.asContext(), scene, at);
    renderExportFrame(second.asContext(), scene, at);
    expect(JSON.stringify(second.calls)).toBe(JSON.stringify(first.calls));
  });

  it("reveals dots as playback advances", () => {
    const scene = makeScene();
    const arcsAt = (f: number) => {
      const ctx = new RecordingContext();
      renderExportFrame(ctx.asContext(), scene, scene.timeline.durationMs * f);
      return ctx.countOf("arc");
    };
    expect(arcsAt(0.25)).toBeLessThan(arcsAt(0.6));
    expect(arcsAt(0.6)).toBeLessThan(arcsAt(1));
  });

  it("counts up the chart bars in step with the dots", () => {
    const scene = makeScene();
    const countsAt = (f: number) => {
      const ctx = new RecordingContext();
      renderExportFrame(ctx.asContext(), scene, scene.timeline.durationMs * f);
      // The chart's two numerals are the only pure-digit strings drawn.
      return ctx
        .texts()
        .filter((t) => /^\d+$/.test(t))
        .reduce((sum, t) => sum + Number(t), 0);
    };
    expect(countsAt(0.2)).toBeGreaterThan(0);
    expect(countsAt(0.2)).toBeLessThan(countsAt(0.9));
    expect(countsAt(1)).toBe(scene.totalEvents);
  });

  it("titles the frame with the scope, date range, and brand", () => {
    const scene = makeScene();
    const ctx = new RecordingContext();
    renderExportFrame(ctx.asContext(), scene, 0);
    const texts = ctx.texts();
    expect(texts.some((t) => t.includes("the Mission"))).toBe(true);
    expect(texts.some((t) => t.includes("Jul 20 – 26"))).toBe(true);
    expect(texts).toContain("transparent.city");
  });

  it("shows the key-event callout only during its hold", () => {
    const scene = makeScene();
    const hold = scene.keyMoments[0];
    const hasCallout = (playMs: number) => {
      const ctx = new RecordingContext();
      renderExportFrame(ctx.asContext(), scene, playMs);
      return ctx.texts().some((t) => t.includes("Graffiti reported"));
    };
    expect(hasCallout((hold.playStartMs + hold.playEndMs) / 2)).toBe(true);
    expect(hasCallout(hold.playEndMs + 500)).toBe(false);
  });

  it("draws the callout photo cover-fitted inside the card", () => {
    const scene = makeScene();
    const hold = scene.keyMoments[0];
    const ctx = new RecordingContext();
    renderExportFrame(ctx.asContext(), scene, (hold.playStartMs + hold.playEndMs) / 2);
    const draw = ctx.calls.find((c) => c.method === "drawImage");
    expect(draw).toBeDefined();
    const [, , , w, h] = draw!.args as [unknown, number, number, number, number];
    // Cover-fit preserves the source 4:3, so it can't match the slot exactly.
    expect(w / h).toBeCloseTo(800 / 600, 3);
  });

  it("draws the metric's icon for events that have one, dots for the rest", () => {
    const scene = makeScene();
    const ctx = new RecordingContext();
    renderExportFrame(ctx.asContext(), scene, scene.timeline.durationMs);
    const icons = ctx.texts().filter((t) => t === "🚨" || t === "🧽");
    const withIcons = scene.events.filter((e) => e.icon).length;
    expect(icons.length).toBe(withIcons);
    // Every event gets a disc, icon or not.
    expect(ctx.countOf("arc")).toBeGreaterThanOrEqual(scene.events.length);
  });

  it("rings every marker in its metric color so the map matches the chart", () => {
    const scene = makeScene();
    const ctx = new RecordingContext();
    renderExportFrame(ctx.asContext(), scene, scene.timeline.durationMs);
    const strokes = new Set(
      ctx.calls
        .filter((c) => c.method === "set:strokeStyle")
        .map((c) => String(c.args[0]).toLowerCase()),
    );
    for (const color of new Set(scene.events.map((e) => e.color))) {
      expect(strokes).toContain(color.toLowerCase());
    }
  });

  it("tints, rather than floods, the face behind an icon", () => {
    const scene = makeScene();
    const withIcon = scene.events.find((e) => e.icon)!;
    const ctx = new RecordingContext();
    renderExportFrame(ctx.asContext(), scene, scene.timeline.durationMs);
    const fills = ctx.calls
      .filter((c) => c.method === "set:fillStyle")
      .map((c) => String(c.args[0]).toLowerCase());
    // The icon's disc is filled with a pale mix, never the raw metric color.
    expect(fills).toContain(mixHex(withIcon.color, "#ffffff", 0.22).toLowerCase());
  });

  it("centers the spotlight on the held event, not the frame", () => {
    const scene = makeScene();
    const hold = scene.keyMoments[0];
    const ctx = new RecordingContext();
    renderExportFrame(ctx.asContext(), scene, (hold.playStartMs + hold.playEndMs) / 2);
    const gradient = ctx.calls.find((c) => c.method === "createRadialGradient");
    expect(gradient).toBeDefined();
    const [x0, y0, r0] = gradient!.args as number[];
    expect(x0).toBeCloseTo(hold.event.x, 3);
    expect(y0).toBeCloseTo(hold.event.y, 3);
    // A clear pool the size of the pulse ring, rather than starting at zero.
    expect(r0).toBeGreaterThan(15);
  });

  it("spotlights the held key moment instead of dimming for nightfall", () => {
    const scene = makeScene();
    const hold = scene.keyMoments[0];
    const veilAt = (playMs: number) => {
      const ctx = new RecordingContext();
      renderExportFrame(ctx.asContext(), scene, playMs);
      return ctx.countOf("createRadialGradient");
    };
    // Mid-hold the map is veiled; between holds nothing dims it.
    expect(veilAt((hold.playStartMs + hold.playEndMs) / 2)).toBe(1);
    expect(veilAt(hold.playEndMs + 800)).toBe(0);
  });

  it("does not dim the map as the week's nights pass", () => {
    const scene = makeScene();
    // Sample a full week between holds; a night scrim would show up as a
    // gradient on some of these and not others.
    const veils = [0.06, 0.12, 0.2, 0.34, 0.62, 0.9].map((f) => {
      const at = scene.timeline.durationMs * f;
      const inHold = scene.keyMoments.some(
        (m) => at >= m.playStartMs && at <= m.playEndMs,
      );
      const ctx = new RecordingContext();
      renderExportFrame(ctx.asContext(), scene, at);
      return { inHold, gradients: ctx.countOf("createRadialGradient") };
    });
    for (const sample of veils) {
      if (!sample.inHold) expect(sample.gradients).toBe(0);
    }
  });

  it("adds the closing card only once the outro starts", () => {
    const scene = makeScene();
    const withoutOutro = new RecordingContext();
    renderExportFrame(withoutOutro.asContext(), scene, scene.timeline.durationMs);
    expect(withoutOutro.texts()).not.toContain("40");

    const withOutro = new RecordingContext();
    renderExportFrame(withOutro.asContext(), scene, scene.timeline.durationMs, {
      outro: 1,
    });
    const texts = withOutro.texts();
    expect(texts).toContain("40");
    expect(texts.some((t) => t.includes("events mapped in the Mission"))).toBe(true);
  });

  it("clamps out-of-range playback times instead of drawing past the week", () => {
    const scene = makeScene();
    const end = new RecordingContext();
    const past = new RecordingContext();
    renderExportFrame(end.asContext(), scene, scene.timeline.durationMs);
    renderExportFrame(past.asContext(), scene, scene.timeline.durationMs * 3);
    expect(JSON.stringify(past.calls)).toBe(JSON.stringify(end.calls));

    const start = new RecordingContext();
    const before = new RecordingContext();
    renderExportFrame(start.asContext(), scene, 0);
    renderExportFrame(before.asContext(), scene, -5000);
    expect(JSON.stringify(before.calls)).toBe(JSON.stringify(start.calls));
  });

  it("draws the place and its capture box, with no city shapes at all", () => {
    // Most place replays are in cities we have no boundary data for; the place
    // is then the only thing on the map that says where you are.
    const scene = makeScene({
      rings: [],
      place: {
        x: 520,
        y: 430,
        box: { x: 400, y: 320, w: 240, h: 220 },
        name: "Bay",
      },
    });
    const ctx = new RecordingContext();
    renderExportFrame(ctx.asContext(), scene, scene.timeline.durationMs * 0.4);

    const box = ctx.calls.find((c) => c.method === "strokeRect");
    expect(box?.args).toEqual([400, 320, 240, 220]);
    expect(ctx.texts()).toContain("Bay");
    expect(ctx.saveBalance()).toBe(0);
  });

  it("draws nothing for a place when the replay is citywide", () => {
    const ctx = new RecordingContext();
    renderExportFrame(ctx.asContext(), makeScene(), 0);
    expect(ctx.countOf("strokeRect")).toBe(0);
  });

  it("renders an empty week without throwing", () => {
    const scene = makeScene({
      events: [],
      keyMoments: [],
      chartRows: [],
      chartMax: 1,
      totalEvents: 0,
    });
    const ctx = new RecordingContext();
    expect(() =>
      renderExportFrame(ctx.asContext(), scene, scene.timeline.durationMs / 2),
    ).not.toThrow();
    expect(ctx.saveBalance()).toBe(0);
  });

  it("survives a scene with no basemap and no photos", () => {
    const scene = makeScene({
      basemap: null,
      keyMoments: makeScene().keyMoments.map((m) => ({ ...m, photo: null, icon: null })),
    });
    const ctx = new RecordingContext();
    renderExportFrame(ctx.asContext(), scene, scene.timeline.durationMs * 0.5);
    expect(ctx.countOf("drawImage")).toBe(0);
    expect(ctx.saveBalance()).toBe(0);
  });
});
