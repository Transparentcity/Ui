import { NextResponse } from "next/server";

type NominatimSearchResult = {
  lat: string;
  lon: string;
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

function extractCityName(address?: NominatimSearchResult["address"]): string | null {
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
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  const upstreamUrl = new URL("https://nominatim.openstreetmap.org/search");
  upstreamUrl.searchParams.set("format", "jsonv2");
  upstreamUrl.searchParams.set("addressdetails", "1");
  upstreamUrl.searchParams.set("limit", "1");
  upstreamUrl.searchParams.set("q", q);

  const upstreamRes = await fetch(upstreamUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "transparentcity-ui/1.0 (geocode proxy)",
    },
    cache: "no-store",
  });

  if (!upstreamRes.ok) {
    const text = await upstreamRes.text().catch(() => "");
    return NextResponse.json(
      { error: "Upstream geocoding failed", details: text },
      { status: 502 },
    );
  }

  const data = (await upstreamRes.json()) as NominatimSearchResult[];
  const top = Array.isArray(data) && data.length ? data[0] : null;
  if (!top) {
    return NextResponse.json({ error: "No results" }, { status: 404 });
  }

  return NextResponse.json({
    lat: top.lat,
    lon: top.lon,
    display_name: top.display_name || null,
    address: top.address || null,
    cityName: extractCityName(top.address),
    stateName: top.address?.state || null,
    countryName: top.address?.country || null,
  });
}


