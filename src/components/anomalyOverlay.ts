/**
 * Overlay helpers for rendering slim anomaly stats on a live time-series chart.
 * Dates are compared as local YYYY-MM-DD so timezone shifts do not move weeks.
 */

export type AnomalyOverlayPeriodType = "day" | "week" | "month" | "year";

export interface AnomalyOverlay {
  periodType: AnomalyOverlayPeriodType;
  recentStart: string;
  recentEnd?: string | null;
  comparisonStart?: string | null;
  comparisonEnd?: string | null;
  comparisonMean: number;
  stddev: number;
  thresholdStddev?: number;
}

export function toLocalYmd(value: Date | string): string | null {
  if (typeof value === "string") {
    const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return toLocalYmd(parsed);
  }
  if (Number.isNaN(value.getTime())) return null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dateInInclusiveRange(
  value: Date,
  start?: string | null,
  end?: string | null,
): boolean {
  const ymd = toLocalYmd(value);
  if (!ymd || !start) return false;
  const startYmd = toLocalYmd(start);
  const endYmd = toLocalYmd(end || start);
  if (!startYmd || !endYmd) return false;
  return ymd >= startYmd && ymd <= endYmd;
}

export function overlayBandBounds(overlay: AnomalyOverlay): {
  lower: number;
  upper: number;
} {
  const sigma = overlay.thresholdStddev ?? 2;
  const upper = overlay.comparisonMean + sigma * overlay.stddev;
  const lower = Math.max(overlay.comparisonMean - sigma * overlay.stddev, 0);
  return { lower, upper };
}

type OverlayTrace = Record<string, unknown>;

/**
 * Build Plotly traces for the ±σ band, historical mean, comparison window,
 * and recent-period highlight. Callers should draw the live series separately.
 */
export function buildAnomalyOverlayTraces(
  x: Date[],
  y: number[],
  overlay: AnomalyOverlay,
): OverlayTrace[] {
  if (x.length === 0) return [];

  const traces: OverlayTrace[] = [];
  const { lower, upper } = overlayBandBounds(overlay);
  const sigma = overlay.thresholdStddev ?? 2;

  traces.push({
    x,
    y: x.map(() => lower),
    type: "scatter",
    mode: "lines",
    line: { color: "rgba(0,0,0,0)" },
    showlegend: false,
    hoverinfo: "skip",
  });
  traces.push({
    x,
    y: x.map(() => upper),
    type: "scatter",
    mode: "lines",
    line: { color: "rgba(74, 116, 99, 0.3)", width: 1 },
    fill: "tonexty",
    fillcolor: "rgba(74, 116, 99, 0.15)",
    name: `Normal Range (±${sigma}σ)`,
    showlegend: true,
    hoverinfo: "skip",
  });
  traces.push({
    x: [x[0], x[x.length - 1]],
    y: [overlay.comparisonMean, overlay.comparisonMean],
    type: "scatter",
    mode: "lines",
    name: "Historical Mean",
    line: { color: "rgba(74, 116, 99, 0.8)", width: 1.5, dash: "dash" },
    showlegend: true,
    hoverinfo: "skip",
  });

  const comparisonX: Date[] = [];
  const comparisonY: number[] = [];
  const recentX: Date[] = [];
  const recentY: number[] = [];
  for (let i = 0; i < x.length; i++) {
    if (dateInInclusiveRange(x[i], overlay.comparisonStart, overlay.comparisonEnd)) {
      comparisonX.push(x[i]);
      comparisonY.push(y[i]);
    }
    if (dateInInclusiveRange(x[i], overlay.recentStart, overlay.recentEnd)) {
      recentX.push(x[i]);
      recentY.push(y[i]);
    }
  }

  if (comparisonX.length > 0) {
    traces.push({
      x: comparisonX,
      y: comparisonY,
      type: "scatter",
      mode: "lines+markers",
      name: "Comparison Window",
      line: { color: "#ad35fa", width: 2 },
      marker: { color: "#ad35fa", size: 5 },
    });
  }

  if (recentX.length > 0) {
    if (comparisonX.length > 0) {
      traces.push({
        x: [comparisonX[comparisonX.length - 1], recentX[0]],
        y: [comparisonY[comparisonY.length - 1], recentY[0]],
        type: "scatter",
        mode: "lines",
        line: { color: "#ad35fa", width: 2, dash: "dot" },
        showlegend: false,
        hoverinfo: "skip",
      });
    }
    traces.push({
      x: recentX,
      y: recentY,
      type: "scatter",
      mode: "lines+markers",
      name: `Recent (${overlay.recentStart.slice(0, 10)})`,
      line: { color: "#f04e23", width: 2.5 },
      marker: { color: "#f04e23", size: 8, symbol: "circle" },
    });
  }

  return traces;
}
