"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  listFeedStories,
  getFeedStory,
  trackFeedEngagement,
  listPublicFeedStories,
  getPublicFeedStory,
  type FeedStory,
  type FeedStoriesResponse,
  type FeedStoryResponse,
} from "@/lib/apiClient";

// Re-export types for consumers
export type { FeedStory };

// Query keys factory for feed stories
export const feedKeys = {
  all: ["feed"] as const,
  lists: () => [...feedKeys.all, "list"] as const,
  list: (filters?: Record<string, any>) => [...feedKeys.lists(), filters] as const,
  city: (cityId: number | null, filters?: Record<string, any>) =>
    [...feedKeys.all, "city", cityId, filters] as const,
  details: () => [...feedKeys.all, "detail"] as const,
  detail: (storyId: number | null) => [...feedKeys.details(), storyId] as const,
};

/**
 * Hook to list feed stories with optional filtering.
 * Cache time: 2 minutes
 */
export function useFeedStories(options?: {
  city_id?: number;
  district?: number | null;
  newsletter_frequency?: string | null;
  limit?: number;
  order_by?: string;
}) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  return useQuery({
    queryKey: feedKeys.list(options),
    queryFn: async () => {
      if (isAuthenticated) {
        const token = await getAccessTokenSilently();
        return listFeedStories(token, options);
      } else {
        // Use public endpoint if not authenticated
        return listPublicFeedStories(options);
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: true,
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
          newsletter_frequency: options?.newsletter_frequency ?? undefined,
          limit: options?.limit ?? 50,
          order_by: options?.order_by ?? "published_at",
        });
      } else {
        return listPublicFeedStories({
          city_id: cityId,
          district: options?.district ?? undefined,
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
  });
}

/**
 * Hook to track engagement with a feed story.
 * Automatically invalidates the story query on success.
 */
export function useTrackFeedEngagement() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      storyId,
      action,
    }: {
      storyId: number;
      action: "view" | "click" | "share";
    }) => {
      if (!isAuthenticated) {
        // Silently fail if not authenticated (engagement tracking is optional)
        return { success: false, message: "Not authenticated" };
      }
      const token = await getAccessTokenSilently();
      return trackFeedEngagement(storyId, action, token);
    },
    onSuccess: (_, variables) => {
      // Invalidate the story detail query to refresh engagement counts
      queryClient.invalidateQueries({ queryKey: feedKeys.detail(variables.storyId) });
      // Also invalidate lists to refresh counts in list views
      queryClient.invalidateQueries({ queryKey: feedKeys.lists() });
    },
  });
}
