import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPublicMetricByKey,
  getPublicTimeSeriesChart,
} from "@/lib/publicApiClient";
import ChartViewClient from "./ChartViewClient";
import "../../styles.css";
import "./chart-view.css";

type PageProps = {
  params: Promise<{ slug: string; metricKey: string; chartId: string }>;
};

export const revalidate = 3600;

function titleCaseSlug(s: string): string {
  return s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, metricKey, chartId } = await params;
  const chartIdNum = parseInt(chartId, 10);
  if (Number.isNaN(chartIdNum)) {
    return { title: "Chart Not Found" };
  }
  try {
    const metric = await getPublicMetricByKey(metricKey);
    const chart = await getPublicTimeSeriesChart(chartIdNum);
    if (chart.metadata?.object_id !== String(metric.id)) {
      return { title: "Chart Not Found" };
    }
    const cityName = metric.city_name ?? titleCaseSlug(slug);
    const chartTitle =
      chart.metadata?.chart_title || metric.metric_name;
    const year = new Date().getFullYear();
    return {
      title: `${chartTitle} | ${metric.metric_name} | ${cityName} (${year})`,
      description:
        chart.metadata?.caption ||
        `Time series: ${metric.metric_name} in ${cityName}. ${chart.count} data points.`,
    };
  } catch {
    return { title: "Chart Not Found" };
  }
}

export default async function TimeSeriesChartPage({ params }: PageProps) {
  const { slug, metricKey, chartId } = await params;
  const chartIdNum = parseInt(chartId, 10);
  if (Number.isNaN(chartIdNum)) {
    notFound();
  }

  let metric;
  try {
    metric = await getPublicMetricByKey(metricKey);
  } catch {
    notFound();
  }

  let chart;
  try {
    chart = await getPublicTimeSeriesChart(chartIdNum);
  } catch {
    notFound();
  }

  if (chart.metadata?.object_id !== String(metric.id)) {
    notFound();
  }

  return (
    <ChartViewClient
      chart={chart}
      metric={metric}
      citySlug={slug}
    />
  );
}
