"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useFeedStories,
  useFeedPlaces,
  useTrackFeedEngagement,
  feedKeys,
  type FeedStory,
} from "@/lib/hooks/useFeed";
import { useAuth0 } from "@auth0/auth0-react";
import {
  deleteFeedStory,
  deleteFeedStoriesByCity,
} from "@/lib/apiClient";
import { useSavedCities, useSaveCity, useUnsaveCity } from "@/lib/hooks/useCities";
import { enrichStories, type EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { fetchNarratives } from "@/lib/feed/fetchReportNarratives";
import { getPublicCityDetail } from "@/lib/publicApiClient";
import { MetricKeyProvider } from "./MetricKeyContext";
import FeedCard from "./FeedCard";
import FeedStoryModal from "./FeedStoryModal";
import SkeletonCard from "./SkeletonCard";
import FeedEndState from "./FeedEndState";
import BrandedLoader from "@/components/BrandedLoader";
import EditHomeLocationModal from "@/components/EditHomeLocationModal";
import OnboardingBanner from "./OnboardingBanner";
import { usePlaceOnboarding } from "@/contexts/PlaceOnboardingContext";
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
  cityLeadCityIds?: number[];
  userPlaces?: UserPlace[];
  onPlaceSaved?: () => void;
  homeCityId?: number | null;
}

