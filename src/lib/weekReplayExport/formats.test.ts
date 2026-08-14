/**
 * Export layout tests: every format tiles its frame exactly, the map keeps the
 * largest share, and encoders get dimensions they'll accept.
 */
import { describe, it, expect } from "vitest";

import {
  EXPORT_FORMATS,
  basemapRequestSize,
  buildExportLayout,
  getExportFormat,
  mapAspect,
} from "./formats";

describe("EXPORT_FORMATS", () => {
  it("covers portrait, square, and landscape at their nominal ratios", () => {
    const byId = new Map(EXPORT_FORMATS.map((f) => [f.id, f]));
    expect(byId.get("story")!.width / byId.get("story")!.height).toBeCloseTo(9 / 16, 4);
    expect(byId.get("square")!.width / byId.get("square")!.height).toBe(1);
    expect(byId.get("wide")!.width / byId.get("wide")!.height).toBeCloseTo(16 / 9, 4);
  });

  it("uses even dimensions, which H.264 requires", () => {
    for (const f of EXPORT_FORMATS) {
      expect(f.width % 2).toBe(0);
      expect(f.height % 2).toBe(0);
    }
  });

  it("falls back to the story format for an unknown id", () => {
    // Runtime ids can arrive from persisted state that predates a rename.
    expect(getExportFormat("nope" as never).id).toBe("story");
  });
});

describe("buildExportLayout", () => {
  it("tiles the full frame with no gaps or overlap", () => {
    for (const format of EXPORT_FORMATS) {
      const layout = buildExportLayout(format);
      const { header, map, chart, footer } = layout;

      expect(header.y).toBe(0);
      expect(footer.y + footer.h).toBe(format.height);

      if (layout.chartBesideMap) {
        // Map and chart share one band; together they span the full width.
        expect(map.y).toBe(header.h);
        expect(chart.y).toBe(header.h);
        expect(map.h).toBe(chart.h);
        expect(map.x + map.w).toBe(chart.x);
        expect(chart.x + chart.w).toBe(format.width);
        expect(map.y + map.h).toBe(footer.y);
      } else {
        expect(map.y).toBe(header.h);
        expect(chart.y).toBe(map.y + map.h);
        expect(chart.y + chart.h).toBe(footer.y);
        expect(map.w).toBe(format.width);
        expect(chart.w).toBe(format.width);
      }

      for (const rect of [header, map, chart, footer]) {
        expect(rect.w).toBeGreaterThan(0);
        expect(rect.h).toBeGreaterThan(0);
      }
    }
  });

  it("gives the map the largest share of every frame", () => {
    for (const format of EXPORT_FORMATS) {
      const layout = buildExportLayout(format);
      const mapArea = layout.map.w * layout.map.h;
      for (const rect of [layout.header, layout.chart, layout.footer]) {
        expect(mapArea).toBeGreaterThan(rect.w * rect.h);
      }
    }
  });

  it("leaves each chart row a readable height", () => {
    for (const format of EXPORT_FORMATS) {
      const layout = buildExportLayout(format);
      expect(layout.chart.h / layout.maxChartRows).toBeGreaterThan(40);
    }
  });

  it("reports the map rect's aspect for the basemap crop", () => {
    const layout = buildExportLayout(getExportFormat("story"));
    expect(mapAspect(layout)).toBeCloseTo(layout.map.w / layout.map.h, 6);
  });

  it("requests basemaps within Mapbox's 1280px per-side limit", () => {
    for (const format of EXPORT_FORMATS) {
      const layout = buildExportLayout(format);
      const size = basemapRequestSize(layout);
      expect(size.width).toBeLessThanOrEqual(1280);
      expect(size.height).toBeLessThanOrEqual(1280);
      // Served @2x, so the request has to be half the rect to fill it exactly.
      expect(size.width * 2).toBeCloseTo(layout.map.w, 0);
      expect(size.height * 2).toBeCloseTo(layout.map.h, 0);
    }
  });
});
