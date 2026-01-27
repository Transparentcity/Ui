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
    address.county ||
    null
  );
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  // Check if this is a zipcode
  const isZipcode = /^\d{5}(-\d{4})?$/.test(q);
  const zip5 = isZipcode ? q.split('-')[0] : null;

  const upstreamUrl = new URL("https://nominatim.openstreetmap.org/search");
  upstreamUrl.searchParams.set("format", "jsonv2");
  upstreamUrl.searchParams.set("addressdetails", "1");
  upstreamUrl.searchParams.set("limit", "10"); // Get more results for better matching
  
  if (isZipcode && zip5) {
    // For US zipcodes, use Nominatim's structured query with postalcode parameter
    // This is more reliable than free-text search
    upstreamUrl.searchParams.set("postalcode", zip5);
    upstreamUrl.searchParams.set("country", "USA");
  } else {
    // For other queries, use the q parameter as-is
    upstreamUrl.searchParams.set("q", q);
  }

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
  
  if (!Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: "No results" }, { status: 404 });
  }

  // For zipcodes, validate that the result actually matches the zipcode
  let top = data[0];
  if (isZipcode && zip5) {
    // Find a result that matches the zipcode in the postcode field
    // Normalize postcode by removing spaces and hyphens, then check if it starts with zip5
    const matchingResult = data.find((result) => {
      const postcode = result.address?.postcode;
      if (!postcode) return false;
      const normalized = postcode.replace(/[\s-]/g, '');
      return normalized.startsWith(zip5);
    });
    
    if (matchingResult) {
      top = matchingResult;
    } else {
      // If no exact match, check if any result has a postcode that contains the zipcode
      const partialMatch = data.find((result) => {
        const postcode = result.address?.postcode;
        if (!postcode) return false;
        const normalized = postcode.replace(/[\s-]/g, '');
        return normalized.includes(zip5);
      });
      
      if (partialMatch) {
        top = partialMatch;
      } else {
        // None of the results match the zipcode - return error instead of wrong data
        console.error(`Zipcode ${zip5} not found. Nominatim returned postcode: ${top.address?.postcode || 'none'}`);
        return NextResponse.json(
          { error: `ZIP code ${zip5} not found. Please try entering a city name instead.` },
          { status: 404 }
        );
      }
    }
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











