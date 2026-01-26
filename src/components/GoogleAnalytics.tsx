"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initializeAnalytics, trackPageView, trackFirstVisit } from "@/lib/analytics";

/**
 * Google Analytics component that initializes GA and tracks page views
 * Should be included in the root layout
 */
export default function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize analytics on mount
  useEffect(() => {
    initializeAnalytics();
    trackFirstVisit();
  }, []);

  // Track page views on route changes
  useEffect(() => {
    if (!pathname) return;

    // Build full path with query params
    const fullPath = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;

    // Track page view
    trackPageView(fullPath, document.title);

    // Track search referrer if applicable
    if (searchParams?.has("q") || searchParams?.has("query")) {
      const query = searchParams.get("q") || searchParams.get("query");
      if (query) {
        // This will be handled by trackSearchReferrer if needed
      }
    }
  }, [pathname, searchParams]);

  return null;
}
