"use client";

import { useMemo, useState, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useFeedStories } from "@/lib/hooks/useFeed";
import { enrichStories, type EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import FeedCard from "@/components/feed/FeedCard";
import feedStyles from "@/components/feed/feed.module.css";
import Loader from "@/components/Loader";
import "./PlaceDashboardStories.css";

type PlaceDashboardStoriesProps = {
  placeId: number;
  placeLabel?: string | null;
  isAdmin?: boolean;
};

function sectionTitle(placeLabel?: string | null): string {
  return `Stories for ${placeLabel ?? "this place"}`;
}

export default function PlaceDashboardStories({
  placeId,
  placeLabel,
  isAdmin = false,
}: PlaceDashboardStoriesProps) {
  const { isAuthenticated } = useAuth0();
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());

  const { data, isLoading, isError } = useFeedStories({
    user_place_id: placeId,
    limit: 50,
    order_by: "created_at",
    enabled: isAuthenticated && placeId > 0,
  });

  const userPlaceLabelMap = useMemo(() => {
    if (!placeLabel) return undefined;
    return new Map([[placeId, placeLabel]]);
  }, [placeId, placeLabel]);

  const stories = useMemo(() => {
    const raw = data?.stories ?? [];
    const enriched = enrichStories(raw, undefined, userPlaceLabelMap, {
      skipInterleave: true,
    });
    return enriched
      .filter((s) => !hiddenIds.has(s.id))
      .sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
  }, [data?.stories, userPlaceLabelMap, hiddenIds]);

  const handleHide = useCallback((storyId: number) => {
    if (storyId < 0) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(-storyId);
        return next;
      });
      return;
    }
    setHiddenIds((prev) => new Set(prev).add(storyId));
  }, []);

  if (!isAuthenticated) {
    return null;
  }

  const title = sectionTitle(placeLabel);

  if (isLoading) {
    return (
      <div className={`${feedStyles.feedContainer} place-dashboard-stories`}>
        <h2 className="city-view-section-title">{title}</h2>
        <div
          className="dashboard-metrics-loading tc-loading-state"
          style={{ padding: "48px 24px" }}
        >
          <Loader size="sm" color="dark" />
          <span>Loading stories…</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return null;
  }

  if (stories.length === 0) {
    return (
      <div className={`${feedStyles.feedContainer} place-dashboard-stories`}>
        <h2 className="city-view-section-title">{title}</h2>
        <div className="ytd-placeholder">
          <p>
            No stories for {placeLabel ?? "this place"} yet. New stories appear
            as your block data updates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${feedStyles.feedContainer} place-dashboard-stories`}
      aria-label="Place stories"
    >
      <h2 className="city-view-section-title">{title}</h2>
      <div className={feedStyles.storiesList}>
        {stories.map((story: EnrichedFeedStory) => (
          <FeedCard
            key={story.id}
            story={story}
            isAdmin={isAdmin}
            onHide={handleHide}
          />
        ))}
      </div>
    </div>
  );
}
