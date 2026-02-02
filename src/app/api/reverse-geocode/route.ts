import { NextResponse } from "next/server";

type MapboxFeature = {
  id: string;
  type: string;
  place_type: string[];
  relevance: number;
  text: string;
  place_name: string;
  center: [number, number]; // [longitude, latitude]
  context?: Array<{
    id: string;
    text: string;
    short_code?: string;
  }>;
};

type MapboxResponse = {
  type: string;
  query: [number, number];
  features: MapboxFeature[];
};

function extractContextValue(
  context: MapboxFeature["context"],
  prefix: string
): string | null {
  if (!context) return null;
  const item = context.find((c) => c.id.startsWith(prefix));
  return item?.text || null;
}

function extractCityName(feature: MapboxFeature): string | null {
  // For places, the text field contains the place name
  if (
    feature.place_type.includes("place") ||
    feature.place_type.includes("locality")
  ) {
    return feature.text;
  }
  // For addresses or other types, get the place from context
  return extractContextValue(feature.context, "place.") || feature.text;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lat = (url.searchParams.get("lat") || "").trim();
  const lng = (url.searchParams.get("lng") || "").trim();

  if (!lat || !lng) {
    return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
  }

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!mapboxToken) {
    console.error("NEXT_PUBLIC_MAPBOX_TOKEN not configured");
    return NextResponse.json(
      { error: "Geocoding service not configured" },
      { status: 500 }
    );
  }

  // Mapbox reverse geocoding uses longitude,latitude order
  // https://docs.mapbox.com/api/search/geocoding/#reverse-geocoding
  const coordinates = `${lng},${lat}`;
  const upstreamUrl = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates}.json`
  );

  upstreamUrl.searchParams.set("access_token", mapboxToken);
  upstreamUrl.searchParams.set(
    "types",
    "place,locality,neighborhood,address,postcode"
  );
  upstreamUrl.searchParams.set("limit", "1");

  try {
    const upstreamRes = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!upstreamRes.ok) {
      const text = await upstreamRes.text().catch(() => "");
      console.error("Mapbox reverse geocoding failed:", upstreamRes.status, text);
      return NextResponse.json(
        { error: "Upstream reverse geocoding failed", details: text },
        { status: 502 }
      );
    }

    const data = (await upstreamRes.json()) as MapboxResponse;

    if (!data.features || data.features.length === 0) {
      // Return coordinates even if no place found
      return NextResponse.json({
        lat,
        lon: lng,
        display_name: null,
        address: null,
        cityName: null,
        stateName: null,
        countryName: null,
      });
    }

    const top = data.features[0];
    const [longitude, latitude] = top.center;

    // Extract location data from Mapbox response
    const cityName = extractCityName(top);
    const stateName = extractContextValue(top.context, "region.");
    const countryName = extractContextValue(top.context, "country.");
    const postcode =
      top.place_type.includes("postcode")
        ? top.text
        : extractContextValue(top.context, "postcode.");

    return NextResponse.json({
      lat: latitude.toString(),
      lon: longitude.toString(),
      display_name: top.place_name,
      address: {
        city: cityName,
        state: stateName,
        country: countryName,
        postcode: postcode,
      },
      cityName,
      stateName,
      countryName,
    });
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return NextResponse.json(
      { error: "Reverse geocoding request failed" },
      { status: 500 }
    );
  }
}