export default function FeedContainer({
  cityId,
  district,
  isAdmin = false,
  userPlaces = [],
  onPlaceSaved,
  homeCityId,
}: FeedContainerProps) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();
  const trackEngagement = useTrackFeedEngagement();
  const onboarding = usePlaceOnboarding();
  const viewedRef = useRef<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { data: placesData } = useFeedPlaces();
  const { data: savedCities = [] } = useSavedCities();
  const savedCityIds = useMemo(() => new Set(savedCities.map((c) => c.id)), [savedCities]);
  const saveCityMutation = useSaveCity();
  const unsaveCityMutation = useUnsaveCity();

  const toggleFollowCity = useCallback(
    (cityId: number, e: React.MouseEvent) => {
      e.stopPropagation(); // don't trigger chip selection
      if (!isAuthenticated) return;
      if (savedCityIds.has(cityId)) {
        unsaveCityMutation.mutate(cityId);
      } else {
        saveCityMutation.mutate(cityId);
      }
    },
    [isAuthenticated, savedCityIds, saveCityMutation, unsaveCityMutation],
  );

  // ── Filters (restored from sessionStorage when navigating back) ──
  const FILTER_STORAGE_KEY = "feed-filters";

  function loadSavedFilters(): {
    cityIds: Set<number>;
    district: number | null;
    placeId: number | null;
    frequency: string | null;
    personalOnly: boolean;
    topic: string | null;
    displayLimit: number;
    onlyMySavedPlaces: boolean;
  } | null {
    try {
      const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        cityIds: new Set(parsed.cityIds ?? []),
        district: parsed.district ?? null,
        placeId: parsed.placeId ?? null,
        frequency: parsed.frequency ?? null,
        personalOnly: parsed.personalOnly ?? false,
        topic: parsed.topic ?? null,
        displayLimit: parsed.displayLimit ?? 10,
        onlyMySavedPlaces:
          parsed.placeId != null ? false : (parsed.onlyMySavedPlaces ?? false),
      };
    } catch {
      return null;
    }
  }

  const saved = useRef(loadSavedFilters());

  const [selectedCityIds, setSelectedCityIds] = useState<Set<number>>(() =>
    saved.current?.cityIds ??
    (cityId != null ? new Set([cityId]) :
     homeCityId != null ? new Set([homeCityId]) :
     new Set()),
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
  const [onlyMySavedPlacesFeed, setOnlyMySavedPlacesFeed] = useState(
    saved.current?.onlyMySavedPlaces ?? false,
  );
  const [feedOrder, setFeedOrder] = useState<"for_you" | "published_at">(() => {
    try {
      const saved = sessionStorage.getItem("feed-order");
      return saved === "published_at" ? "published_at" : "for_you";
    } catch { return "for_you"; }
  });
  const [showDistricts, setShowDistricts] = useState(false);
  const [showPlaces, setShowPlaces] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(
    saved.current?.placeId ?? null,
  );
  // When homeCityId arrives asynchronously, default to it if no filters were
  // previously saved and no explicit cityId prop was provided.
  const appliedHomeCityRef = useRef(false);
  useEffect(() => {
    if (
      homeCityId != null &&
      !appliedHomeCityRef.current &&
      saved.current == null &&
      cityId == null
    ) {
      appliedHomeCityRef.current = true;
      setSelectedCityIds((prev) => (prev.size === 0 ? new Set([homeCityId]) : prev));
    }
  }, [homeCityId, cityId]);

  // When savedCities load asynchronously (e.g. after onboarding), auto-select
  // them if no filters were previously saved and nothing is selected yet.
  const appliedSavedCitiesRef = useRef(false);
  useEffect(() => {
    if (
      savedCities.length > 0 &&
      !appliedSavedCitiesRef.current &&
      saved.current == null &&
      cityId == null &&
      !appliedHomeCityRef.current
    ) {
      appliedSavedCitiesRef.current = true;
      setSelectedCityIds((prev) =>
        prev.size === 0 ? new Set(savedCities.map((c) => c.id)) : prev
      );
    }
  }, [savedCities, cityId]);

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showMoreTopics, setShowMoreTopics] = useState(false);
  const [feedDetailStoryId, setFeedDetailStoryId] = useState<number | null>(null);
  const hasAddress = userPlaces.length > 0;
  const hasMyPlaces = userPlaces.length > 0 || savedCities.length > 0;

  // Persist filters to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          cityIds: [...selectedCityIds],
          district: selectedDistrict,
          placeId: selectedPlaceId,
          frequency: selectedFrequency,
          personalOnly: personalNewsletterOnly,
          topic: selectedTopic,
          displayLimit,
          onlyMySavedPlaces: onlyMySavedPlacesFeed,
        }),
      );
    } catch {
      // sessionStorage unavailable — ignore
    }
  }, [
    selectedCityIds,
    selectedDistrict,
    selectedPlaceId,
    selectedFrequency,
    personalNewsletterOnly,
    selectedTopic,
    displayLimit,
    onlyMySavedPlacesFeed,
  ]);

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

  // Detect when a selected city has no feed stories (e.g. newly-launched city)
  const selectedCityWithNoStories = useMemo(() => {
    if (selectedCityIds.size !== 1) return null;
    const id = [...selectedCityIds][0];
    // City exists in feed places → it has stories, nothing to do
    if (uniqueCities.some((c) => c.city_id === id)) return null;
    // Find city name from savedCities for display
    const saved = savedCities.find((c) => c.id === id);
    return saved
      ? { id, name: saved.display_name || saved.city_name || "your city" }
      : null;
  }, [selectedCityIds, uniqueCities, savedCities]);

  // When a city has no stories, auto-switch to All Cities so user sees content
  const [noStoriesCity, setNoStoriesCity] = useState<{ id: number; name: string } | null>(null);
  const [showCityLaunchBanner, setShowCityLaunchBanner] = useState(true);
  const autoSwitchedCityRef = useRef<number | null>(null);

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
  useEffect(() => {
    setDisplayLimit(10);
  }, [
    selectedCityIds,
    selectedDistrict,
    selectedPlaceId,
    selectedFrequency,
    personalNewsletterOnly,
    selectedTopic,
    onlyMySavedPlacesFeed,
  ]);

  // Reset district when city selection changes away from a single city
  useEffect(() => {
    if (selectedCityIds.size !== 1) setSelectedDistrict(null);
  }, [selectedCityIds]);

  // Pass story_type to the API for server-side filtering
  const apiStoryType = selectedTopic ?? undefined;

  const apiOnlyMySavedPlaces =
    isAuthenticated &&
    onlyMySavedPlacesFeed &&
    selectedPlaceId == null &&
    !personalNewsletterOnly &&
    userPlaces.length > 0;

  const {
    data: feedData,
    isLoading,
    isFetching,
    isPlaceholderData,
    error,
    refetch,
  } = useFeedStories({
    city_id: personalNewsletterOnly ? undefined : singleCityId,
    district: personalNewsletterOnly ? undefined : (singleCityId ? (selectedDistrict ?? undefined) : undefined),
    newsletter_frequency: selectedFrequency ?? undefined,
    category: personalNewsletterOnly ? "personal_newsletter" : undefined,
    limit: displayLimit,
    order_by: feedOrder,
    // When no specific city is selected ("All Cities"), fetch stories across all
    // available cities so the feed isn't empty for users who haven't followed any yet.
    all_cities: personalNewsletterOnly || !singleCityId,
    story_type: apiStoryType,
    user_place_id:
      isAuthenticated && selectedPlaceId != null ? selectedPlaceId : undefined,
    only_my_saved_places: apiOnlyMySavedPlaces,
  });

  const stories = feedData?.stories ?? [];
  const enriched = useMemo(() => enrichStories(stories), [stories]);

  // When a city has no stories, capture its name (for the banner) then auto-switch to All Cities
  useEffect(() => {
    if (selectedCityWithNoStories) {
      setNoStoriesCity(selectedCityWithNoStories);
      setShowCityLaunchBanner(true);
    }
  }, [selectedCityWithNoStories]);

  useEffect(() => {
    if (
      selectedCityWithNoStories &&
      !isLoading &&
      stories.length === 0 &&
      autoSwitchedCityRef.current !== selectedCityWithNoStories.id
    ) {
      autoSwitchedCityRef.current = selectedCityWithNoStories.id;
      setSelectedCityIds(new Set());
    }
  }, [selectedCityWithNoStories, isLoading, stories.length]);

  // Fetch narrative text from research reports for stories with thin descriptions.
  // Incremental: only fetch for stories we haven't processed yet.
  const [narratives, setNarratives] = useState<Map<number, string>>(new Map());
  const fetchedNarrativeIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (stories.length === 0) return;
    const newStories = stories.filter((s) => !fetchedNarrativeIdsRef.current.has(s.id));
    if (newStories.length === 0) return;
    for (const s of newStories) fetchedNarrativeIdsRef.current.add(s.id);

    let stale = false;
    fetchNarratives(newStories)
      .then((narrs) => {
        if (!stale && narrs.size > 0) {
          setNarratives((prev) => {
            const merged = new Map(prev);
            for (const [k, v] of narrs) merged.set(k, v);
            return merged;
          });
        }
      })
      .catch(() => {});

    return () => { stale = true; };
  }, [stories]);

  // ── Metric name → key lookup (for hotlinking metric names in cards) ──
  const [metricLookupItems, setMetricLookupItems] = useState<Array<{ metric_name: string; metric_key: string }>>([]);
  const fetchedCityIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const cityIds = new Set(stories.map((s) => s.city_id).filter(Boolean));
    const toFetch: number[] = [];
    for (const cid of cityIds) {
      if (!fetchedCityIdsRef.current.has(cid)) toFetch.push(cid);
    }
    if (toFetch.length === 0) return;

    let stale = false;
    Promise.all(
      toFetch.map((cid) =>
        getPublicCityDetail(cid)
          .then((d) => d.metrics ?? [])
          .catch(() => [] as Array<{ metric_name: string; metric_key: string }>),
      ),
    ).then((results) => {
      if (stale) return;
      for (const cid of toFetch) fetchedCityIdsRef.current.add(cid);
      const newItems = results.flat();
      if (newItems.length > 0) {
        setMetricLookupItems((prev) => [...prev, ...newItems]);
      }
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

  /** Prime detail cache from list data so the modal renders immediately; detail hook refetches in background. */
  const openFeedDetail = useCallback(
    (s: EnrichedFeedStory) => {
      queryClient.setQueryData(feedKeys.detail(s.id), {
        story: s as FeedStory,
      });
      setFeedDetailStoryId(s.id);
    },
    [queryClient],
  );

  const visibleStories = useMemo(() => {
    const filtered = enrichedWithNarratives.filter((s) => {
      // Filter out broken early prototype stories
      if (s.id <= 10) return false;
      // Temporarily hide 311 cards (not rendering correctly)
      if (s.card_type === "311_images") return false;
      if (hiddenIds.has(s.id)) return false;
      if (selectedTopic && s.card_type !== selectedTopic) return false;
      if (selectedPlaceId !== null) {
        const legacyIds: number[] = Array.isArray(s.metadata?.user_place_ids)
          ? s.metadata.user_place_ids
          : s.metadata?.my_block
            ? userPlaces.map((p) => p.id)
            : [];
        const matchesColumn = s.user_place_id === selectedPlaceId;
        const matchesLegacy = legacyIds.includes(selectedPlaceId);
        if (!matchesColumn && !matchesLegacy) return false;
      }
      if (selectedCityIds.size === 1 && !selectedCityIds.has(s.city_id)) return false;
      // When "My Places" is active (no specific city or place selected),
      // constrain to saved cities. Also allow stories that match an
      // address-level place so they aren't lost when saved cities exist.
      if (
        onlyMySavedPlacesFeed &&
        selectedPlaceId === null &&
        selectedCityIds.size === 0 &&
        savedCityIds.size > 0
      ) {
        const inSavedCity = savedCityIds.has(s.city_id);
        const matchesAddressPlace =
          userPlaces.length > 0 &&
          s.user_place_id != null &&
          userPlaces.some((p) => p.id === s.user_place_id);
        if (!inSavedCity && !matchesAddressPlace) return false;
      }
      return true;
    });

    // Deduplicate: when two stories share a very similar headline for the
    // same city/district, keep only the newer one (higher id).
    const deduped: typeof filtered = [];
    const seenKeys = new Map<string, number>(); // normalized headline → index in deduped

    for (const story of filtered) {
      // Build a dedup key: strip emoji, punctuation, extra spaces, lowercase
      const normKey = (story.headline ?? "")
        .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, "")
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const dedupKey = `${story.city_id}:${story.district ?? 0}:${normKey}`;

      if (seenKeys.has(dedupKey)) {
        // Keep whichever has the higher id (newer), replace if current is newer
        const existingIdx = seenKeys.get(dedupKey)!;
        if (story.id > deduped[existingIdx].id) {
          deduped[existingIdx] = story;
        }
        // Skip adding duplicate
      } else {
        seenKeys.set(dedupKey, deduped.length);
        deduped.push(story);
      }
    }

    // First-impression rule: ensure at least one visual card in the top 3
    // so new users see something engaging right away.
    if (deduped.length > 3) {
      const hasVisualInTop3 = deduped
        .slice(0, 3)
        .some((s) => VISUAL_TEMPLATES.has(s.template));
      if (!hasVisualInTop3) {
        const visualIdx = deduped.findIndex(
          (s, i) => i >= 3 && VISUAL_TEMPLATES.has(s.template),
        );
        if (visualIdx !== -1) {
          const reordered = [...deduped];
          const [visual] = reordered.splice(visualIdx, 1);
          reordered.splice(2, 0, visual); // insert at position 3 (index 2)
          return reordered;
        }
      }
    }

    return deduped;
  }, [
    enrichedWithNarratives,
    hiddenIds,
    selectedTopic,
    selectedCityIds,
    selectedPlaceId,
    userPlaces,
    onlyMySavedPlacesFeed,
    savedCityIds,
  ]);

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

  /** Header / retry refetch: tied to refetch() promise so the loader stops when the request finishes. */
  const explicitRefetchInFlight = useRef(0);
  const [headerRefetchBusy, setHeaderRefetchBusy] = useState(false);

  const runExplicitFeedRefetch = useCallback(() => {
    explicitRefetchInFlight.current += 1;
    setHeaderRefetchBusy(true);
    void refetch().finally(() => {
      explicitRefetchInFlight.current -= 1;
      if (explicitRefetchInFlight.current <= 0) {
        explicitRefetchInFlight.current = 0;
        setHeaderRefetchBusy(false);
      }
    });
  }, [refetch]);

  const headerRefreshSpinning = refreshing || headerRefetchBusy;

  // ── Render ──

  const hasSecondaryFilters =
    selectedTopic != null ||
    selectedDistrict != null ||
    selectedPlaceId != null ||
    onlyMySavedPlacesFeed;

  // ── Dynamic header ──
  const feedTitle = useMemo(() => {
    if (selectedCityIds.size === 0) return "Feed";
    // Build list with home city first, then alphabetical
    const selected = [...selectedCityIds]
      .map((id) => uniqueCities.find((c) => c.city_id === id))
      .filter(Boolean) as typeof uniqueCities;
    // Sort: home city (from prop) first, then alphabetical
    selected.sort((a, b) => {
      if (cityId != null) {
        if (a.city_id === cityId) return -1;
        if (b.city_id === cityId) return 1;
      }
      return a.city_name.localeCompare(b.city_name);
    });
    if (selected.length === 0) return "Feed";
    if (selected.length === 1) return selected[0].city_name;
    if (selected.length === 2) return `${selected[0].city_name}, ${selected[1].city_name}`;
    return `${selected[0].city_name}, ${selected[1].city_name} + ${selected.length - 2} More`;
  }, [selectedCityIds, uniqueCities, cityId]);

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
        <div className={styles.feedHeaderRight}>
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
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => runExplicitFeedRefetch()}
            aria-label="Refresh feed"
            aria-busy={headerRefreshSpinning}
            title="Refresh feed"
          >
            {headerRefreshSpinning ? (
              <BrandedLoader
                size="sm"
                color="brand"
                ariaHidden
                className={styles.refreshBtnIconWrap}
              />
            ) : (
              <span className={styles.refreshBtnIconWrap}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
              </span>
            )}
          </button>
        </div>
      </div>

      {/* City chips row */}
      <div className={styles.cityChipRow}>
        <button
          type="button"
          aria-pressed={selectedCityIds.size === 0}
          className={`${styles.cityChip} ${selectedCityIds.size === 0 ? styles.cityChipActive : ""}`}
          onClick={() => setSelectedCityIds(new Set())}
        >
          All Cities
        </button>
        {uniqueCities.map((c) => {
          const isFollowed = savedCityIds.has(c.city_id);
          const isSelected = selectedCityIds.has(c.city_id);
          return (
            <span key={c.city_id} className={styles.cityChipWrapper}>
              <button
                type="button"
                aria-pressed={isSelected}
                className={`${styles.cityChip} ${isSelected ? styles.cityChipActive : ""}`}
                onClick={() => selectCity(c.city_id)}
              >
                {c.city_emoji} {c.city_name}
              </button>
              {isAuthenticated && (
                <button
                  type="button"
                  className={`${styles.cityFollowBtn} ${isFollowed ? styles.cityFollowBtnActive : ""} ${isSelected ? styles.cityFollowBtnOnActive : ""}`}
                  onClick={(e) => toggleFollowCity(c.city_id, e)}
                  title={isFollowed ? `Unfollow ${c.city_name}` : `Follow ${c.city_name}`}
                  aria-label={isFollowed ? `Unfollow ${c.city_name}` : `Follow ${c.city_name}`}
                >
                  {isFollowed ? "✓" : "+"}
                </button>
              )}
            </span>
          );
        })}
        {uniqueCities.length <= 1 && (
          <a href="/settings/feed" className={`${styles.cityChip} ${styles.cityChipExplore}`}>
            + Explore cities
          </a>
        )}
      </div>

      {/* Topic filter chips */}
      <div className={styles.secondaryFilterRow}>
        <div className={styles.filterChipScroll}>
          {/* My Places toggle — shown when user has saved places or saved cities */}
          {hasMyPlaces && (
            <button
              key="my-places-toggle"
              type="button"
              className={[
                styles.filterChip,
                (showPlaces || selectedPlaceId !== null || onlyMySavedPlacesFeed) && styles.filterChipActive,
                (onboarding.status === "scanning" || onboarding.status === "found_rep") && styles.filterChipBuilding,
              ].filter(Boolean).join(" ")}
              onClick={() => {
                setShowDistricts(false);
                setShowPlaces((prev) => {
                  const opening = !prev;
                  // Enter "all my saved places" feed mode when opening the menu
                  // unless the user is already narrowed to one place.
                  if (opening && selectedPlaceId == null) {
                    setOnlyMySavedPlacesFeed(true);
                  }
                  return opening;
                });
              }}
              aria-expanded={showPlaces}
            >
              {selectedPlaceId !== null
                ? (userPlaces.find((p) => p.id === selectedPlaceId)?.label ?? "My Places")
                : "My Places"}
              <span className={styles.filterChipCaret} aria-hidden="true">
                {showPlaces ? "▲" : "▼"}
              </span>
            </button>
          )}

          {/* Districts toggle — shown when single city is selected and has districts */}
          {singleCityId && cityDistricts.length > 0 && (
            <button
              key="district-toggle"
              type="button"
              className={`${styles.filterChip} ${showDistricts || selectedDistrict !== null ? styles.filterChipActive : ""}`}
              onClick={() => {
                setShowDistricts((v) => !v);
                setShowPlaces(false);
              }}
              aria-expanded={showDistricts}
            >
              {selectedDistrict !== null
                ? `${districtPrefix}${selectedDistrict}`
                : `${districtTerm}s`}
              <span className={styles.filterChipCaret} aria-hidden="true">
                {showDistricts ? "▲" : "▼"}
              </span>
            </button>
          )}

          {/* Topic chips — primary (always visible) */}
          {[
            { value: "", label: "All topics" },
            { value: "safety", label: "Safety" },
            { value: "business", label: "Business" },
            { value: "spending", label: "Spending" },
            { value: "alert", label: "Alerts" },
            { value: "trend", label: "Trends" },
          ].map((t) => (
            <button
              key={t.value}
              type="button"
              className={`${styles.filterChip} ${(selectedTopic ?? "") === t.value ? styles.filterChipActive : ""}`}
              onClick={() => setSelectedTopic(t.value || null)}
            >
              {t.label}
            </button>
          ))}
          {/* Show active secondary topic inline if selected but overflow is collapsed */}
          {!showMoreTopics && selectedTopic && [
            { value: "justice", label: "Justice" },
            { value: "context", label: "Context" },
            { value: "off_the_charts", label: "Off the Charts" },
            { value: "comparison", label: "Your District" },
            { value: "milestone", label: "Milestones" },
            { value: "311_images", label: "311 Photos" },
          ].some((t) => t.value === selectedTopic) && (
            <button
              key={selectedTopic}
              type="button"
              className={`${styles.filterChip} ${styles.filterChipActive}`}
              onClick={() => setSelectedTopic(null)}
            >
              {
                { justice: "Justice", context: "Context", off_the_charts: "Off the Charts", comparison: "Your District", milestone: "Milestones", "311_images": "311 Photos" }[selectedTopic]
              }
            </button>
          )}
          {/* More toggle */}
          <button
            type="button"
            className={`${styles.filterChip} ${styles.moreChip}`}
            onClick={() => setShowMoreTopics((v) => !v)}
            aria-expanded={showMoreTopics}
          >
            More {showMoreTopics ? "▲" : "▼"}
          </button>
          {/* Secondary topics (shown when More is expanded) */}
          {showMoreTopics && [
            { value: "justice", label: "Justice" },
            { value: "context", label: "Context" },
            { value: "off_the_charts", label: "Off the Charts" },
            { value: "comparison", label: "Your District" },
            { value: "milestone", label: "Milestones" },
            { value: "311_images", label: "311 Photos" },
          ].map((t) => (
            <button
              key={t.value}
              type="button"
              className={`${styles.filterChip} ${(selectedTopic ?? "") === t.value ? styles.filterChipActive : ""}`}
              onClick={() => setSelectedTopic(t.value || null)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {hasSecondaryFilters && (
          <button
            type="button"
            className={styles.compactClear}
            onClick={() => {
              setSelectedDistrict(null);
              setSelectedPlaceId(null);
              setSelectedTopic(null);
              setOnlyMySavedPlacesFeed(false);
              setShowDistricts(false);
              setShowPlaces(false);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Expandable My Places chips */}
      {hasMyPlaces && showPlaces && (
        <div className={styles.districtDrawer}>
          <div className={styles.filterChipScroll}>
            <button
              type="button"
              className={`${styles.filterChip} ${selectedPlaceId === null && onlyMySavedPlacesFeed ? styles.filterChipActive : ""}`}
              onClick={() => {
                setSelectedPlaceId(null);
                setSelectedCityIds(new Set());
                setOnlyMySavedPlacesFeed(true);
                setShowPlaces(false);
              }}
            >
              All My Places
            </button>
            {savedCities.map((c) => (
              <button
                key={`city-${c.id}`}
                type="button"
                className={`${styles.filterChip} ${selectedCityIds.size === 1 && selectedCityIds.has(c.id) && onlyMySavedPlacesFeed ? styles.filterChipActive : ""}`}
                onClick={() => {
                  setSelectedCityIds(new Set([c.id]));
                  setSelectedPlaceId(null);
                  setOnlyMySavedPlacesFeed(true);
                  setShowPlaces(false);
                }}
              >
                {c.emoji} {c.display_name}
              </button>
            ))}
            {userPlaces.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`${styles.filterChip} ${selectedPlaceId === p.id ? styles.filterChipActive : ""}`}
                onClick={() => {
                  setSelectedPlaceId(p.id);
                  setOnlyMySavedPlacesFeed(false);
                  setShowPlaces(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

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

      {/* "Help us launch your city" banner for cities with no stories */}
      {noStoriesCity && showCityLaunchBanner && (
        <div className={styles.cityLaunchBanner}>
          <p className={styles.cityLaunchText}>
            We&apos;re building {noStoriesCity.name}. Want to help us launch it?{" "}
            <a href="/pro" className={styles.cityLaunchLink}>Learn more</a>
          </p>
          <button
            type="button"
            className={styles.cityLaunchDismiss}
            onClick={() => setShowCityLaunchBanner(false)}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Onboarding progress banner (shows while neighborhood data is building).
          Hidden during initial feed load to avoid two loaders at once. */}
      {!(isLoading && visibleStories.length === 0) && <OnboardingBanner />}

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
            onClick={() => runExplicitFeedRefetch()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && stories.length === 0 && (
        (onboarding.status === "scanning" || onboarding.status === "found_rep") ? (
          /* Onboarding job still running: show skeleton cards, banner handles messaging */
          <div className={styles.storiesList}>
            <SkeletonCard variant="default" />
            <SkeletonCard variant="alert" />
            <SkeletonCard variant="photo" />
          </div>
        ) : (
        <div className={styles.emptyState}>
          <p>
            {personalNewsletterOnly
              ? "No newsletter stories yet. Check back soon as new data comes in."
              : onlyMySavedPlacesFeed
                ? "No stories yet for your saved places. New stories appear as city data updates."
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
                        "311_images": "311 Photos",
                      };
                      parts.push(topicLabels[selectedTopic] ?? selectedTopic);
                    }
                    if (selectedCityIds.size > 0) parts.push(feedTitle);
                    if (selectedDistrict != null) {
                      parts.push(selectedDistrict === 0 ? "city-wide" : `${districtTerm} ${selectedDistrict}`);
                    }
                    return parts.length > 0
                      ? `No ${parts[0] ?? ""} stories found${parts.length > 1 ? ` in ${parts.slice(1).join(", ")}` : ""}. Try adjusting your filters.`
                      : "No stories match your current filters.";
                  })()
                : isAdmin
                  ? "No feed stories yet. New stories appear as city data updates. Check back soon!"
                  : hasMyPlaces
                    ? "No stories yet for your cities. New stories appear as city data updates. Check back soon!"
                    : "Follow a city to see stories in your feed. Search for a city to get started."}
          </p>
          {(hasSecondaryFilters || selectedCityIds.size > 0) && !personalNewsletterOnly && (
            <button
              type="button"
              className={styles.compactClear}
              style={{ marginTop: 8 }}
              onClick={() => {
                setSelectedCityIds(new Set());
                setSelectedDistrict(null);
                setSelectedPlaceId(null);
                setSelectedTopic(null);
                setOnlyMySavedPlacesFeed(false);
              }}
            >
              {hasSecondaryFilters ? "Clear all filters" : "Browse stories from other cities"}
            </button>
          )}
        </div>
        )
      )}

      {/* My Block / My Places empty state (client-side filter returned nothing) */}
      {!isLoading &&
        !error &&
        visibleStories.length === 0 &&
        stories.length > 0 &&
        (selectedTopic === "my_block" ||
          selectedPlaceId !== null ||
          onlyMySavedPlacesFeed) && (
        <div className={styles.emptyState}>
          <p className={styles.myBlockEmptyTitle}>
            {onboarding.status === "scanning" || onboarding.status === "found_rep"
              ? "Building your neighborhood feed"
              : onboarding.status === "completed"
                ? "Your neighborhood feed is ready!"
                : "No stories for this place yet"}
          </p>
          <p className={styles.myBlockEmptyText}>
            {onboarding.status === "scanning" || onboarding.status === "found_rep"
              ? onboarding.message
              : onboarding.status === "completed"
                ? "Try refreshing to see your new stories."
                : "We\u2019re working on generating stories for your saved places. Check back soon."}
          </p>
        </div>
      )}

      {/* Generic client-side filter empty state (not my_block / not place-specific — those use the block above) */}
      {!isLoading &&
        !error &&
        visibleStories.length === 0 &&
        stories.length > 0 &&
        selectedPlaceId === null &&
        selectedTopic !== null &&
        selectedTopic !== "my_block" && (
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
      <MetricKeyProvider metrics={metricLookupItems}>
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
                onHide={handleHide}
                onDelete={isAdmin ? handleDelete : undefined}
                compact={isCompact}
                onOpenFeedDetail={openFeedDetail}
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


      <EditHomeLocationModal
        open={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onSaved={() => {
          setShowLocationModal(false);
          onPlaceSaved?.();
        }}
      />

      <FeedStoryModal
        storyId={feedDetailStoryId}
        open={feedDetailStoryId != null}
        onOpenChange={(next) => {
          if (!next) setFeedDetailStoryId(null);
        }}
        onSelectRelatedStory={(id) => setFeedDetailStoryId(id)}
      />
      </MetricKeyProvider>
    </div>
  );
}
