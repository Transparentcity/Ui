import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/apiBase";

export const revalidate = 300; // Revalidate every 5 minutes

/**
 * Proxy public feed stories to the backend.
 * Used by the logged-out homepage to show recent research/feed items.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const apiBase = getApiBaseUrl();
  const { searchParams } = new URL(request.url);

  const upstreamUrl = new URL(`${apiBase}/api/feed/public`);
  searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  try {
    const res = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      next: { revalidate },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Feed API ${res.status}: ${text}` },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch feed" },
      { status: 500 },
    );
  }
}
