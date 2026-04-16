"use client";

import { useEffect } from "react";
import { trackCityView } from "@/lib/analytics";
import { useProductEvent } from "@/lib/productAnalytics";

type CityViewTrackerProps = {
  citySlug: string;
  cityId?: number;
};

/**
 * Fires once on city page mount:
 *  - First-party city_page_view → product_events table (landing source of truth)
 *  - GA4 city_view via gtag (kept for continuity)
 */
export default function CityViewTracker({ citySlug, cityId }: CityViewTrackerProps) {
  // First-party: write to product_events (this is our internal landing log)
  useProductEvent("city_page_view", {
    city_slug: citySlug,
    city_id: cityId ?? null,
  });

  // GA4 (existing — kept alongside, no changes to existing behavior)
  useEffect(() => {
    trackCityView(citySlug, cityId);
  }, [citySlug, cityId]);

  return null;
}
