/**
 * Tests for /t/[id]/card-image, the og:image / twitter:image of a chart page
 * without an admin-picked image.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiBase", () => ({
  getUpstreamApiBaseUrl: () => "https://api.example.test",
}));

const getPublicTimeSeriesChart = vi.fn();
vi.mock("@/lib/publicApiClient", () => ({
  getPublicTimeSeriesChart: (chartId: number) => getPublicTimeSeriesChart(chartId),
}));

const loadStoryChartCard = vi.fn();
vi.mock("@/lib/feed/storyChartCard", () => ({
  loadStoryChartCard: (...args: unknown[]) => loadStoryChartCard(...args),
}));

// Rendering a real card needs satori + WASM; a marker response is enough to
// assert which branch the route took.
const imageResponse = vi.fn();
vi.mock("next/og", () => ({
  ImageResponse: vi.fn(function ImageResponseMock(element: unknown, options: unknown) {
    imageResponse(element, options);
    return new Response("generated-card", { status: 200, headers: { "content-type": "image/png" } });
  }),
}));

import { GET } from "./route";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function chart(overrides: Record<string, unknown> = {}) {
  return {
    count: 3,
    metadata: { chart_id: 147322, object_name: "New Residential Housing Units Completed", period_type: "day" },
    source_info: { city_name: "San Francisco" },
    sibling_chart_ids: { day: 147322, week: 147323 },
    data: [],
    ...overrides,
  };
}

const LOADED = {
  card: { kind: "trend", period: "month", points: [], compareIndex: null },
  metricName: "New Residential Housing Units Completed",
};

function ctx(id = "147322") {
  return { params: Promise.resolve({ id }) };
}

function request(): Request {
  return new Request("https://transparent.city/t/147322/card-image");
}

function notFound(): Error {
  return Object.assign(new Error("Chart not found"), { status: 404 });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  imageResponse.mockReset();
  getPublicTimeSeriesChart.mockReset();
  loadStoryChartCard.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /t/[id]/card-image", () => {
  it("draws the chart card, this year against last year when it can", async () => {
    getPublicTimeSeriesChart.mockResolvedValue(chart());
    loadStoryChartCard.mockResolvedValue(LOADED);

    const res = await GET(request(), ctx());

    expect(loadStoryChartCard).toHaveBeenCalledWith(
      { chartId: 147322, period: "day", end: null, ytd: true },
      expect.any(Function),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("generated-card");
    expect(res.headers.get("content-length")).toBe(String("generated-card".length));
    expect(res.headers.get("cache-control")).toContain("s-maxage=86400");
    const [element] = imageResponse.mock.calls[0] as [{ props: Record<string, unknown> }];
    expect(element.props).toMatchObject({ metricName: LOADED.metricName, cityName: "San Francisco" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches each chart once while drawing", async () => {
    getPublicTimeSeriesChart.mockResolvedValue(chart());
    loadStoryChartCard.mockImplementation(
      async (_target: unknown, fetchChart: (id: number) => Promise<unknown>) => {
        await fetchChart(147322);
        await fetchChart(147323);
        await fetchChart(147323);
        return LOADED;
      },
    );

    await GET(request(), ctx());

    expect(getPublicTimeSeriesChart.mock.calls).toEqual([[147322], [147323]]);
  });

  it("falls back to the backend's image when the chart can't be drawn", async () => {
    getPublicTimeSeriesChart.mockResolvedValue(chart());
    loadStoryChartCard.mockResolvedValue(null);
    fetchMock.mockResolvedValue(
      new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } }),
    );

    const res = await GET(request(), ctx());

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/time-series/public/147322/image?period=day&width=1200&height=630",
      expect.anything(),
    );
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("falls back to the backend's image when drawing throws", async () => {
    getPublicTimeSeriesChart.mockResolvedValue(chart());
    loadStoryChartCard.mockRejectedValue(new Error("satori"));
    fetchMock.mockResolvedValue(
      new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } }),
    );

    const res = await GET(request(), ctx());

    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("502s briefly when no image can be made", async () => {
    getPublicTimeSeriesChart.mockResolvedValue(chart());
    loadStoryChartCard.mockResolvedValue(null);
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    const res = await GET(request(), ctx());

    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
  });

  it("404s an unknown chart and 502s when the chart can't be loaded", async () => {
    getPublicTimeSeriesChart.mockRejectedValueOnce(notFound());
    expect((await GET(request(), ctx())).status).toBe(404);

    getPublicTimeSeriesChart.mockRejectedValueOnce(new Error("bad gateway"));
    expect((await GET(request(), ctx())).status).toBe(502);
    expect(loadStoryChartCard).not.toHaveBeenCalled();
  });

  it("400s a non-numeric id without calling the backend", async () => {
    const res = await GET(request(), ctx("abc"));

    expect(res.status).toBe(400);
    expect(getPublicTimeSeriesChart).not.toHaveBeenCalled();
  });
});
