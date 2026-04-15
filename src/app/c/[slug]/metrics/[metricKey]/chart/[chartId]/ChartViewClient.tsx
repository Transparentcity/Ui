"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TimeSeriesChart, { type PeriodType } from "@/components/TimeSeriesChart";
import Loader from "@/components/Loader";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import CitySignupButton from "../../../../CitySignupButton";
import { SignupEmailProvider } from "../../../../SignupEmailContext";
import {
  getPublicTimeSeriesChart,
  type PublicTimeSeriesChartPoint,
  type PublicTimeSeriesChartResponse,
} from "@/lib/publicApiClient";
import type { PublicMetricDetail } from "@/lib/publicApiClient";
import Breadcrumb from "@/components/Breadcrumb";
import "@/app/landing.css";

function aggregateTimeSeriesPoints(
  data: PublicTimeSeriesChartPoint[]
): PublicTimeSeriesChartPoint[] {
  const map = new Map<
    string,
    {
      time_period: string;
      numeric_value: number;
      group_value: string | null;
    }
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

/** Default view for the standalone chart page: monthly for granular series, year when the URL is already yearly. */
function defaultPeriodFromMetadata(
  periodType: string | undefined
): PeriodType {
  const p = periodType?.toLowerCase();
  if (p === "year") return "year";
  return "month";
}

interface ChartViewClientProps {
  chart: PublicTimeSeriesChartResponse;
  urlChartId: number;
  /** Stored yearly series for this district/citywide, if any */
  yearChartId: number | null;
  metric: PublicMetricDetail;
  citySlug: string;
}

export default function ChartViewClient({
  chart: initialChart,
  urlChartId,
  yearChartId,
  metric,
  citySlug,
}: ChartViewClientProps) {
  const aggregatedUrlChart = useMemo(
    () => ({
      ...initialChart,
      data: aggregateTimeSeriesPoints(initialChart.data),
    }),
    [initialChart]
  );

  const urlChartRef = useRef<PublicTimeSeriesChartResponse>(aggregatedUrlChart);
  useEffect(() => {
    urlChartRef.current = aggregatedUrlChart;
  }, [aggregatedUrlChart]);

  const [displayChart, setDisplayChart] =
    useState<PublicTimeSeriesChartResponse>(aggregatedUrlChart);
  const [useNativeYearSeries, setUseNativeYearSeries] = useState(false);
  const [yearLoading, setYearLoading] = useState(false);

  useEffect(() => {
    setDisplayChart(aggregatedUrlChart);
    setUseNativeYearSeries(false);
    setYearLoading(false);
  }, [aggregatedUrlChart]);

  const baseDefaultPeriod = defaultPeriodFromMetadata(
    initialChart.metadata?.period_type
  );

  const handlePeriodChange = useCallback(
    (p: PeriodType) => {
      if (p === "year" && yearChartId != null) {
        setUseNativeYearSeries(true);
        return;
      }
      setUseNativeYearSeries(false);
      setYearLoading(false);
      setDisplayChart(urlChartRef.current);
    },
    [yearChartId]
  );

  useEffect(() => {
    if (!useNativeYearSeries || yearChartId == null) {
      setYearLoading(false);
      return;
    }
    if (yearChartId === urlChartId) {
      setDisplayChart(urlChartRef.current);
      setYearLoading(false);
      return;
    }
    let cancelled = false;
    setYearLoading(true);
    getPublicTimeSeriesChart(yearChartId)
      .then((res) => {
        if (cancelled) return;
        setDisplayChart({
          ...res,
          data: aggregateTimeSeriesPoints(res.data),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setUseNativeYearSeries(false);
          setDisplayChart(urlChartRef.current);
        }
      })
      .finally(() => {
        if (!cancelled) setYearLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [useNativeYearSeries, yearChartId, urlChartId]);

  const chartTitle =
    displayChart.metadata?.chart_title || metric.metric_name;

  const cityName =
    metric.city_name ||
    citySlug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  const defaultPeriod: PeriodType =
    useNativeYearSeries && yearChartId != null ? "year" : baseDefaultPeriod;

  return (
    <SignupEmailProvider>
    <div className="chart-view-page">
      <PublicNavBar>
        <CitySignupButton citySlug={citySlug} cityName={cityName} />
      </PublicNavBar>

      <div className="chart-view-content-wrapper">
        <Breadcrumb items={[
          { label: cityName, href: `/c/${citySlug}` },
          { label: metric.metric_name, href: `/c/${citySlug}/metrics/${metric.metric_key}` },
          { label: "Time series" },
        ]} />

        <main className="chart-view-main">
          <div className="chart-view-inner">
            <h1 className="chart-view-title">{chartTitle}</h1>
            {displayChart.metadata?.caption && (
              <p className="chart-view-caption">{displayChart.metadata.caption}</p>
            )}
            <div className="chart-view-chart">
              {yearLoading ? (
                <div
                  className="metric-placeholder"
                  style={{
                    display: "flex",
                    minHeight: 400,
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.75rem",
                  }}
                >
                  <Loader size="md" color="dark" />
                  <span>Loading annual series…</span>
                </div>
              ) : (
                <TimeSeriesChart
                  key={`${useNativeYearSeries ? yearChartId : urlChartId}`}
                  data={displayChart.data}
                  metadata={displayChart.metadata}
                  height={500}
                  defaultPeriod={defaultPeriod}
                  showExternalTitle={false}
                  onPeriodChange={handlePeriodChange}
                />
              )}
            </div>
            <p className="chart-view-meta">
              {displayChart.count.toLocaleString()} data points
              {displayChart.metadata?.district != null &&
                displayChart.metadata.district !== 0 && (
                  <> · District {displayChart.metadata.district}</>
                )}
            </p>
            <Link
              href={`/c/${citySlug}/metrics/${metric.metric_key}`}
              className="chart-view-back"
            >
              ← Back to {metric.metric_name}
            </Link>
          </div>
        </main>
      </div>

      <PublicFooter />
    </div>
    </SignupEmailProvider>
  );
}
