import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPublicMetricByKey,
  getPublicMetricComparisons,
  getPublicMetricTimeSeriesSummary,
  listPublicCitiesForSitemap,
  type PublicMetricComparisons,
  type PublicTimeSeriesSummary,
} from "@/lib/publicApiClient";
import MetricDetailClient from "./MetricDetailClient";
import MetricLoadErrorClient from "./MetricLoadErrorClient";

type PageProps = {
  params: Promise<{ slug: string; metricKey: string }>;
  searchParams: Promise<{ district?: string }>;
};

export const revalidate = 3600; // Revalidate every hour

function titleCaseSlug(s: string): string {
  return s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { slug, metricKey } = await params;
  const { district } = await searchParams;
  const districtNum = district ? parseInt(district, 10) : null;
  const locationLabel =
    districtNum && districtNum > 0 ? `District ${districtNum}` : "Citywide";

  try {
    const metric = await getPublicMetricByKey(metricKey);
    let cityName: string = metric.city_name ?? titleCaseSlug(slug);
    try {
      const cities = await listPublicCitiesForSitemap();
      const match = cities.find((c) => c.slug === slug);
      if (match) {
        cityName =
          match.state && match.country && match.country !== "United States"
            ? `${match.name}, ${match.state}, ${match.country}`
            : match.state
              ? `${match.name}, ${match.state}`
              : match.country && match.country !== "United States"
                ? `${match.name}, ${match.country}`
                : match.name;
      }
    } catch {
      // keep cityName from metric.city_name or titleCaseSlug(slug)
    }

    const year = new Date().getFullYear();
    const description =
      metric.summary ||
      metric.definition?.slice(0, 160) ||
      `View detailed data and trends for ${metric.metric_name} in ${cityName} in ${year} - ${locationLabel}`;

    return {
      title: `${metric.metric_name} in ${year} | ${locationLabel} | ${cityName}`,
      description,
      openGraph: {
        title: `${metric.metric_name} in ${year} - ${locationLabel}`,
        description,
        type: "website",
        // TODO: Add OG image generation endpoint
        // images: [{ url: `/api/og/metric/${metric.metric_key}` }],
      },
    };
  } catch {
    return { title: "Metric Not Found" };
  }
}

function isApi404(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as Error & { status?: number }).status === "number" &&
    (err as Error & { status?: number }).status === 404
  );
}

function loadErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.includes("Failed to connect to API") || err.message.includes("fetch")) {
      return "We couldn’t reach the data service. Check that the API is running, then try again.";
    }
    if (err.message.includes("404")) {
      return "This metric wasn’t found.";
    }
  }
  return "We couldn’t load this metric. Please try again later.";
}

export default async function MetricDetailPage({ params, searchParams }: PageProps) {
  const { slug, metricKey } = await params;
  const { district } = await searchParams;
  const districtNum = district ? parseInt(district, 10) : null;

  let metric;
  try {
    metric = await getPublicMetricByKey(metricKey);
  } catch (error) {
    console.error("Failed to load metric:", error);
    if (isApi404(error)) {
      notFound();
    }
    const baseMsg = loadErrorMessage(error);
    const devExtra =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? ` [${error.message}]`
        : "";
    return (
      <MetricLoadErrorClient
        citySlug={slug}
        message={baseMsg + devExtra}
      />
    );
  }

  // Prefetch comparisons and time series summary in parallel to improve initial load time
  let initialComparisons: PublicMetricComparisons | undefined;
  let initialTimeSeriesSummary: PublicTimeSeriesSummary | undefined;
  
  try {
    const [comparisons, timeSeriesSummary] = await Promise.all([
      getPublicMetricComparisons(metric.id, districtNum, undefined),
      getPublicMetricTimeSeriesSummary(metric.id),
    ]);
    initialComparisons = comparisons;
    initialTimeSeriesSummary = timeSeriesSummary;
  } catch (error) {
    // Non-critical: client will refetch if server prefetch fails
    console.warn("Failed to prefetch metric comparisons/summary:", error);
  }

  return (
    <MetricDetailClient
      metric={metric}
      citySlug={slug}
      district={districtNum}
      initialComparisons={initialComparisons}
      initialTimeSeriesSummary={initialTimeSeriesSummary}
    />
  );
}
