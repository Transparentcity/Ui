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
  properties?: {
    short_code?: string;
  };
};

type MapboxResponse = {
  type: string;
  query: string[];
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

function extractPlaceName(feature: MapboxFeature): string | null {
  if (feature.place_type.includes("postcode")) {
    return extractContextValue(feature.context, "place.");
  }
  if (
    feature.place_type.includes("place") ||
    feature.place_type.includes("locality")
  ) {
    return feature.text;
  }
  return extractContextValue(feature.context, "place.") || feature.text;
}

export type GeocodeSuggestion = {
  place_name: string;
  lat: number;
  lon: number;
  cityName: string | null;
  stateName: string | null;
  countryName: string | null;
  /** Mapbox feature place_type (e.g. ["place"], ["address"]). Used to avoid block creation for city picks. */
  place_types: string[];
};

/**
 * Address autocomplete: returns multiple suggestions for the query.
 * Used by onboarding and any address input that needs autocomplete.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!mapboxToken) {
    return NextResponse.json({ suggestions: [] });
  }

  const isZipcode = /^\d{5}(-\d{4})?$/.test(q);
  const searchText = encodeURIComponent(q);
  const upstreamUrl = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${searchText}.json`
  );

  upstreamUrl.searchParams.set("access_token", mapboxToken);
  upstreamUrl.searchParams.set("limit", "6");

  if (isZipcode) {
    upstreamUrl.searchParams.set("types", "postcode");
    upstreamUrl.searchParams.set("country", "US");
  } else {
    upstreamUrl.searchParams.set(
      "types",
      "place,locality,neighborhood,address,postcode"
    );
  }

  try {
    const upstreamRes = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!upstreamRes.ok) {
      return NextResponse.json({ suggestions: [] });
    }

    const data = (await upstreamRes.json()) as MapboxResponse;
    if (!data.features?.length) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions: GeocodeSuggestion[] = data.features.map((f) => {
      const [longitude, latitude] = f.center;
      const cityName = extractPlaceName(f);
      const stateName = extractContextValue(f.context, "region.");
      const countryName = extractContextValue(f.context, "country.");
      return {
        place_name: f.place_name,
        lat: latitude,
        lon: longitude,
        cityName,
        stateName,
        countryName,
        place_types: f.place_type ?? [],
      };
    });

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
