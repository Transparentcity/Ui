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
import { fetchNarratives } from "@/lib/feed/fetchReportNarratives";
import FeedCard from "./FeedCard";
import SkeletonCard from "./SkeletonCard";
import FeedEndState from "./FeedEndState";
import BrandedLoader from "@/components/BrandedLoader";
import EditHomeLocationModal from "@/components/EditHomeLocationModal";
import styles from "./feed.module.css";

/** Templates considered "visual" for the first-impression rule. */
const VISUAL_TEMPLATES = new Set([
  "text_chart", "text_photo", "multi_metric",
  "alert", "spending", "off_the_charts", "311_images",
]);

interface UserPlace {
  id: number;
  city_id: number;
  label: string;
}

interface FeedContainerProps {
  cityId?: number | null;
  district?: number | null;
  isAdmin?: boolean;
  isOfficial?: boolean;
  cityLeadCityIds?: number[];
  userPlaces?: UserPlace[];
  onPlaceSaved?: () => void;
}

export default function FeedContainer({
  cityId,
  district,
  isAdmin = false,
  isOfficial = false,
  userPlaces = [],
  onPlaceSaved,
}: FeedContainerProps) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  const trackEngagement = useTrackFeedEngagement();
  const viewedRef = useRef<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);
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
  const [feedOrder, setFeedOrder] = useState<"for_you" | "published_at">(() => {
    try {
      const saved = sessionStorage.getItem("feed-order");
      return saved === "published_at" ? "published_at" : "for_you";
    } catch { return "for_you"; }
  });
  const [showDistricts, setShowDistricts] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const hasAddress = userPlaces.length > 0;

  // Detect first session (user just completed onboarding) for tooltip display
  const [isFirstSession] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem("tc_feed_tooltips_seen") === null;
    } catch {
      return false;
    }
  });

  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

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

  // Determine API params: single-city → server-side filter, multi/all → fetch all + client filter
  const singleCityId = selectedCityIds.size === 1 ? [...selectedCityIds][0] : undefined;

  // Derive district numbers and term for the selected city from places data
  const { cityDistricts, districtTerm, districtPrefix } = useMemo(() => {
    if (!singleCityId) return { cityDistricts: [] as number[], districtTerm: "District", districtPrefix: "D" };
    const cityPlaces = places.filter((p) => p.city_id === singleCityId && p.district > 0);
    const districts = [...new Set(cityPlaces.map((p) => p.district))].sort((a, b) => a - b);
    const term = cityPlaces[0]?.district_term ?? "District";
    const prefix = term.toLowerCase() === "ward" ? "W" : "D";
    return { cityDistricts: districts, districtTerm: term, districtPrefix: prefix };
  }, [singleCityId, places]);

  // Persist feed order to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem("feed-order", feedOrder); } catch {}
  }, [feedOrder]);

  // Reset display limit when filters change
  useEffect(() => { setDisplayLimit(10); }, [selectedCityIds, selectedDistrict, selectedFrequency, personalNewsletterOnly, selectedTopic]);

  // Reset district when city selection changes away from a single city
  useEffect(() => {
    if (selectedCityIds.size !== 1) setSelectedDistrict(null);
  }, [selectedCityIds]);

  // Pass story_type to the API for server-side filtering (skip for my_block which is metadata-based)
  const apiStoryType = selectedTopic && selectedTopic !== "my_block" ? selectedTopic : undefined;

  const { data: feedData, isLoading, isFetching, isPlaceholderData, error, refetch } = useFeedStories({
    city_id: personalNewsletterOnly ? undefined : singleCityId,
    district: personalNewsletterOnly ? undefined : (singleCityId ? (selectedDistrict ?? undefined) : undefined),
    newsletter_frequency: selectedFrequency ?? undefined,
    category: personalNewsletterOnly ? "personal_newsletter" : undefined,
    limit: displayLimit,
    order_by: feedOrder,
    all_cities: personalNewsletterOnly || !singleCityId,
    story_type: apiStoryType,
  });

  const stories = feedData?.stories ?? [];
  const enriched = useMemo(() => enrichStories(stories), [stories]);

  // Fetch narrative text from research reports for stories with thin descriptions
  const [narratives, setNarratives] = useState<Map<number, string>>(new Map());
  const prevStoriesRef = useRef<typeof stories>(undefined);

  useEffect(() => {
    if (stories.length === 0 || stories === prevStoriesRef.current) return;
    prevStoriesRef.current = stories;
    let stale = false;

    fetchNarratives(stories)
      .then((narrs) => {
        if (!stale && narrs.size > 0) setNarratives(narrs);
      })
      .catch(() => {
        // Non-critical — stories keep their existing descriptions
      });

    return () => { stale = true; };
  }, [stories]);

  // Merge fetched narratives into enriched stories
  const enrichedWithNarratives = useMemo(() => {
    if (narratives.size === 0) return enriched;
    return enriched.map((s) => {
      const narrative = narratives.get(s.id);
      if (narrative && !s.cleaned_description) {
        return { ...s, cleaned_description: narrative };
      }
      return s;
    });
  }, [enriched, narratives]);

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

  const visibleStories = useMemo(() => {
    const filtered = enrichedWithNarratives.filter((s) => {
      if (hiddenIds.has(s.id)) return false;
      if (selectedTopic) {
        if (selectedTopic === "my_block") {
          if (!s.metadata?.my_block) return false;
        } else if (s.card_type !== selectedTopic) {
          return false;
        }
      }
      if (selectedCityIds.size === 1 && !selectedCityIds.has(s.city_id)) return false;
      return true;
    });

    // First-impression rule: ensure at least one visual card in the top 3
    // so new users see something engaging right away.
    if (filtered.length > 3) {
      const hasVisualInTop3 = filtered
        .slice(0, 3)
        .some((s) => VISUAL_TEMPLATES.has(s.template));
      if (!hasVisualInTop3) {
        const visualIdx = filtered.findIndex(
          (s, i) => i >= 3 && VISUAL_TEMPLATES.has(s.template),
        );
        if (visualIdx !== -1) {
          const reordered = [...filtered];
          const [visual] = reordered.splice(visualIdx, 1);
          reordered.splice(2, 0, visual); // insert at position 3 (index 2)
          return reordered;
        }
      }
    }

    return filtered;
  }, [enrichedWithNarratives, hiddenIds, selectedTopic, selectedCityIds]);

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

  // ── Infinite scroll: load more when sentinel enters viewport ──
  useEffect(() => {
    if (atEnd || isLoading || isFetching) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !atEnd && !isFetching) {
          setDisplayLimit((l) => l + 10);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [atEnd, isLoading, isFetching]);

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
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => refetch()}
          aria-label="Refresh feed"
          title="Refresh feed"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>

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

      {/* City chips row */}
      <div className={styles.cityChipRow}>
        <button
          type="button"
          aria-pressed={selectedCityIds.size === 0}
          className={`${styles.cityChip} ${selectedCityIds.size === 0 ? styles.cityChipActive : ""}`}
          onClick={() => setSelectedCityIds(new Set())}
        >
          All Cities{visibleStories.length > 0 && selectedCityIds.size === 0 ? ` (${visibleStories.length})` : ""}
        </button>
        {uniqueCities.map((c) => (
          <button
            key={c.city_id}
            type="button"
            aria-pressed={selectedCityIds.has(c.city_id)}
            className={`${styles.cityChip} ${selectedCityIds.has(c.city_id) ? styles.cityChipActive : ""}`}
            onClick={() => selectCity(c.city_id)}
          >
            {c.city_emoji} {c.city_name}
          </button>
        ))}
      </div>

      {/* Topic filter chips */}
      <div className={styles.secondaryFilterRow}>
        <div className={styles.filterChipScroll}>
          {[
            { value: "", label: "All topics" },
            { value: "my_block", label: "My Block" },
            { value: "safety", label: "Safety" },
            { value: "justice", label: "Justice" },
            { value: "business", label: "Business" },
            { value: "spending", label: "Spending" },
            { value: "alert", label: "Alerts" },
            { value: "trend", label: "Trends" },
            { value: "context", label: "Context" },
            { value: "off_the_charts", label: "Off the Charts" },
            { value: "comparison", label: "Your District" },
            { value: "milestone", label: "Milestones" },
            { value: "311_images", label: "311 Photos" },
          ].flatMap((t) => {
            const chip = (
              <button
                key={t.value}
                type="button"
                className={`${styles.filterChip} ${(selectedTopic ?? "") === t.value ? styles.filterChipActive : ""}`}
                onClick={() => {
                  if (t.value === "my_block" && !hasAddress) {
                    setShowLocationModal(true);
                    return;
                  }
                  setSelectedTopic(t.value || null);
                }}
              >
                {t.label}
              </button>
            );

            // Insert district toggle button right after "My Block"
            if (t.value === "my_block" && singleCityId && cityDistricts.length > 0) {
              return [
                chip,
                <button
                  key="district-toggle"
                  type="button"
                  className={`${styles.filterChip} ${showDistricts || selectedDistrict !== null ? styles.filterChipActive : ""}`}
                  onClick={() => setShowDistricts((v) => !v)}
                  aria-expanded={showDistricts}
                >
                  {selectedDistrict !== null
                    ? `${districtPrefix}${selectedDistrict}`
                    : `${districtTerm}s`}
                  <span className={styles.filterChipCaret} aria-hidden="true">
                    {showDistricts ? "▲" : "▼"}
                  </span>
                </button>,
              ];
            }

            return [chip];
          })}
        </div>

        {hasSecondaryFilters && (
          <button
            type="button"
            className={styles.compactClear}
            onClick={() => {
              setSelectedDistrict(null);
              setSelectedTopic(null);
              setShowDistricts(false);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Expandable district chips */}
      {singleCityId && cityDistricts.length > 0 && showDistricts && (
        <div className={styles.districtDrawer}>
          <div className={styles.filterChipScroll}>
            <button
              type="button"
              className={`${styles.filterChip} ${selectedDistrict === null ? styles.filterChipActive : ""}`}
              onClick={() => { setSelectedDistrict(null); setShowDistricts(false); }}
            >
              All {districtTerm}s
            </button>
            {cityDistricts.map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.filterChip} ${selectedDistrict === d ? styles.filterChipActive : ""}`}
                onClick={() => { setSelectedDistrict(d); setShowDistricts(false); }}
              >
                {districtPrefix}{d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div className={styles.pullIndicator} style={{ height: refreshing ? 40 : pullDistance }}>
          <BrandedLoader size="sm" color="brand" />
        </div>
      )}

      {/* Loading: branded loader + skeleton cards on initial load */}
      {isLoading && visibleStories.length === 0 && (
        <>
          <div className={styles.brandedLoaderWrap}>
            <BrandedLoader size="lg" label="Loading your feed..." />
          </div>
          <div className={styles.storiesList}>
            <SkeletonCard variant="default" />
            <SkeletonCard variant="alert" />
            <SkeletonCard variant="photo" />
            <SkeletonCard variant="metric" />
            <SkeletonCard variant="spending" />
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div className={styles.errorState}>
          <p>Error loading feed stories.</p>
          <button
            type="button"
            className={styles.retryBtn}
            onClick={() => refetch()}
          >
            Retry
          </button>
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
                        comparison: "Your District", milestone: "Milestones",
                        my_block: "My Neighborhood", "311_images": "311 Photos",
                      };
                      parts.push(topicLabels[selectedTopic] ?? selectedTopic);
                    }
                    if (selectedCityName) parts.push(selectedCityName);
                    if (selectedDistrict != null) {
                      parts.push(selectedDistrict === 0 ? "city-wide" : `${districtTerm} ${selectedDistrict}`);
                    }
                    return parts.length > 0
                      ? `No ${parts[0] ?? ""} stories found${parts.length > 1 ? ` in ${parts.slice(1).join(", ")}` : ""}. Try adjusting your filters.`
                      : "No stories match your current filters.";
                  })()
                : "No feed stories yet. New stories appear as city data updates. Check back soon!"}
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

      {/* Post-onboarding welcome banner */}
      {isFirstSession && !welcomeDismissed && visibleStories.length > 0 && selectedCityName && (
        <div className={styles.welcomeBanner}>
          <div className={styles.welcomeBannerContent}>
            <p className={styles.welcomeBannerTitle}>Welcome to your feed</p>
            <p className={styles.welcomeBannerText}>
              Here are the latest stories for {selectedCityName}{selectedDistrict ? `, ${districtTerm} ${selectedDistrict}` : ""}. As you applaud and flag stories, your feed will learn what matters to you.
            </p>
          </div>
          <button
            type="button"
            className={styles.welcomeBannerClose}
            onClick={() => setWelcomeDismissed(true)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* My Block empty state (client-side filter returned nothing) */}
      {!isLoading && !error && visibleStories.length === 0 && stories.length > 0 && selectedTopic === "my_block" && (
        <div className={styles.emptyState}>
          {hasAddress ? (
            <>
              <p className={styles.myBlockEmptyTitle}>No My Block stories yet</p>
              <p className={styles.myBlockEmptyText}>
                We're working on generating stories for your neighborhood. Check back soon.
              </p>
            </>
          ) : (
            <>
              <p className={styles.myBlockEmptyTitle}>Set your location to see neighborhood stories</p>
              <p className={styles.myBlockEmptyText}>
                My Block shows stories about what's happening near you. Add your address to get started.
              </p>
              <button
                type="button"
                className={styles.myBlockEmptyCta}
                onClick={() => setShowLocationModal(true)}
              >
                Add your address
              </button>
            </>
          )}
        </div>
      )}

      {/* Generic client-side filter empty state (non-My Block topics) */}
      {!isLoading && !error && visibleStories.length === 0 && stories.length > 0 && selectedTopic !== "my_block" && selectedTopic !== null && (
        <div className={styles.emptyState}>
          <p>No stories match this filter right now. Try a different topic or clear filters.</p>
          <button
            type="button"
            className={styles.compactClear}
            style={{ marginTop: 8 }}
            onClick={() => setSelectedTopic(null)}
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Stories */}
      {visibleStories.length > 0 && (
        <div className={styles.storiesList}>
          {visibleStories.map((story, storyIdx) => {
            // Text-only context/trend cards render in compact mode,
            // UNLESS they contain meaningful data (percentage in headline,
            // metric metadata, or key insight) that deserves full card treatment.
            const headlineHasPct = /\d+(\.\d+)?%/.test(story.headline ?? "");
            const headlineHasKeyword = /\b(jumped|surged|dropped|doubled|tripled|plunged|spiked|soared|plummeted|low|high|record)\b/i.test(story.headline ?? "");
            const hasMetricData = !!(
              story.metadata?.pct_change ||
              story.metadata?.current_period_value ||
              story.metadata?.trend_pct_change
            );
            const hasDescription = !!(story.cleaned_description && story.cleaned_description.length > 30);
            const isCompact =
              story.template === "text_only" &&
              (story.card_type === "context" || story.card_type === "trend") &&
              !story.metadata?.key_insight && // context with callout stays full
              !story.metadata?.trend_metric_name && // trend with metric strip stays full
              !headlineHasPct && // stories with percentages stay full
              !headlineHasKeyword && // stories with notable change keywords stay full
              !hasMetricData && // stories with numeric metadata stay full
              !hasDescription; // stories with real descriptions stay full
            return (
              <FeedCard
                key={story.id}
                story={story}
                isAdmin={isAdmin}
                isOfficial={isOfficial}
                onHide={handleHide}
                onDelete={isAdmin ? handleDelete : undefined}
                compact={isCompact}
                showTooltips={storyIdx === 0}
              />
            );
          })}
        </div>
      )}

      {/* Infinite scroll sentinel + fallback button */}
      {!atEnd && stories.length > 0 && (
        <>
          <div ref={sentinelRef} className={styles.loadMoreWrap}>
            {isFetching && isPlaceholderData && (
              <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                <BrandedLoader size="sm" />
              </div>
            )}
          </div>
        </>
      )}

      {/* End state */}
      {!isFetching && atEnd && stories.length > 0 && (
        <FeedEndState lastUpdated={new Date()} />
      )}


      {/* Location modal for My Block when no address is saved */}
      <EditHomeLocationModal
        open={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onSaved={() => {
          setShowLocationModal(false);
          setSelectedTopic("my_block");
          onPlaceSaved?.();
        }}
      />
    </div>
  );
}
