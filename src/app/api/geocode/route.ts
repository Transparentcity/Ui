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
  // For places, the text field contains the place name
  // For postcodes, we want the place context
  if (feature.place_type.includes("postcode")) {
    return extractContextValue(feature.context, "place.");
  }
  if (
    feature.place_type.includes("place") ||
    feature.place_type.includes("locality")
  ) {
    return feature.text;
  }
  // For addresses or POIs, get the place from context
  return extractContextValue(feature.context, "place.") || feature.text;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!mapboxToken) {
    console.error("NEXT_PUBLIC_MAPBOX_TOKEN not configured");
    return NextResponse.json(
      { error: "Geocoding service not configured" },
      { status: 500 }
    );
  }

  // Check if this is a US zipcode
  const isZipcode = /^\d{5}(-\d{4})?$/.test(q);
  const zip5 = isZipcode ? q.split("-")[0] : null;

  // Build Mapbox Geocoding API URL
  // https://docs.mapbox.com/api/search/geocoding/
  const searchText = encodeURIComponent(q);
  const upstreamUrl = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${searchText}.json`
  );

  upstreamUrl.searchParams.set("access_token", mapboxToken);
  upstreamUrl.searchParams.set("limit", "5");

  if (isZipcode) {
    // For US zipcodes, restrict to postcode type and US country
    upstreamUrl.searchParams.set("types", "postcode");
    upstreamUrl.searchParams.set("country", "US");
  } else {
    // For general queries, search for places, localities, addresses
    upstreamUrl.searchParams.set(
      "types",
      "place,locality,neighborhood,address,postcode"
    );
  }

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
      console.error("Mapbox geocoding failed:", upstreamRes.status, text);
      return NextResponse.json(
        { error: "Upstream geocoding failed", details: text },
        { status: 502 }
      );
    }

    const data = (await upstreamRes.json()) as MapboxResponse;

    if (!data.features || data.features.length === 0) {
      return NextResponse.json({ error: "No results found" }, { status: 404 });
    }

    // For zipcodes, validate the result matches
    let top = data.features[0];
    if (isZipcode && zip5) {
      const matchingFeature = data.features.find((f) => {
        // Check if the feature text starts with our zipcode
        return f.text.startsWith(zip5);
      });

      if (matchingFeature) {
        top = matchingFeature;
      } else if (!top.text.startsWith(zip5)) {
        // None of the results match the zipcode
        console.error(
          `Zipcode ${zip5} not found. Mapbox returned: ${top.text}`
        );
        return NextResponse.json(
          {
            error: `ZIP code ${zip5} not found. Please try entering a city name instead.`,
          },
          { status: 404 }
        );
      }
    }

    // Extract location data from Mapbox response
    const [longitude, latitude] = top.center;
    const cityName = extractPlaceName(top);
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
    console.error("Geocoding error:", error);
    return NextResponse.json(
      { error: "Geocoding request failed" },
      { status: 500 }
    );
  }
}
