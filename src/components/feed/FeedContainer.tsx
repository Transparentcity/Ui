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

  // ── Filters (restored from sessionStorage when navigating back) ──
  const FILTER_STORAGE_KEY = "feed-filters";

  function loadSavedFilters(): {
    cityIds: Set<number>;
    district: number | null;
    frequency: string | null;
    personalOnly: boolean;
    topic: string | null;
    displayLimit: number;
  } | null {
    try {
      const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        cityIds: new Set(parsed.cityIds ?? []),
        district: parsed.district ?? null,
        frequency: parsed.frequency ?? null,
        personalOnly: parsed.personalOnly ?? false,
        topic: parsed.topic ?? null,
        displayLimit: parsed.displayLimit ?? 10,
      };
    } catch {
      return null;
    }
  }

  const saved = useRef(loadSavedFilters());

  const [selectedCityIds, setSelectedCityIds] = useState<Set<number>>(() =>
    saved.current?.cityIds ?? (cityId != null ? new Set([cityId]) : new Set()),
  );
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(
    saved.current?.district ?? district ?? null,
  );
  const [selectedFrequency, setSelectedFrequency] = useState<string | null>(
    saved.current?.frequency ?? null,
  );
  const [personalNewsletterOnly, setPersonalNewsletterOnly] = useState(
    saved.current?.personalOnly ?? false,
  );
  const [selectedTopic, setSelectedTopic] = useState<string | null>(
    saved.current?.topic ?? null,
  );
  const [displayLimit, setDisplayLimit] = useState(saved.current?.displayLimit ?? 10);
  const [feedOrder, setFeedOrder] = useState<"for_you" | "published_at">("for_you");

  // Persist filters to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          cityIds: [...selectedCityIds],
          district: selectedDistrict,
          frequency: selectedFrequency,
          personalOnly: personalNewsletterOnly,
          topic: selectedTopic,
          displayLimit,
        }),
      );
    } catch {
      // sessionStorage unavailable — ignore
    }
  }, [selectedCityIds, selectedDistrict, selectedFrequency, personalNewsletterOnly, selectedTopic, displayLimit]);

  // Save scroll position on every scroll so we can restore it after back-navigation
  const SCROLL_STORAGE_KEY = "feed-scroll-y";

  useEffect(() => {
    const handleScroll = () => {
      try { sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY)); } catch {}
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
  useEffect(() => { setDisplayLimit(10); }, [selectedCityIds, selectedDistrict, selectedFrequency, personalNewsletterOnly, selectedTopic, feedOrder]);

  // Reset district when city selection changes away from a single city
  useEffect(() => {
    if (selectedCityIds.size !== 1) setSelectedDistrict(null);
  }, [selectedCityIds]);

  // Determine API params: single-city → server-side filter, multi/all → fetch all + client filter
  const singleCityId = selectedCityIds.size === 1 ? [...selectedCityIds][0] : undefined;

  const { data: feedData, isLoading, isFetching, isPlaceholderData, error, refetch } = useFeedStories({
    city_id: personalNewsletterOnly ? undefined : singleCityId,
    district: personalNewsletterOnly ? undefined : (singleCityId ? (selectedDistrict ?? undefined) : undefined),
    newsletter_frequency: selectedFrequency ?? undefined,
    category: personalNewsletterOnly ? "personal_newsletter" : undefined,
    limit: displayLimit,
    order_by: feedOrder,
    all_cities: personalNewsletterOnly || !singleCityId,
  });

  const stories = feedData?.stories ?? [];
  const enriched = useMemo(() => enrichStories(stories), [stories]);

  // ── Hidden stories (persisted to localStorage with 7-day TTL) ──
  const HIDDEN_STORAGE_KEY = "feed-hidden-stories";

  function loadHiddenIds(): Set<number> {
    try {
      const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.ids)) return new Set();
      // Expire after 7 days
      if (parsed.ts && Date.now() - parsed.ts > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(HIDDEN_STORAGE_KEY);
        return new Set();
      }
      return new Set(parsed.ids);
    } catch {
      return new Set();
    }
  }

  function saveHiddenIds(ids: Set<number>) {
    try {
      localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify({ ids: [...ids], ts: Date.now() }));
    } catch {}
  }

  const [hiddenIds, setHiddenIds] = useState<Set<number>>(() => loadHiddenIds());

  const handleHide = useCallback((storyId: number) => {
    if (storyId < 0) {
      // Undo: remove from hidden set
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(-storyId);
        saveHiddenIds(next);
        return next;
      });
    } else {
      setHiddenIds((prev) => {
        const next = new Set(prev).add(storyId);
        saveHiddenIds(next);
        return next;
      });
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
      if (selectedTopic) {
        // "my_block" is a metadata flag, not a card_type. Stories keep their
        // real type (trend, alert, etc.) but are tagged with metadata.my_block
        // when they belong to the user's neighborhood.
        if (selectedTopic === "my_block") {
          if (!s.metadata?.my_block) return false;
        } else if (s.card_type !== selectedTopic) {
          return false;
        }
      }
      // Single-city client-side filter (server handles it too, but belt-and-suspenders)
      if (selectedCityIds.size === 1 && !selectedCityIds.has(s.city_id)) return false;
      return true;
    }),
    [enriched, hiddenIds, selectedTopic, selectedCityIds],
  );

  // Restore scroll position once stories have loaded (only on initial mount)
  const scrollRestored = useRef(false);
  useEffect(() => {
    if (scrollRestored.current || visibleStories.length === 0) return;
    scrollRestored.current = true;
    try {
      const savedY = sessionStorage.getItem(SCROLL_STORAGE_KEY);
      if (savedY) {
        // Use requestAnimationFrame to wait for DOM to paint
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(savedY, 10));
        });
      }
    } catch {}
  }, [visibleStories.length]);

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

  // ── City chip toggle (single-select: clicking a city selects only that one) ──
  const selectCity = useCallback((cid: number) => {
    setSelectedCityIds((prev) => {
      // If already the only selected city, deselect back to "All Cities"
      if (prev.size === 1 && prev.has(cid)) return new Set();
      return new Set([cid]);
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

  const hasSecondaryFilters = selectedTopic != null || selectedDistrict != null;

  // ── Dynamic header ──
  const selectedCityName = useMemo(() => {
    if (selectedCityIds.size !== 1) return null;
    const cid = [...selectedCityIds][0];
    const city = uniqueCities.find((c) => c.city_id === cid);
    return city?.city_name ?? null;
  }, [selectedCityIds, uniqueCities]);

  const feedTitle = selectedCityName ?? "Your Cities";

  return (
    <div
      ref={containerRef}
      className={styles.feedContainer}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className={`${styles.feedHeader} dashboard-page-header`}>
        <h1 className={styles.feedTitle}>{feedTitle}</h1>
      </div>

      {/* City chips row */}
      <div className={styles.cityChipRow}>
        <button
          type="button"
          className={`${styles.cityChip} ${selectedCityIds.size === 0 ? styles.cityChipActive : ""}`}
          onClick={() => setSelectedCityIds(new Set())}
        >
          All Cities{visibleStories.length > 0 && selectedCityIds.size === 0 ? ` (${visibleStories.length})` : ""}
        </button>
        {uniqueCities.map((c) => (
          <button
            key={c.city_id}
            type="button"
            className={`${styles.cityChip} ${selectedCityIds.has(c.city_id) ? styles.cityChipActive : ""}`}
            onClick={() => selectCity(c.city_id)}
          >
            {c.city_emoji} {c.city_name}
          </button>
        ))}
      </div>

      {/* Secondary filters row */}
      <div className={styles.secondaryFilterRow}>
        {/* For You / Latest toggle */}
        <div className={styles.feedOrderToggle}>
          <button
            type="button"
            className={`${styles.feedOrderBtn} ${feedOrder === "for_you" ? styles.feedOrderBtnActive : ""}`}
            onClick={() => setFeedOrder("for_you")}
          >
            For You
          </button>
          <button
            type="button"
            className={`${styles.feedOrderBtn} ${feedOrder === "published_at" ? styles.feedOrderBtnActive : ""}`}
            onClick={() => setFeedOrder("published_at")}
          >
            Latest
          </button>
        </div>

        {/* District filter: only when exactly 1 city is selected */}
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
            <option value="">All (city + districts)</option>
            <option value="0">City-wide only</option>
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
          <option value="safety">Public Safety</option>
          <option value="justice">Justice</option>
          <option value="business">Business {"&"} Economy</option>
          <option value="spending">City Spending</option>
          <option value="alert">Alerts</option>
          <option value="trend">Trends</option>
          <option value="context">Context {"&"} Background</option>
          <option value="off_the_charts">Off the Charts</option>
          <option value="my_block">My Neighborhood</option>
          <option value="311_images">311 Photos</option>
        </select>

        {hasSecondaryFilters && (
          <button
            type="button"
            className={styles.compactClear}
            onClick={() => {
              setSelectedDistrict(null);
              setSelectedTopic(null);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div className={styles.pullIndicator} style={{ height: refreshing ? 40 : pullDistance }}>
          <div className={styles.pullSpinner} />
        </div>
      )}

      {/* Loading skeleton: only on true initial load (no data at all yet) */}
      {isLoading && visibleStories.length === 0 && (
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
              : hasSecondaryFilters || selectedCityIds.size > 0
                ? (() => {
                    const parts: string[] = [];
                    if (selectedTopic) {
                      const topicLabels: Record<string, string> = {
                        safety: "Public Safety", justice: "Justice",
                        business: "Business & Economy", spending: "City Spending",
                        alert: "Alerts", trend: "Trends",
                        context: "Context & Background", off_the_charts: "Off the Charts",
                        my_block: "My Neighborhood", "311_images": "311 Photos",
                      };
                      parts.push(topicLabels[selectedTopic] ?? selectedTopic);
                    }
                    if (selectedCityName) parts.push(selectedCityName);
                    if (selectedDistrict != null) {
                      parts.push(selectedDistrict === 0 ? "city-wide" : `District ${selectedDistrict}`);
                    }
                    return parts.length > 0
                      ? `No ${parts[0] ?? ""} stories found${parts.length > 1 ? ` in ${parts.slice(1).join(", ")}` : ""}. Try adjusting your filters.`
                      : "No stories match your current filters.";
                  })()
                : "No feed stories found. Check back later for new newsletters!"}
          </p>
          {(hasSecondaryFilters || selectedCityIds.size > 0) && !personalNewsletterOnly && (
            <button
              type="button"
              className={styles.compactClear}
              style={{ marginTop: 8 }}
              onClick={() => {
                setSelectedCityIds(new Set());
                setSelectedDistrict(null);
                setSelectedTopic(null);
              }}
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Stories */}
      {visibleStories.length > 0 && (
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
      {!atEnd && stories.length > 0 && (
        <div className={styles.loadMoreWrap}>
          <button
            type="button"
            className={styles.loadMoreBtn}
            disabled={isFetching}
            onClick={() => setDisplayLimit((l) => l + 10)}
          >
            {isFetching && isPlaceholderData ? "Loading..." : "Load more"}
          </button>
        </div>
      )}

      {/* End state */}
      {!isFetching && atEnd && stories.length > 0 && (
        <FeedEndState lastUpdated={new Date()} />
      )}
    </div>
  );
}
