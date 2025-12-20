import { NextResponse } from "next/server";

type NominatimReverseResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
};

function extractCityName(address?: NominatimReverseResult["address"]): string | null {
  if (!address) return null;
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.hamlet ||
    null
  );
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lat = (url.searchParams.get("lat") || "").trim();
  const lng = (url.searchParams.get("lng") || "").trim();

  if (!lat || !lng) {
    return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
  }

  const upstreamUrl = new URL("https://nominatim.openstreetmap.org/reverse");
  upstreamUrl.searchParams.set("format", "jsonv2");
  upstreamUrl.searchParams.set("addressdetails", "1");
  upstreamUrl.searchParams.set("lat", lat);
  upstreamUrl.searchParams.set("lon", lng);

  const upstreamRes = await fetch(upstreamUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "transparentcity-ui/1.0 (reverse-geocode proxy)",
    },
    cache: "no-store",
  });

  if (!upstreamRes.ok) {
    const text = await upstreamRes.text().catch(() => "");
    return NextResponse.json(
      { error: "Upstream reverse geocoding failed", details: text },
      { status: 502 },
    );
  }

  const data = (await upstreamRes.json()) as NominatimReverseResult;

  return NextResponse.json({
    lat: data.lat || lat,
    lon: data.lon || lng,
    display_name: data.display_name || null,
    address: data.address || null,
    cityName: extractCityName(data.address),
    stateName: data.address?.state || null,
    countryName: data.address?.country || null,
  });
}


