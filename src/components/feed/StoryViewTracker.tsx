"use client";

/**
 * Fires a `story_view` product event when the story page mounts.
 *
 * Must be a client component (useEffect) even though the story page is a
 * Server Component.  Rendered as a zero-size element so it has no visual
 * footprint.  The event feeds the story ranking signal in story_scoring_service.
 */

import { useProductEvent } from "@/lib/productAnalytics";

interface StoryViewTrackerProps {
  storyId: number;
  cityId?: number | null;
  citySlug?: string | null;
}

export default function StoryViewTracker({
  storyId,
  cityId,
  citySlug,
}: StoryViewTrackerProps) {
  useProductEvent("story_view", {
    story_id: storyId,
    city_id: cityId ?? undefined,
    city_slug: citySlug ?? undefined,
  });
  return null;
}
