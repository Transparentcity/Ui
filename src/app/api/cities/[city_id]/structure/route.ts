import { NextResponse } from "next/server";

// Use the same API base URL as the apiClient
const BACKEND_API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ city_id: string }> }
): Promise<Response> {
  const resolvedParams = await params;
  const cityId = resolvedParams.city_id;

  console.log(`[api/cities/structure] Request for city_id: ${cityId}`);
  console.log(`[api/cities/structure] NEXT_PUBLIC_API_URL: ${process.env.NEXT_PUBLIC_API_URL}`);
  console.log(`[api/cities/structure] Using backend URL base: ${BACKEND_API_URL}`);

  if (!cityId || isNaN(parseInt(cityId, 10))) {
    return NextResponse.json(
      { error: "Invalid city_id parameter" },
      { status: 400 }
    );
  }

  // Try endpoints in order of preference:
  // 1. Public endpoint (no auth required) - best for map embeds
  // 2. Main cities endpoint (requires auth)
  // 3. Template-metrics endpoint (requires auth)
  const endpoints = [
    `${BACKEND_API_URL}/api/public/cities/${cityId}/structure`,
    `${BACKEND_API_URL}/api/cities/${cityId}/structure`,
    `${BACKEND_API_URL}/api/template-metrics/cities/${cityId}/structure`,
  ];

  let lastError: string = "";
  let lastStatus: number = 500;

  for (const endpoint of endpoints) {
    try {
      console.log(`[api/cities/structure] Trying endpoint: ${endpoint}`);
      const backendRes = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      console.log(`[api/cities/structure] Response status: ${backendRes.status}`);

      if (backendRes.ok) {
        const data = await backendRes.json();
        console.log(`[api/cities/structure] Successfully fetched city structure from: ${endpoint}`);
        return NextResponse.json(data);
      }

      // Store the error for fallback
      lastError = await backendRes.text().catch(() => "");
      lastStatus = backendRes.status;
      console.log(`[api/cities/structure] Endpoint failed, trying next...`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[api/cities/structure] Fetch error for ${endpoint}:`, errorMessage);
      lastError = errorMessage;
      lastStatus = 500;
    }
  }

  // All endpoints failed
  console.error(`[api/cities/structure] All endpoints failed for city ${cityId}`);
  return NextResponse.json(
    { 
      error: "Failed to fetch city structure", 
      details: lastError,
      triedEndpoints: endpoints,
      hint: "Check if the backend server is running and accessible at " + BACKEND_API_URL
    },
    { status: lastStatus }
  );
}
