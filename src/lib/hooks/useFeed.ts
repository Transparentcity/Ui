"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  listFeedStories,
  getFeedStory,
  trackFeedEngagement,
  setFeedStoryFeedback,
  hideFeedStory,
  listFeedPlaces,
  listPublicFeedStories,
  getPublicFeedStory,
  listPublicFeedPlaces,
  type FeedStory,
  type FeedStoriesResponse,
  type FeedStoryResponse,
  type FeedPlace,
} from "@/lib/apiClient";

// Re-export types for consumers
export type { FeedStory, FeedPlace };

// Query keys factory for feed stories
export const feedKeys = {
  all: ["feed"] as const,
  lists: () => [...feedKeys.all, "list"] as const,
  list: (filters?: Record<string, any>) => [...feedKeys.lists(), filters] as const,
  city: (cityId: number | null, filters?: Record<string, any>) =>
    [...feedKeys.all, "city", cityId, filters] as const,
  details: () => [...feedKeys.all, "detail"] as const,
  detail: (storyId: number | null) => [...feedKeys.details(), storyId] as const,
  places: () => [...feedKeys.all, "places"] as const,
};

/**
 * Hook to list (city, district) places that have feed stories (for filter UI).
 * Returns the actual subset of cities and districts in the feed (e.g. SF District 2, SF District 3).
 */
export function useFeedPlaces() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  return useQuery({
    queryKey: feedKeys.places(),
    queryFn: async () => {
      if (isAuthenticated) {
        const token = await getAccessTokenSilently();
        return listFeedPlaces(token);
      }
      return listPublicFeedPlaces();
    },
    staleTime: 2 * 60 * 1000,
    enabled: true,
  });
}

/**
 * Hook to list feed stories with optional filtering.
 * Cache time: 2 minutes
 */
export function useFeedStories(options?: {
  city_id?: number;
  district?: number | null;
  scope?: "city_wide" | "district_only" | null;
  newsletter_frequency?: string | null;
  category?: string | null;
  limit?: number;
  order_by?: string;
  /** When true and no city_id, return all active stories (ignore follows). Use for "All Cities" view. */
  all_cities?: boolean;
  /** Filter by story type (e.g. 'off_the_charts', 'alert', 'trend'). */
  story_type?: string | null;
  /** Saved place filter (user_places.id); authenticated API only. */
  user_place_id?: number | null;
  /** All stories tagged to any of the user's saved places (auth only). */
  only_my_saved_places?: boolean;
  /** Skip the query when false. Defaults to true. */
  enabled?: boolean;
}) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const { enabled = true, ...apiOptions } = options ?? {};

  return useQuery({
    queryKey: feedKeys.list(apiOptions),
    queryFn: async () => {
      if (isAuthenticated) {
        const token = await getAccessTokenSilently();
        return listFeedStories(token, apiOptions);
      } else {
        // Use public endpoint if not authenticated
        return listPublicFeedStories(apiOptions);
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled,
    // Keep showing previous results while loading more (avoids scroll-to-top flicker)
    placeholderData: keepPreviousData,
  });
}

/**
 * Hook to list feed stories for a specific city with optional filtering.
 * Cache time: 2 minutes
 */
export function useCityFeedStories(
  cityId: number | null,
  options?: {
    district?: number | null;
    scope?: "city_wide" | "district_only" | null;
    newsletter_frequency?: string | null;
    limit?: number;
    order_by?: string;
  }
) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  return useQuery({
    queryKey: feedKeys.city(cityId, options),
    queryFn: async () => {
      if (!cityId) throw new Error("City ID is required");

      if (isAuthenticated) {
        const token = await getAccessTokenSilently();
        return listFeedStories(token, {
          city_id: cityId,
          district: options?.district ?? undefined,
          scope: options?.scope ?? undefined,
          newsletter_frequency: options?.newsletter_frequency ?? undefined,
          limit: options?.limit ?? 50,
          order_by: options?.order_by ?? "published_at",
        });
      } else {
        return listPublicFeedStories({
          city_id: cityId,
          district: options?.district ?? undefined,
          scope: options?.scope ?? undefined,
          newsletter_frequency: options?.newsletter_frequency ?? undefined,
          limit: options?.limit ?? 50,
          order_by: options?.order_by ?? "published_at",
        });
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!cityId,
  });
}

/**
 * Hook to get a single feed story detail.
 * Works for both authenticated and unauthenticated users.
 * Cache time: 5 minutes
 */
export function useFeedStoryDetail(storyId: number | null) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  return useQuery({
    queryKey: feedKeys.detail(storyId),
    queryFn: async () => {
      if (!storyId) throw new Error("Story ID is required");

      // Try to get token, but don't fail if not authenticated (use public endpoint)
      let token: string | undefined;
      try {
        if (isAuthenticated) {
          token = await getAccessTokenSilently();
          return getFeedStory(storyId, token);
        }
      } catch {
        // User not authenticated, will use public endpoint
      }

      return getPublicFeedStory(storyId);
    },
    enabled: !!storyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    // List view seeds this cache so the modal can paint immediately; still refresh
    // from the server so detail-only fields stay correct.
    refetchOnMount: "always",
  });
}

/**
 * Hook to track engagement with a feed story.
 * Does not invalidate feed queries (avoids refetch storms that slow the detail modal).
 */
export function useTrackFeedEngagement() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  // Kill switch: set NEXT_PUBLIC_DISABLE_FEED_ENGAGEMENT=true to disable.
  // Enabled by default so applause/engagement counts persist.
  const engagementEnabled =
    process.env.NEXT_PUBLIC_DISABLE_FEED_ENGAGEMENT !== "true";

  return useMutation({
    mutationFn: async ({
      storyId,
      action,
    }: {
      storyId: number;
      action: "view" | "click" | "share" | "like";
    }) => {
      if (!engagementEnabled) {
        return { success: false, message: "Engagement disabled" };
      }
      if (!isAuthenticated) {
        // Silently fail if not authenticated (engagement tracking is optional)
        return { success: false, message: "Not authenticated" };
      }
      const token = await getAccessTokenSilently();
      return trackFeedEngagement(storyId, action, token);
    },
  });
}

/**
 * Hook to set AI feedback (thumbs up/down) for a feed story.
 * Invalidates feed list so story shows updated user_ai_feedback.
 */
export function useSetFeedStoryFeedback() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      storyId,
      feedback,
    }: {
      storyId: number;
      feedback: "up" | "down";
    }) => {
      if (!isAuthenticated) {
        return { success: false, message: "Not authenticated" };
      }
      const token = await getAccessTokenSilently();
      return setFeedStoryFeedback(storyId, feedback, token);
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: feedKeys.lists() });
      queryClient.invalidateQueries({ queryKey: feedKeys.detail(variables.storyId) });
    },
  });
}

/**
 * Hook to hide a story from the current user's feed.
 * Invalidates feed list so the story is removed from the list.
 */
export function useHideFeedStory() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ storyId }: { storyId: number }) => {
      if (!isAuthenticated) {
        return { success: false, message: "Not authenticated" };
      }
      const token = await getAccessTokenSilently();
      return hideFeedStory(storyId, token);
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: feedKeys.lists() });
      queryClient.invalidateQueries({ queryKey: feedKeys.detail(variables.storyId) });
    },
  });
}
