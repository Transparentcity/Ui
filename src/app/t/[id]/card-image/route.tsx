import { ImageResponse } from "next/og";

import { StoryChartCardImage } from "@/app/c/[slug]/stories/[hash]/card-image/chartCard";
import { getUpstreamApiBaseUrl } from "@/lib/apiBase";
import { STORY_CARD_HEIGHT, STORY_CARD_WIDTH, storyCardCacheControl } from "@/lib/feed/storyCardImage";
import { loadStoryChartCard } from "@/lib/feed/storyChartCard";
import { cardImageResponse, fetchCardImage, type CardImage } from "@/lib/linkCardImage";
import { getPublicTimeSeriesChart, type PublicTimeSeriesChartResponse } from "@/lib/publicApiClient";

/**
 * Social-card image for a chart page, served from the page's own path (see
 * src/lib/linkCardImage.ts). Drawn like a story's chart card: this year
 * against last year when the chart has a daily series that adds up, otherwise
 * its recent stretch. Falls back to the backend's image of the chart; an
 * unknown chart is a 404.
 */

type RouteContext = { params: Promise<{ id: string }> };

async function drawChartCard(
  chartId: number,
  base: PublicTimeSeriesChartResponse,
  fetchChart: (id: number) => Promise<PublicTimeSeriesChartResponse>,
): Promise<CardImage | null> {
  const meta = base.metadata ?? {};
  try {
    const loaded = await loadStoryChartCard(
      { chartId, period: meta.period_type || "month", end: null, ytd: true },
      fetchChart,
    );
    if (!loaded) return null;
    const cityName = base.source_info?.city_name || "";
    const image = new ImageResponse(
      <StoryChartCardImage card={loaded.card} metricName={loaded.metricName} cityName={cityName} />,
      { width: STORY_CARD_WIDTH, height: STORY_CARD_HEIGHT },
    );
    // ImageResponse renders lazily; buffer it so a satori error falls back
    // instead of sending a 200 with an empty body.
    const body = await image.arrayBuffer();
    return body.byteLength > 0 ? { body, contentType: "image/png" } : null;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return new Response("Invalid chart id", { status: 400 });
  const chartId = Number(id);

  const charts = new Map<number, Promise<PublicTimeSeriesChartResponse>>();
  const fetchChart = (cid: number) => {
    let chart = charts.get(cid);
    if (!chart) {
      chart = getPublicTimeSeriesChart(cid);
      charts.set(cid, chart);
    }
    return chart;
  };

  let base: PublicTimeSeriesChartResponse;
  try {
    base = await fetchChart(chartId);
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      return new Response("Chart not found", { status: 404 });
    }
    return new Response("Chart unavailable", {
      status: 502,
      headers: { "cache-control": storyCardCacheControl("degraded") },
    });
  }

  const card = await drawChartCard(chartId, base, fetchChart);
  if (card) return cardImageResponse(card, storyCardCacheControl("unversioned"));

  const period = encodeURIComponent(base.metadata?.period_type || "month");
  const backendImage = await fetchCardImage(
    `${getUpstreamApiBaseUrl()}/api/time-series/public/${chartId}/image?period=${period}&width=1200&height=630`,
  );
  if (backendImage && backendImage !== "missing") {
    return cardImageResponse(backendImage, storyCardCacheControl("unversioned"));
  }
  return new Response("Chart image unavailable", {
    status: 502,
    headers: { "cache-control": storyCardCacheControl("degraded") },
  });
}
