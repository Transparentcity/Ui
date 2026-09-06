import { NextResponse } from "next/server";
import { getUpstreamApiBaseUrl } from "@/lib/apiBase";

/**
 * City structure for anonymous and authenticated callers.
 *
 * Tries the public structure endpoint first (embeds, public map pages), then
 * the authenticated endpoints when the browser sent a Bearer token. Reached via
 * the `fallback` rewrite ordering in next.config.ts; a plain rewrite array
 * would shadow this dynamic route and send callers straight to the backend,
 * which answers anonymous requests with 401.
 */

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

  // Prefer the public structure endpoint (embeds / anonymous). Do not fall back to
  // /api/cities/... without a Bearer token — that always 401s and looked like "login is broken".
  const BACKEND_API_URL = getUpstreamApiBaseUrl();
  const publicUrl = `${BACKEND_API_URL}/api/public/cities/${cityId}/structure`;
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

  let lastError = "";
  let lastStatus = 500;

  try {
    let backendRes = await tryFetch(publicUrl, false);
    if (backendRes.ok) {
      return NextResponse.json(await backendRes.json());
    }
    lastError = await backendRes.text().catch(() => "");
    lastStatus = backendRes.status;

    // Only if the browser sent Authorization, try authenticated fallbacks (admin / template).
    if (authHeader) {
      const authedUrls = [
        `${BACKEND_API_URL}/api/cities/${cityId}/structure`,
        `${BACKEND_API_URL}/api/template-metrics/cities/${cityId}/structure`,
      ];
      for (const endpoint of authedUrls) {
        backendRes = await tryFetch(endpoint, true);
        if (backendRes.ok) {
          return NextResponse.json(await backendRes.json());
        }
        lastError = await backendRes.text().catch(() => "");
        lastStatus = backendRes.status;
      }
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
