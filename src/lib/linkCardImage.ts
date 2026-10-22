/**
 * Social-card images for chart (/t/{id}) and map (/m/{hash}) pages.
 *
 * Like story cards (see src/lib/feed/storyCardImage.ts), these are served from
 * the page's own path rather than the backend's /api image URLs, which
 * robots.txt keeps X's crawler away from. A link to one of these pages in a
 * post on X shows the image as the link's card.
 */

const CHART_PATH_RE = /^\/t\/(\d+)\/?$/;
const MAP_PATH_RE = /^\/m\/([A-Za-z0-9_-]{1,64})\/?$/;

export function chartCardImagePath(chartId: string | number): string {
  return `/t/${chartId}/card-image`;
}

export function mapCardImagePath(hash: string): string {
  return `/m/${hash}/card-image`;
}

/** Card image path for a link to a chart or map page, or null for any other link. */
export function cardImagePathForLink(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const chart = url.pathname.match(CHART_PATH_RE);
  if (chart) return chartCardImagePath(chart[1]);
  const map = url.pathname.match(MAP_PATH_RE);
  return map ? mapCardImagePath(map[1]) : null;
}

export type CardImage = { body: ArrayBuffer; contentType: string };

/** How long a card route waits on the backend's image before giving up. */
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Fetch an image for a card route to serve, buffered so the response carries
 * a Content-Length. Returns "missing" when the backend answers 403 or 404, and
 * null on any other doubt (error status, non-image body, network failure).
 */
export async function fetchCardImage(url: string): Promise<CardImage | "missing" | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "image/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 403 || res.status === 404) return "missing";
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.startsWith("image/")) return null;
    const body = await res.arrayBuffer();
    return body.byteLength > 0 ? { body, contentType } : null;
  } catch {
    return null;
  }
}

export function cardImageResponse(image: CardImage, cacheControl: string): Response {
  return new Response(image.body, {
    status: 200,
    headers: {
      "content-type": image.contentType,
      "content-length": String(image.body.byteLength),
      "cache-control": cacheControl,
    },
  });
}
