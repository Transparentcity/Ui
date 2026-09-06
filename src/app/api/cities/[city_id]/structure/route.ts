import { NextResponse } from "next/server";

import { getUpstreamApiBaseUrl } from "@/lib/apiBase";

/**
 * Proxy for GET /api/cities/{city_id}/structure.
 *
 * Two kinds of callers reach this path through the same-origin /api proxy:
 *
 * - Anonymous map embeds (ProgressiveMapView, the public /m/[hash] page) send
 *   no Authorization header. The backend's /api/cities/{id}/structure always
 *   401s without a Bearer token, so they are served from the anonymous
 *   /api/public/cities/{id}/structure endpoint, which returns the map-relevant
 *   subset (district_fields, geographic_structures).
 *
 * - Signed-in callers (getCityStructure, getCityLeaders, getCityShapefiles in
 *   src/lib/api/cities.ts) need the full payload: leaders, shapefiles,
 *   mappings, query_configs, status. Only the authenticated endpoints return
 *   those, so an Authorization header routes to them first. The public
 *   endpoint is a last resort so a stale token on a public page still gets
 *   the map basics rather than a hard failure.
 *
 * The catch-all `/api/:path*` rewrite in next.config.ts is a `fallback`
 * rewrite so this dynamic handler is matched before the proxy. Moving it back
 * to a plain (afterFiles) rewrite would shadow this file.
 */

// Authenticated endpoints, in preference order.
function authedUrls(base: string, cityId: string, search: string): string[] {
  return [
    `${base}/api/cities/${cityId}/structure${search}`,
    `${base}/api/template-metrics/cities/${cityId}/structure${search}`,
  ];
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ city_id: string }> }
): Promise<Response> {
  const resolvedParams = await params;
  const cityId = resolvedParams.city_id;

  if (!cityId || isNaN(parseInt(cityId, 10))) {
    return NextResponse.json(
      { error: "Invalid city_id parameter" },
      { status: 400 }
    );
  }

  // Never getApiBaseUrl() here: in production it resolves to the site origin
  // and this handler would call itself through the proxy.
  const base = getUpstreamApiBaseUrl();
  // Preserve caller query params (e.g. ?include_shapefiles=false).
  const search = new URL(req.url).search;
  const publicUrl = `${base}/api/public/cities/${cityId}/structure${search}`;

  const authHeader = req.headers.get("authorization");

  // Carried with Authorization so a proxy session reaches the backend as the
  // proxied user rather than the admin. The structure endpoint authenticates
  // but does not read the caller, so this does not change the response today;
  // it keeps the identity intact across the proxy boundary for logging, and
  // for whenever that endpoint does start varying by user.
  const impersonateUserId = req.headers.get("x-impersonate-user-id");

  const tryFetch = async (url: string, withAuth: boolean) => {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (withAuth && authHeader) {
      headers.Authorization = authHeader;
      if (impersonateUserId) {
        headers["X-Impersonate-User-Id"] = impersonateUserId;
      }
    }
    return fetch(url, { method: "GET", headers, cache: "no-store" });
  };

  // Authenticated endpoints first when the browser sent a token (full
  // payload), then the anonymous public endpoint. Anonymous callers go
  // straight to the public endpoint; the authed ones would only 401.
  const attempts: Array<{ url: string; withAuth: boolean }> = authHeader
    ? [
        ...authedUrls(base, cityId, search).map((url) => ({
          url,
          withAuth: true,
        })),
        { url: publicUrl, withAuth: false },
      ]
    : [{ url: publicUrl, withAuth: false }];

  let lastError = "";
  let lastStatus = 500;

  try {
    for (const attempt of attempts) {
      const backendRes = await tryFetch(attempt.url, attempt.withAuth);
      if (backendRes.ok) {
        return NextResponse.json(await backendRes.json());
      }
      lastError = await backendRes.text().catch(() => "");
      lastStatus = backendRes.status;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[api/cities/structure] Fetch error for city ${cityId}:`, errorMessage);
    lastError = errorMessage;
    lastStatus = 500;
  }

  console.error(`[api/cities/structure] Failed for city ${cityId} (lastStatus=${lastStatus})`);
  return NextResponse.json(
    {
      error: "Failed to fetch city structure",
      details: lastError,
      hint:
        "Verify NEXT_PUBLIC_API_BASE_URL and that GET /api/public/cities/{id}/structure succeeds on the platform.",
    },
    { status: lastStatus }
  );
}
