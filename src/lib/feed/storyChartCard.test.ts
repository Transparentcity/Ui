import { describe, it, expect, vi } from "vitest";

import type { PublicTimeSeriesChartPoint, PublicTimeSeriesChartResponse } from "@/lib/publicApiClient";

import {
  buildTrendCard,
  buildYtdCard,
  cardMetricName,
  isAdditiveSeries,
  loadStoryChartCard,
  storyChartTarget,
} from "./storyChartCard";

function pt(time_period: string, numeric_value: number, group_value: string | null = null): PublicTimeSeriesChartPoint {
  return { time_period, numeric_value, group_value };
}

/** One row per day from start through end with the given value. */
function dailyRange(start: string, end: string, value: (iso: string) => number): PublicTimeSeriesChartPoint[] {
  const out: PublicTimeSeriesChartPoint[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    const iso = d.toISOString().slice(0, 10);
    out.push(pt(iso, value(iso)));
  }
  return out;
}

function monthly(fromYear: number, toIso: string, value = 10): PublicTimeSeriesChartPoint[] {
  const out: PublicTimeSeriesChartPoint[] = [];
  for (let y = fromYear; ; y++) {
    for (let m = 1; m <= 12; m++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-01`;
      if (iso > toIso) return out;
      out.push(pt(iso, value));
    }
  }
}

// Chicago, story oibGYYdD: "New-Home Permits Slip 3% From a Strong 2025 Pace".
const chicagoStory = {
  article_html: "<p>…</p>[chart:4727898:month]",
  primary_visualization: { id: 4727898, type: "chart", period: "month" },
  visualization_type: "chart",
  story_date: "2026-10-02",
  metadata: {
    window: "2026-01-01 to 2026-09-25",
    comparison_window: "2025-01-01 to 2025-09-25",
    template_slug: "building_pace",
  },
};

describe("storyChartTarget", () => {
  it("treats a Jan 1 window with a comparison window as year to date", () => {
    expect(storyChartTarget(chicagoStory)).toEqual({
      chartId: 4727898,
      period: "month",
      end: "2026-09-25",
      ytd: true,
    });
  });

  it("lets the article shortcode win and defaults the end to the story date", () => {
    const t = storyChartTarget({
      article_html: "[chart:42:ytd]",
      primary_visualization: { id: 7, type: "chart" },
      visualization_type: "chart",
      story_date: "2026-09-10",
      metadata: {},
    });
    expect(t).toEqual({ chartId: 42, period: "ytd", end: "2026-09-10", ytd: true });
  });

  it("is a plain monthly trend without a YTD window", () => {
    const t = storyChartTarget({
      primary_visualization: { id: 9, type: "chart", period: "month" },
      visualization_type: "chart",
      story_date: "2026-09-10",
      metadata: { window: "2026-08-01 to 2026-08-31" },
    });
    expect(t?.ytd).toBe(false);
    expect(t?.end).toBe("2026-08-31");
  });

  it("skips maps and anomalies", () => {
    expect(
      storyChartTarget({ primary_visualization: { id: 1, type: "map" }, visualization_type: "map", story_date: "2026-09-10" }),
    ).toBeNull();
  });
});

describe("cardMetricName / isAdditiveSeries", () => {
  it("strips emoji", () => {
    expect(cardMetricName("📋🏗️ New Residential Construction Permits Issued")).toBe(
      "New Residential Construction Permits Issued",
    );
  });

  it("sums counts but not averages", () => {
    expect(isAdditiveSeries("All 911 Calls", [pt("2026-01-01", 3)])).toBe(true);
    expect(isAdditiveSeries("Avg Days to Close a Pothole Request", [pt("2026-01-01", 3)])).toBe(false);
    expect(isAdditiveSeries("Response time", [pt("2026-01-01", 3.4)])).toBe(false);
  });
});

describe("buildYtdCard", () => {
  // 2 a day in 2026, 1 a day in 2025; sparse days (none on the 10th) count as zero.
  const daily = dailyRange("2024-10-07", "2026-10-05", (iso) =>
    iso.endsWith("-10") ? 0 : iso.startsWith("2026") ? 2 : 1,
  ).filter((p) => p.numeric_value > 0);

  it("compares running totals through the same day of year", () => {
    const card = buildYtdCard(daily, "2026-09-25")!;
    expect(card.year).toBe(2026);
    expect(card.priorYear).toBe(2025);
    expect(card.endDate).toBe("2026-09-25");
    expect(card.current).toHaveLength(268);
    expect(card.prior).toHaveLength(268);
    // 268 days minus nine 10ths (Jan–Sep).
    expect(card.currentTotal).toBe((268 - 9) * 2);
    expect(card.priorTotal).toBe(268 - 9);
  });

  it("stops at the last data date when the story date runs past it", () => {
    expect(buildYtdCard(daily, "2026-12-01")!.endDate).toBe("2026-10-05");
  });

  it("needs data back to last Jan 1", () => {
    expect(buildYtdCard(daily.filter((p) => p.time_period >= "2025-02-01"), "2026-09-25")).toBeNull();
  });

  it("is null in the first two weeks of the year", () => {
    expect(buildYtdCard(daily, "2026-01-05")).toBeNull();
  });
});

describe("buildTrendCard", () => {
  it("shows 25 months ending at the last complete month, marking a year earlier", () => {
    const card = buildTrendCard(monthly(2016, "2026-10-01"), "month", "2026-10-02")!;
    expect(card.points).toHaveLength(25);
    expect(card.points[0].date).toBe("2024-09-01");
    expect(card.points[24].date).toBe("2026-09-01");
    expect(card.points[card.compareIndex!].date).toBe("2025-09-01");
  });

  it("keeps a month the story date completes", () => {
    const card = buildTrendCard(monthly(2016, "2026-10-01"), "month", "2026-09-30")!;
    expect(card.points[24].date).toBe("2026-09-01");
  });

  it("is null with too few points", () => {
    expect(buildTrendCard([pt("2026-01-01", 1)], "month", null)).toBeNull();
  });
});

describe("loadStoryChartCard", () => {
  const monthChart: PublicTimeSeriesChartResponse = {
    count: 0,
    sibling_chart_ids: { day: 2, month: 1 },
    metadata: { period_type: "month", object_name: "📋🏗️ New Residential Construction Permits Issued" },
    data: monthly(2016, "2026-09-01"),
  };
  const dayChart: PublicTimeSeriesChartResponse = {
    count: 0,
    metadata: { period_type: "day", object_name: "📋🏗️ New Residential Construction Permits Issued" },
    data: dailyRange("2024-10-07", "2026-10-05", () => 1),
  };

  it("draws a YTD card from the daily sibling", async () => {
    const fetchChart = vi.fn(async (id: number) => (id === 1 ? monthChart : dayChart));
    const loaded = await loadStoryChartCard(storyChartTarget({ ...chicagoStory, article_html: "[chart:1:month]" })!, fetchChart);
    expect(loaded?.card.kind).toBe("ytd");
    expect(loaded?.metricName).toBe("New Residential Construction Permits Issued");
    expect(fetchChart).toHaveBeenCalledWith(2);
  });

  it("falls back to two years of months for averages", async () => {
    const avg = { ...monthChart, metadata: { ...monthChart.metadata, object_name: "Avg Days to Close" } };
    const avgDay = { ...dayChart, metadata: { ...dayChart.metadata, object_name: "Avg Days to Close" } };
    const loaded = await loadStoryChartCard(
      { chartId: 1, period: "ytd", end: "2026-09-25", ytd: true },
      async (id) => (id === 1 ? avg : avgDay),
    );
    expect(loaded?.card.kind).toBe("trend");
    expect(loaded?.card.kind === "trend" && loaded.card.points).toHaveLength(25);
  });

  it("gives up on grouped series", async () => {
    const grouped = { ...monthChart, data: [pt("2026-01-01", 1, "A"), pt("2026-01-01", 2, "B"), pt("2026-02-01", 1, "A")] };
    const loaded = await loadStoryChartCard({ chartId: 1, period: "month", end: null, ytd: false }, async () => grouped);
    expect(loaded).toBeNull();
  });
});
