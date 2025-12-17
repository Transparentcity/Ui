import { NextResponse } from "next/server";

export const revalidate = 300;

type ResearchMediaResponse = {
  charts: string[];
  images: string[];
};

function toAbsoluteUrl(base: URL, value: string): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function extractChartIframes(html: string, baseUrl: URL): string[] {
  const urls: string[] = [];
  const chartContainerRegex =
    /<div\s+class="chart-container"[^>]*>[\s\S]*?<iframe[^>]+src="([^"]+)"[^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = chartContainerRegex.exec(html)) !== null) {
    const src = match[1];
    if (!src) continue;
    urls.push(toAbsoluteUrl(baseUrl, src));
  }

  return Array.from(new Set(urls));
}

function extractImages(html: string, baseUrl: URL): string[] {
  const urls: string[] = [];
  // Prefer images inside the main article content if present.
  const contentMatch = html.match(/<div\s+class="content"[^>]*>([\s\S]*?)<\/div>/i);
  const target = contentMatch ? contentMatch[1] : html;

  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(target)) !== null) {
    const src = match[1];
    if (!src) continue;
    urls.push(toAbsoluteUrl(baseUrl, src));
  }

  return Array.from(new Set(urls));
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const permalinkPath = searchParams.get("path");

  if (!permalinkPath) {
    return NextResponse.json(
      { error: "Missing required query param: path" },
      { status: 400 },
    );
  }

  const upstreamBase =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
  const upstreamBaseUrl = new URL(upstreamBase);
  const upstreamUrl = new URL(permalinkPath, upstreamBaseUrl);

  try {
    const res = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        // We want the HTML page; we’ll parse it for media.
        Accept: "text/html",
      },
      // Allow Next’s caching via `revalidate`
      next: { revalidate },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Upstream ${res.status}: ${text}` },
        { status: 502 },
      );
    }

    const html = await res.text();
    const charts = extractChartIframes(html, upstreamUrl);
    const images = extractImages(html, upstreamUrl);

    const payload: ResearchMediaResponse = {
      charts,
      images,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}


