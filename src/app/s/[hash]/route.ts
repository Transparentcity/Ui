import { getPublicFeedStoryByHash, listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import { shortLinkRedirectPath } from "@/lib/feed/shortLink";

/**
 * /s/{hash} — public short URL for feed stories.
 *
 * A Route Handler, not a page. As a page this segment had a loading.tsx
 * sibling, so Next started streaming the shell before the awaited story
 * lookup reached redirect(); the 307 degraded to a 200 carrying a
 * client-side redirect payload. Browsers still landed on the story, but
 * link-preview crawlers (X, Slack, iMessage, Facebook) never run that
 * payload and unfurled the root layout's default Open Graph card for every
 * short link. A route handler has nothing to stream and always answers with
 * a real HTTP 307 to the canonical story page, whose own generateMetadata
 * carries the story's og/twitter tags and card image.
 *
 * Location is relative on purpose: an absolute URL rebuilt from the
 * incoming request can pick up the proxy's internal scheme and cost an
 * extra hop. Relative Location is what Next's own redirect() emits.
 */

/** Short links must never have a 404 cached over a transient backend outage. */
const NOT_FOUND_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
};

const NOT_FOUND_BODY = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Link not found – Transparent.city</title></head>
<body style="font:16px/1.6 system-ui,sans-serif;color:#1a1a1a;text-align:center;padding:15vh 24px">
<h1 style="font-size:24px;margin:0 0 12px">Link not found</h1>
<p style="color:#666;margin:0 0 24px">This story link has expired or never existed.</p>
<a href="/" style="color:#0b6bcb">Go to Transparent.city</a>
</body></html>`;

function notFoundResponse(): Response {
  return new Response(NOT_FOUND_BODY, { status: 404, headers: NOT_FOUND_HEADERS });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hash: string }> },
): Promise<Response> {
  const { hash } = await params;
  if (!hash) return notFoundResponse();

  let story: Awaited<ReturnType<typeof getPublicFeedStoryByHash>>["story"] | null = null;
  try {
    const res = await getPublicFeedStoryByHash(hash);
    story = res.story;
  } catch {
    return notFoundResponse();
  }

  if (!story) return notFoundResponse();

  // Resolve the city slug for the canonical URL; without it we fall back to
  // the legacy /feed/{id} page rather than guessing a slug.
  let cities: Awaited<ReturnType<typeof listPublicCitiesForSitemap>> | null = null;
  if (story.city_id) {
    try {
      cities = await listPublicCitiesForSitemap();
    } catch {
      // fall through to legacy path
    }
  }

  const search = new URL(request.url).search;
  return new Response(null, {
    status: 307,
    headers: {
      Location: shortLinkRedirectPath(hash, story, cities, search),
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
