"use client";

import { useEffect } from "react";
import { trackCityView } from "@/lib/analytics";

type CityViewTrackerProps = {
  citySlug: string;
  cityId?: number;
};

/**
 * Client component to track city page views
 * Used in server-rendered city pages
 */
export default function CityViewTracker({
  citySlug,
  cityId,
}: CityViewTrackerProps) {
  useEffect(() => {
    trackCityView(citySlug, cityId);
  }, [citySlug, cityId]);

  return null;
}
