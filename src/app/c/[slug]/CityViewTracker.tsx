"use client";

import { useEffect } from "react";
import { trackCityView } from "@/lib/analytics";
import { useProductEvent } from "@/lib/productAnalytics";

type CityViewTrackerProps = {
  citySlug: string;
  cityId?: number;
  /** Set on district pages; recorded as a district view of the city. */
  district?: number;
};

/**
 * Fires once on city page mount:
 *  - First-party city_page_view → product_events table (landing source of truth)
 *  - GA4 city_view via gtag (kept for continuity)
 */
export default function CityViewTracker({ citySlug, cityId, district }: CityViewTrackerProps) {
  // First-party: write to product_events (this is our internal landing log)
  useProductEvent("city_page_view", {
    city_slug: citySlug,
    city_id: cityId ?? null,
    ...(district != null ? { district, surface: "district" } : {}),
  });

  // GA4 city_view stays on the city page only, as before.
  useEffect(() => {
    if (district == null) trackCityView(citySlug, cityId);
  }, [citySlug, cityId, district]);

  return null;
}
