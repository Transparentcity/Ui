"use client";

import Link from "next/link";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import type { PublicTimeSeriesChartResponse } from "@/lib/publicApiClient";
import type { PublicMetricDetail } from "@/lib/publicApiClient";
interface ChartViewClientProps {
  chart: PublicTimeSeriesChartResponse;
  metric: PublicMetricDetail;
  citySlug: string;
}

export default function ChartViewClient({
  chart,
  metric,
  citySlug,
}: ChartViewClientProps) {
  const chartTitle =
    chart.metadata?.chart_title ||
    metric.metric_name;

  return (
    <div className="chart-view-page">
      <nav className="metric-detail-nav">
        <div className="metric-detail-nav-inner">
          <Link
            href="/"
            className="metric-detail-nav-logo"
            aria-label="Transparent.city home"
          >
            <span className="logo-text">
              <span className="logo-transparent">transparent</span>
              <span className="logo-city">.city</span>
            </span>
          </Link>
          <div className="metric-detail-nav-links">
            <Link
              href={`/c/${citySlug}`}
              className="metric-detail-nav-link"
            >
              {metric.city_name || citySlug.replace(/-/g, " ")}
            </Link>
            <span className="metric-detail-nav-sep" aria-hidden>/</span>
            <Link
              href={`/c/${citySlug}/metrics/${metric.metric_key}`}
              className="metric-detail-nav-link"
            >
              {metric.metric_name}
            </Link>
            <span className="metric-detail-nav-sep" aria-hidden>/</span>
            <span className="metric-detail-nav-current">Time series</span>
          </div>
        </div>
      </nav>

      <main className="chart-view-main">
        <div className="chart-view-inner">
          <h1 className="chart-view-title">{chartTitle}</h1>
          {chart.metadata?.caption && (
            <p className="chart-view-caption">{chart.metadata.caption}</p>
          )}
          <div className="chart-view-chart">
            <TimeSeriesChart
              data={chart.data}
              metadata={chart.metadata}
              height={500}
              defaultPeriod="month"
              showExternalTitle={false}
            />
          </div>
          <p className="chart-view-meta">
            {chart.count.toLocaleString()} data points
            {chart.metadata?.district != null && chart.metadata.district !== 0 && (
              <> · District {chart.metadata.district}</>
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
  );
}
