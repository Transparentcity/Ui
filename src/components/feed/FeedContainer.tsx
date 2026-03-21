"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFeedStories, useFeedPlaces, useTrackFeedEngagement, feedKeys } from "@/lib/hooks/useFeed";
import { useAuth0 } from "@auth0/auth0-react";
import {
  deleteFeedStory,
  deleteFeedStoriesByCity,
} from "@/lib/apiClient";
import { enrichStories, type EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import FeedCard from "./FeedCard";
import SkeletonCard from "./SkeletonCard";
import FeedEndState from "./FeedEndState";
import styles from "./feed.module.css";

interface FeedContainerProps {
  cityId?: number | null;
  district?: number | null;
  isAdmin?: boolean;
  cityLeadCityIds?: number[];
}

export default function FeedContainer({
  cityId,
  district,
  isAdmin = false,
}: FeedContainerProps) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  const trackEngagement = useTrackFeedEngagement();
  const viewedRef = useRef<Set<number>>(new Set());
  const { data: placesData } = useFeedPlaces();

  // ── Filters ──
  const [selectedCityIds, setSelectedCityIds] = useState<Set<number>>(() =>
    cityId != null ? new Set([cityId]) : new Set(),
  );
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(
    district ?? null,
  );
  const [selectedFrequency, setSelectedFrequency] = useState<string | null>(null);
  const [personalNewsletterOnly, setPersonalNewsletterOnly] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState(10);

  const places = placesData?.places ?? [];
  const uniqueCities = useMemo(() => {
    const seen = new Set<number>();
    return places.filter((p) => {
      if (seen.has(p.city_id)) return false;
      seen.add(p.city_id);
      return true;
    });
  }, [places]);

  // Reset display limit when filters change
  useEffect(() => { setDisplayLimit(10); }, [selectedCityIds, selectedDistrict, selectedFrequency, personalNewsletterOnly, selectedTopic]);

  // Reset district when city selection changes away from a single city
  useEffect(() => {
    if (selectedCityIds.size !== 1) setSelectedDistrict(null);
  }, [selectedCityIds]);

  // Determine API params: single-city → server-side filter, multi/all → fetch all + client filter
  const singleCityId = selectedCityIds.size === 1 ? [...selectedCityIds][0] : undefined;

  const { data: feedData, isLoading, error, refetch } = useFeedStories({
    city_id: personalNewsletterOnly ? undefined : singleCityId,
    district: personalNewsletterOnly ? undefined : (singleCityId ? (selectedDistrict ?? undefined) : undefined),
    newsletter_frequency: selectedFrequency ?? undefined,
    category: personalNewsletterOnly ? "personal_newsletter" : undefined,
    limit: displayLimit,
    order_by: "published_at",
    all_cities: personalNewsletterOnly || !singleCityId,
  });

  const stories = feedData?.stories ?? [];
  const enriched = useMemo(() => enrichStories(stories), [stories]);

  // ── Hidden stories ──
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());

  const handleHide = useCallback((storyId: number) => {
    if (storyId < 0) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(-storyId);
        return next;
      });
    } else {
      setHiddenIds((prev) => new Set(prev).add(storyId));
    }
  }, []);

  const handleDelete = useCallback(async (storyId: number) => {
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStory(storyId, token);
      queryClient.invalidateQueries({ queryKey: feedKeys.lists() });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete story");
    }
  }, [getAccessTokenSilently, queryClient]);

  const visibleStories = useMemo(
    () => enriched.filter((s) => {
      if (hiddenIds.has(s.id)) return false;
      if (selectedTopic && s.card_type !== selectedTopic) return false;
      // Multi-city client-side filter (only when >1 city selected)
      if (selectedCityIds.size > 1 && !selectedCityIds.has(s.city_id)) return false;
      return true;
    }),
    [enriched, hiddenIds, selectedTopic, selectedCityIds],
  );

  // Track views for stories appearing in the feed
  useEffect(() => {
    for (const story of visibleStories) {
      if (!viewedRef.current.has(story.id)) {
        viewedRef.current.add(story.id);
        trackEngagement.mutate({ storyId: story.id, action: "view" });
      }
    }
  }, [visibleStories, trackEngagement]);

  const atEnd = stories.length < displayLimit;

  // ── City chip toggle ──
  const toggleCity = useCallback((cid: number) => {
    setSelectedCityIds((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) {
        next.delete(cid);
      } else {
        next.add(cid);
      }
      return next;
    });
  }, []);

  // ── Admin bulk delete ──
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleDeleteAllForCity = async () => {
    if (!singleCityId) return;
    if (!confirm("Delete all feed stories for this city? This cannot be undone.")) return;
    setBulkDeleting(true);
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStoriesByCity(singleCityId, token);
      queryClient.invalidateQueries({ queryKey: feedKeys.lists() });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete stories");
    } finally { setBulkDeleting(false); }
  };

  const handleDeleteAllForDistrict = async () => {
    if (!singleCityId || selectedDistrict == null) return;
    if (!confirm("Delete all feed stories for this district?")) return;
    setBulkDeleting(true);
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStoriesByCity(singleCityId, token, selectedDistrict);
      queryClient.invalidateQueries({ queryKey: feedKeys.lists() });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete stories");
    } finally { setBulkDeleting(false); }
  };

  // ── Pull-to-refresh ──
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const pulling = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.4, 80));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (pullDistance > 60 && !refreshing) {
      setRefreshing(true);
      refetch().finally(() => {
        setRefreshing(false);
        setPullDistance(0);
      });
    } else {
      setPullDistance(0);
    }
    pulling.current = false;
  }, [pullDistance, refreshing, refetch]);

  // ── Render ──

  const hasFilters = selectedCityIds.size > 0 || selectedTopic || selectedDistrict != null;

  return (
    <div
      ref={containerRef}
      className={styles.feedContainer}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className={`${styles.feedHeader} dashboard-page-header`}>
        <h1 className={styles.feedTitle}>Feed</h1>
      </div>

      {/* Admin bar */}
      {isAdmin && (
        <div className={styles.adminBar}>
          <div className={styles.adminBarActions}>
            <button
              type="button"
              className={styles.adminDeleteBtn}
              onClick={handleDeleteAllForCity}
              disabled={bulkDeleting || !singleCityId}
            >
              {bulkDeleting ? "Deleting\u2026" : "Delete all for city"}
            </button>
            {singleCityId && selectedDistrict != null && (
              <button
                type="button"
                className={styles.adminDeleteBtn}
                onClick={handleDeleteAllForDistrict}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? "Deleting\u2026" : "Delete all for district"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* City chips + filters */}
      <div className={styles.compactFilterBar}>
        {/* City chip row — horizontally scrollable, multi-select */}
        {uniqueCities.length > 1 && (
          <div className={styles.cityChipRow}>
            {uniqueCities.map((c) => (
              <button
                key={c.city_id}
                type="button"
                className={`${styles.cityChip} ${selectedCityIds.has(c.city_id) ? styles.cityChipActive : ""}`}
                onClick={() => toggleCity(c.city_id)}
              >
                {c.city_emoji} {c.city_name}
              </button>
            ))}
          </div>
        )}

        {/* District filter — only when exactly 1 city is selected */}
        {singleCityId && (
          <select
            id="feedv2-district"
            value={selectedDistrict != null ? String(selectedDistrict) : ""}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedDistrict(v === "" ? null : parseInt(v, 10));
            }}
            className={styles.compactSelect}
          >
            <option value="">All districts</option>
            <option value="0">City-wide</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((d) => (
              <option key={d} value={d}>District {d}</option>
            ))}
          </select>
        )}

        {/* Topic filter */}
        <select
          id="feedv2-topic"
          value={selectedTopic ?? ""}
          onChange={(e) => setSelectedTopic(e.target.value || null)}
          className={styles.compactSelect}
        >
          <option value="">All topics</option>
          <option value="safety">Safety</option>
          <option value="justice">Justice</option>
          <option value="business">Business</option>
          <option value="spending">Spending</option>
          <option value="alert">Alerts</option>
          <option value="trend">Trends</option>
          <option value="context">Context</option>
          <option value="off_the_charts">Off the Charts</option>
          <option value="my_block">My Block</option>
          <option value="311_images">311 Photos</option>
        </select>

        {hasFilters && (
          <button
            type="button"
            className={styles.compactClear}
            onClick={() => {
              setSelectedCityIds(new Set());
              setSelectedDistrict(null);
              setSelectedTopic(null);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div className={styles.pullIndicator} style={{ height: refreshing ? 40 : pullDistance }}>
          <div className={styles.pullSpinner} />
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className={styles.storiesList}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={styles.errorState}>
          <p>Error loading feed stories. Please try again later.</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && stories.length === 0 && (
        <div className={styles.emptyState}>
          <p>
            {personalNewsletterOnly
              ? "No personal newsletter samples yet. Generate one from Settings \u2192 Personalized newsletter."
              : "No feed stories found. Check back later for new newsletters!"}
          </p>
        </div>
      )}

      {/* Stories */}
      {!isLoading && visibleStories.length > 0 && (
        <div className={styles.storiesList}>
          {visibleStories.map((story) => (
            <FeedCard
              key={story.id}
              story={story}
              isAdmin={isAdmin}
              onHide={handleHide}
              onDelete={isAdmin ? handleDelete : undefined}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {!isLoading && !atEnd && stories.length > 0 && (
        <div className={styles.loadMoreWrap}>
          <button
            type="button"
            className={styles.loadMoreBtn}
            onClick={() => setDisplayLimit((l) => l + 10)}
          >
            Load more
          </button>
        </div>
      )}

      {/* End state */}
      {!isLoading && atEnd && stories.length > 0 && (
        <FeedEndState lastUpdated={new Date()} />
      )}
    </div>
  );
}
