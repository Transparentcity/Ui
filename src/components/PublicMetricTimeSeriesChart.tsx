"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getPublicTimeSeriesChart,
  type PublicTimeSeriesChartResponse,
} from "@/lib/publicApiClient";
import TimeSeriesChart, { type PeriodType } from "./TimeSeriesChart";
import Loader from "./Loader";

/**
 * De-duplicate multiple points per (period, group) by aggregation strategy.
 * Flow metrics: SUM values (e.g. multiple event sources for the same month).
 * Stock metrics: keep LAST value (a level series should not be summed).
 */
function aggregateTimeSeries(
  data: PublicTimeSeriesChartResponse["data"],
  strategy: "sum" | "last" = "sum"
): PublicTimeSeriesChartResponse["data"] {
  const map = new Map<
    string,
    { time_period: string; numeric_value: number; group_value: string | null }
  >();
  for (const point of data) {
    const key = `${point.time_period}|${point.group_value ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      if (strategy === "last") {
        existing.numeric_value = point.numeric_value || 0;
      } else {
        existing.numeric_value += point.numeric_value || 0;
      }
    } else {
      map.set(key, {
        time_period: point.time_period,
        numeric_value: point.numeric_value || 0,
        group_value: point.group_value ?? null,
      });
    }
  }
  return Array.from(map.values());
}

export default function PublicMetricTimeSeriesChart({
  primaryChartId,
  yearChartId,
  staleness_days,
  reportingCompletenessHref,
  measurementType = "flow",
}: {
  primaryChartId: number | null;
  yearChartId: number | null;
  staleness_days?: number;
  /** When set with a reporting lag, shown under the chart (e.g. deep-link to #reporting-completeness). */
  reportingCompletenessHref?: string | null;
  /** "flow" (default) or "stock" — controls how duplicate points are aggregated. */
  measurementType?: "flow" | "stock";
}) {
  const [useNativeYearSeries, setUseNativeYearSeries] = useState(false);

  useEffect(() => {
    setUseNativeYearSeries(false);
  }, [primaryChartId]);

  const activeChartId =
    useNativeYearSeries && yearChartId != null ? yearChartId : primaryChartId;

  const [data, setData] = useState<PublicTimeSeriesChartResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeChartId == null) {
      setData(null);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    getPublicTimeSeriesChart(activeChartId)
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch(() => {
        if (mounted) setData(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeChartId]);

  if (activeChartId == null) {
    return (
      <div className="metric-placeholder">No chart data available.</div>
    );
  }

  if (loading) {
    return (
      <div
        className="metric-placeholder"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
        }}
      >
        <Loader size="md" color="dark" />
        <span>Loading chart...</span>
      </div>
    );
  }

  if (!data || !data.data || data.data.length === 0) {
    return (
      <div className="metric-placeholder">No chart data available.</div>
    );
  }

  const aggregated = aggregateTimeSeries(
    data.data,
    measurementType === "stock" ? "last" : "sum"
  );
  // Stock metrics don't have a meaningful "year-to-date" overlay — default to the plain
  // monthly view so the level series renders as a continuous line without YTD summing.
  const defaultPeriod: PeriodType =
    measurementType === "stock"
      ? "month"
      : useNativeYearSeries && yearChartId != null
        ? "year"
        : "ytd";

  return (
    <>
      <TimeSeriesChart
        key={activeChartId}
        data={aggregated}
        metadata={data.metadata}
        height={320}
        defaultPeriod={defaultPeriod}
        fullBleed={true}
        hidePeriodSelector={false}
        showExternalTitle={true}
        staleness_days={staleness_days}
        onPeriodChange={(p) => {
          if (p === "year" && yearChartId != null) {
            setUseNativeYearSeries(true);
          } else {
            setUseNativeYearSeries(false);
          }
        }}
      />
      {staleness_days != null &&
        staleness_days > 0 &&
        reportingCompletenessHref ? (
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.875rem" }}>
          <Link
            href={reportingCompletenessHref}
            className="metric-chart-full-page-link"
          >
            View reporting completeness chart
          </Link>
        </p>
      ) : null}
    </>
  );
}
