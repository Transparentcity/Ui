"use client";

import { useEffect, useState } from "react";
import {
  getPublicTimeSeriesChart,
  type PublicTimeSeriesChartResponse,
} from "@/lib/publicApiClient";
import TimeSeriesChart, { type PeriodType } from "./TimeSeriesChart";
import Loader from "./Loader";

function aggregateTimeSeries(
  data: PublicTimeSeriesChartResponse["data"]
): PublicTimeSeriesChartResponse["data"] {
  const map = new Map<
    string,
    { time_period: string; numeric_value: number; group_value: string | null }
  >();
  for (const point of data) {
    const key = `${point.time_period}|${point.group_value ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.numeric_value += point.numeric_value || 0;
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
}: {
  primaryChartId: number | null;
  yearChartId: number | null;
  staleness_days?: number;
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

  const aggregated = aggregateTimeSeries(data.data);
  const defaultPeriod: PeriodType =
    useNativeYearSeries && yearChartId != null ? "year" : "ytd";

  return (
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
  );
}
