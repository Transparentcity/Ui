import { getUpstreamApiBaseUrl } from "@/lib/apiBase";
import { storyCardCacheControl } from "@/lib/feed/storyCardImage";
import { cardImageResponse, fetchCardImage } from "@/lib/linkCardImage";

/**
 * Social-card image for a map page: the backend's render of the map, served
 * from the page's own path (see src/lib/linkCardImage.ts). An unknown or
 * private map is a 404. Any other upstream trouble serves the generic map
 * card, cached only briefly so the next fetch retries the real map.
 */

type RouteContext = { params: Promise<{ hash: string }> };

const HASH_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_IMAGE_PATH = "/images/og-map-default.png";

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { hash } = await context.params;
  if (!HASH_RE.test(hash)) return new Response("Invalid map hash", { status: 400 });

  const map = await fetchCardImage(
    `${getUpstreamApiBaseUrl()}/api/maps/public/${hash}/image?width=1200&height=630`,
  );
  if (map === "missing") return new Response("Map not found", { status: 404 });
  if (map) return cardImageResponse(map, storyCardCacheControl("unversioned"));

  const fallback = await fetchCardImage(new URL(DEFAULT_IMAGE_PATH, request.url).href);
  if (fallback && fallback !== "missing") {
    return cardImageResponse(fallback, storyCardCacheControl("degraded"));
  }
  return new Response("Map image unavailable", {
    status: 502,
    headers: { "cache-control": storyCardCacheControl("degraded") },
  });
}
