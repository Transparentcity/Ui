import { NextResponse } from "next/server";
import { API_BASE } from "@/lib/apiBase";

export const revalidate = 300; // Revalidate every 5 minutes

/**
 * Get the research API base URL.
 * Research API is hosted on platform.transparentsf.com, not api.transparent.city
 */
function getResearchApiBase(): string {
  // Allow override via environment variable
  if (process.env.NEXT_PUBLIC_RESEARCH_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_RESEARCH_API_BASE_URL;
  }
  
  // Default to platform.transparentsf.com for research API
  return "https://platform.transparentsf.com";
}

type PublicResearchReport = {
  id: number;
  title: string;
  permalink_slug: string | null;
  social_media_content: {
    title?: string;
    text?: string;
    visual_elements?: Array<{
      type: string;
      placeholder: string;
      description: string;
    }>;
  } | null;
  created_at: string;
  updated_at: string;
};

type ResearchListResponse = {
  status: string;
  reports: PublicResearchReport[];
};

/**
 * Convert chart placeholder to URL
 * Examples:
 * - [CHART:time_series:123:0:month] -> /backend/time-series-chart?metric_id=123&district=0&period_type=month&embedded=true
 * - [CHART:map:456] -> /backend/map-chart?id=456&embedded=true
 */
function placeholderToUrl(placeholder: string, apiBase: string): string {
  const match = placeholder.match(/\[CHART:([^:]+):([^\]]+)\]/);
  if (!match) return "";

  const [, chartType, params] = match;
  const paramParts = params.split(":");

  if (chartType === "time_series" || chartType === "time_series_id") {
    if (paramParts.length === 1) {
      // Just chart ID
      return `${apiBase}/backend/time-series-chart?chart_id=${paramParts[0]}&embedded=true`;
    } else if (paramParts.length === 3) {
      // metric_id:district:period_type
      const [metricId, district, period] = paramParts;
      return `${apiBase}/backend/time-series-chart?metric_id=${metricId}&district=${district}&period_type=${period}&embedded=true`;
    }
  } else if (chartType === "map") {
    return `${apiBase}/backend/map-chart?id=${paramParts[0]}&embedded=true`;
  } else if (chartType === "anomaly" || chartType === "anomaly_id") {
    return `${apiBase}/anomaly-analyzer/anomaly-chart?id=${paramParts[0]}`;
  }

  return "";
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const status = searchParams.get("status") || "completed";

  // Research API is on platform.transparentsf.com, not the main API
  const upstreamBase = getResearchApiBase();
  const upstreamUrl = new URL("/api/research/list", upstreamBase);
  upstreamUrl.searchParams.set("limit", limit.toString());
  upstreamUrl.searchParams.set("status", status);

  try {
    const res = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      next: { revalidate },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Upstream ${res.status}: ${text}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as ResearchListResponse;

    if (data.status !== "success") {
      return NextResponse.json(
        { error: "Failed to fetch research reports" },
        { status: 500 },
      );
    }

    // Filter for public reports and process visual_elements
    const publicReports = data.reports
      .filter((report) => {
        // Only include reports that are public or have a permalink_slug
        // and have social_media_content
        return (
          (report.permalink_slug || true) && // For now, include all completed reports
          report.social_media_content &&
          report.social_media_content.title &&
          report.social_media_content.text
        );
      })
      .map((report) => {
        // Convert visual_elements placeholders to URLs
        const processedVisualElements =
          report.social_media_content?.visual_elements?.map((visual) => ({
            ...visual,
            url: placeholderToUrl(visual.placeholder, upstreamBase),
          })) || [];

        return {
          id: report.id,
          title: report.social_media_content?.title || report.title,
          text: report.social_media_content?.text || "",
          permalinkPath: report.permalink_slug
            ? `/api/research/permalink/${report.id}`
            : `/api/research/permalink/${report.id}`,
          visual_elements: processedVisualElements,
          created_at: report.created_at,
        };
      })
      .slice(0, limit);

    return NextResponse.json(
      {
        reports: publicReports,
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

