"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  listPublicFeedStories,
} from "@/lib/apiClient";
import { useSavedCities, useSaveCity, useUnsaveCity } from "@/lib/hooks/useCities";
import { enrichStories, type EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { fetchNarratives } from "@/lib/feed/fetchReportNarratives";
import {
  getPublicCityDetail,
  getPublicMetricComparisonsBatch,
  type PublicCityMetricItem,
  type PublicMetricComparisons,
} from "@/lib/publicApiClient";
import { type MetricCardData } from "./templates/MetricSummaryCard";
import MetricFeedCard from "./MetricFeedCard";
import { MetricKeyProvider } from "./MetricKeyContext";
import FeedCard from "./FeedCard";
import FeedStoryModal from "./FeedStoryModal";
import SkeletonCard from "./SkeletonCard";
import FeedEndState from "./FeedEndState";
import BrandedLoader from "@/components/BrandedLoader";
import EditHomeLocationModal from "@/components/EditHomeLocationModal";
import { slugify } from "@/lib/utils";
import OnboardingBanner from "./OnboardingBanner";
import FilterPanel, {
  type CityInfo,
  type DistrictsForCity,
  type FilterState,
} from "./FilterPanel";
import { usePlaceOnboarding } from "@/contexts/PlaceOnboardingContext";
import { startSignup } from "@/lib/signup";
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

const TOPIC_LABELS: Record<string, string> = {
  safety: "Safety", justice: "Justice",
  business: "Business", spending: "Spending",
  alert: "Alerts", trend: "Trends",
  context: "Context", off_the_charts: "Off the Charts",
  comparison: "Your District", milestone: "Milestones",
  "311_images": "311 Photos",
  my_block: "My place",
};

interface FeedContainerProps {
  cityId?: number | null;
  district?: number | null;
  isAdmin?: boolean;
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
  const { getAccessTokenSilently, isAuthenticated, loginWithRedirect } = useAuth0();
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


  // ── Filters (restored from sessionStorage when navigating back) ──
  const FILTER_STORAGE_KEY = "feed-filters";

  function loadSavedFilters(): {
    cityIds: Set<number>;
    districts: Map<number, Set<number>>;
    placeId: number | null;
    frequency: string | null;
    personalOnly: boolean;
    topics: Set<string>;
    displayLimit: number;
    onlyMySavedPlaces: boolean;
  } | null {
    try {
      const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Rebuild districts Map from serialized object
      const districts = new Map<number, Set<number>>();
      if (parsed.districts && typeof parsed.districts === "object") {
        for (const [k, v] of Object.entries(parsed.districts)) {
          if (Array.isArray(v) && v.length > 0) {
            districts.set(Number(k), new Set(v as number[]));
          }
        }
      }
      // Support both old single topic and new multi-topic format
      let topics = new Set<string>();
      if (Array.isArray(parsed.topics)) {
        topics = new Set(parsed.topics);
      } else if (parsed.topic) {
        topics = new Set([parsed.topic]);
      }
      return {
        cityIds: new Set(parsed.cityIds ?? []),
        districts,
        placeId: parsed.placeId ?? null,
        frequency: parsed.frequency ?? null,
        personalOnly: parsed.personalOnly ?? false,
        topics,
        displayLimit: parsed.displayLimit ?? 10,
        onlyMySavedPlaces: false,
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
  const [selectedDistricts, setSelectedDistricts] = useState<Map<number, Set<number>>>(
    () => saved.current?.districts ?? (district != null ? new Map([[cityId!, new Set([district])]]) : new Map()),
  );
  const [selectedFrequency, setSelectedFrequency] = useState<string | null>(
    saved.current?.frequency ?? null,
  );
  const [personalNewsletterOnly, setPersonalNewsletterOnly] = useState(
    saved.current?.personalOnly ?? false,
  );
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(
    () => saved.current?.topics ?? new Set(),
  );
  const [displayLimit, setDisplayLimit] = useState(saved.current?.displayLimit ?? 10);
  const [onlyMySavedPlacesFeed, setOnlyMySavedPlacesFeed] = useState(
    saved.current?.onlyMySavedPlaces ?? false,
  );
  const [feedOrder, setFeedOrder] = useState<"for_you" | "published_at">(() => {
    try {
      const saved = sessionStorage.getItem("feed-order");
      return saved === "for_you" ? "for_you" : "published_at";
    } catch { return "published_at"; }
  });
  const [showFilterPanel, setShowFilterPanel] = useState(false);
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
  const [feedDetailStoryId, setFeedDetailStoryId] = useState<number | null>(null);
  const hasMyPlaces = userPlaces.length > 0 || savedCities.length > 0;

  // Optimistic follow state: hides the "Follow X" prompt immediately on click,
  // before the server round-trip and query invalidation complete.
  const [optimisticFollowedIds, setOptimisticFollowedIds] = useState<Set<number>>(new Set());
  // Optimistic unfollow state: mirrors the above so rows reflect the unsave click before refetch.
  const [optimisticUnfollowedIds, setOptimisticUnfollowedIds] = useState<Set<number>>(new Set());

  // Clear optimistic IDs once the real savedCityIds catches up
  useEffect(() => {
    if (optimisticFollowedIds.size === 0) return;
    const stillPending = new Set<number>();
    for (const id of optimisticFollowedIds) {
      if (!savedCityIds.has(id)) stillPending.add(id);
    }
    if (stillPending.size < optimisticFollowedIds.size) {
      setOptimisticFollowedIds(stillPending);
    }
  }, [savedCityIds, optimisticFollowedIds]);

  // Drop optimistic unfollow IDs once the server query no longer lists them.
  useEffect(() => {
    if (optimisticUnfollowedIds.size === 0) return;
    const stillPending = new Set<number>();
    for (const id of optimisticUnfollowedIds) {
      if (savedCityIds.has(id)) stillPending.add(id);
    }
    if (stillPending.size < optimisticUnfollowedIds.size) {
      setOptimisticUnfollowedIds(stillPending);
    }
  }, [savedCityIds, optimisticUnfollowedIds]);

  // Effective saved cities: server state with optimistic follows added and optimistic unfollows removed.
  const effectiveSavedCityIds = useMemo(() => {
    const set = new Set(savedCityIds);
    for (const id of optimisticFollowedIds) set.add(id);
    for (const id of optimisticUnfollowedIds) set.delete(id);
    return set;
  }, [savedCityIds, optimisticFollowedIds, optimisticUnfollowedIds]);

  // Persist filters to sessionStorage whenever they change
  useEffect(() => {
    try {
      // Serialize districts Map as { cityId: [numbers] }
      const districtsObj: Record<string, number[]> = {};
      for (const [k, v] of selectedDistricts) {
        if (v.size > 0) districtsObj[String(k)] = [...v];
      }
      sessionStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          cityIds: [...selectedCityIds],
          districts: districtsObj,
          placeId: selectedPlaceId,
          frequency: selectedFrequency,
          personalOnly: personalNewsletterOnly,
          topics: [...selectedTopics],
          displayLimit,
        }),
      );
    } catch {
      // sessionStorage unavailable — ignore
    }
  }, [
    selectedCityIds,
    selectedDistricts,
    selectedPlaceId,
    selectedFrequency,
    personalNewsletterOnly,
    selectedTopics,
    displayLimit,
  ]);

  // Save scroll position (throttled) so we can restore it after back-navigation
  const SCROLL_STORAGE_KEY = "feed-scroll-y";

  useEffect(() => {
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        try { sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY)); } catch {}
        rafId = null;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
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

  // Derive districts only for followed cities (district = "my district" profile choice)
  const districtsPerCity: DistrictsForCity[] = useMemo(() => {
    // Only show districts for cities the user has followed
    const cityIds = [...savedCityIds].filter((id) =>
      uniqueCities.some((c) => c.city_id === id),
    );
    const result: DistrictsForCity[] = [];
    for (const cid of cityIds) {
      const cityPlaces = places.filter((p) => p.city_id === cid && p.district > 0);
      if (cityPlaces.length === 0) continue;
      const nums = [...new Set(cityPlaces.map((p) => p.district))].sort((a, b) => a - b);
      const term = cityPlaces[0]?.district_term ?? "District";
      const prefix = term.toLowerCase() === "ward" ? "W" : "D";
      const cityInfo = uniqueCities.find((c) => c.city_id === cid);
      result.push({
        cityId: cid,
        cityName: cityInfo?.city_name ?? "Unknown",
        districtTerm: term,
        prefix,
        numbers: nums,
      });
    }
    return result;
  }, [savedCityIds, places, uniqueCities]);

  // Persist feed order to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem("feed-order", feedOrder); } catch {}
  }, [feedOrder]);

  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(10);
  }, [
    selectedCityIds,
    selectedDistricts,
    selectedPlaceId,
    selectedFrequency,
    personalNewsletterOnly,
    selectedTopics,
    onlyMySavedPlacesFeed,
  ]);

  // Pass story_type to the API for server-side filtering (only if single topic)
  const apiStoryType = selectedTopics.size === 1 ? [...selectedTopics][0] : undefined;

  // During onboarding, skip the saved-places filter so city-level stories
  // appear immediately while neighborhood stories are still being generated.
  // Also skip when the user has explicitly selected a city — they want to
  // see ALL stories for that city, not just ones near their saved places.
  const isOnboardingScanning = onboarding.status === "scanning" || onboarding.status === "found_rep";
  const apiOnlyMySavedPlaces =
    isAuthenticated &&
    onlyMySavedPlacesFeed &&
    selectedPlaceId == null &&
    selectedCityIds.size === 0 &&
    !personalNewsletterOnly &&
    !isOnboardingScanning &&
    userPlaces.length > 0;

  // For single-city + single-district, use server-side filtering
  const apiDistrict = singleCityId && selectedDistricts.size === 1
    ? (() => {
        const cityDists = selectedDistricts.get(singleCityId);
        return cityDists?.size === 1 ? [...cityDists][0] : undefined;
      })()
    : undefined;

  const {
    data: feedData,
    isLoading,
    isFetching,
    isPlaceholderData,
    error,
    refetch,
  } = useFeedStories({
    city_id: personalNewsletterOnly ? undefined : singleCityId,
    district: personalNewsletterOnly ? undefined : apiDistrict,
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
  const userPlaceLabelMap = useMemo(
    () => new Map(userPlaces.map((place) => [place.id, place.label])),
    [userPlaces],
  );
  const enriched = useMemo(
    () => enrichStories(stories, undefined, userPlaceLabelMap, { skipInterleave: feedOrder === "published_at" }),
    [stories, userPlaceLabelMap, feedOrder],
  );

  // ── Public preview stories fallback (shown when feed is empty during onboarding) ──
  const [previewStories, setPreviewStories] = useState<EnrichedFeedStory[]>([]);

  // When a city has no stories, capture its name (for the banner) then auto-switch to All Cities.
  // Clear the banner once the city turns out to have stories (e.g. places loaded after initial render).
  useEffect(() => {
    if (selectedCityWithNoStories) {
      setNoStoriesCity(selectedCityWithNoStories);
      setShowCityLaunchBanner(true);
    } else {
      setNoStoriesCity(null);
    }
  }, [selectedCityWithNoStories]);

  // Suppress auto-switch while onboarding is actively scanning (city or place level)
  // or has just completed successfully. Once onboarding resolves as failed (or idle),
  // allow the switch to All Cities.
  useEffect(() => {
    if (
      selectedCityWithNoStories &&
      !isLoading &&
      stories.length === 0 &&
      !isOnboardingScanning &&
      onboarding.status !== "completed" &&
      autoSwitchedCityRef.current !== selectedCityWithNoStories.id
    ) {
      autoSwitchedCityRef.current = selectedCityWithNoStories.id;
      setSelectedCityIds(new Set());
    }
  }, [selectedCityWithNoStories, isLoading, stories.length, isOnboardingScanning, onboarding.status]);

  // Complete city-level loading when the feed query resolves
  useEffect(() => {
    if (onboarding.mode !== "city" || onboarding.status !== "scanning" || isLoading) return;
    // Feed finished loading: complete city onboarding with success/failure
    onboarding.completeCityLoading(stories.length > 0);
  }, [onboarding.mode, onboarding.status, isLoading, stories.length, onboarding.completeCityLoading]);

  // Refresh the places cache when city onboarding completes so uniqueCities stays accurate
  useEffect(() => {
    if (onboarding.status === "completed" && onboarding.mode === "city") {
      queryClient.invalidateQueries({ queryKey: feedKeys.places() });
    }
  }, [onboarding.status, onboarding.mode, queryClient]);

  // Dismiss the place-level banner as soon as new stories appear in the feed
  useEffect(() => {
    if (
      onboarding.mode === "place" &&
      onboarding.status === "completed" &&
      !isLoading &&
      stories.length > 0
    ) {
      onboarding.dismiss();
    }
  }, [onboarding.mode, onboarding.status, isLoading, stories.length, onboarding.dismiss]);

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

  // ── Metric summary cards: fetch city metrics + comparisons for interleaving ──
  const [metricCardPool, setMetricCardPool] = useState<MetricCardData[]>([]);
  const fetchedMetricCityIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const cityIds = new Set(stories.map((s) => s.city_id).filter(Boolean));
    const toFetch: number[] = [];
    for (const cid of cityIds) {
      if (!fetchedMetricCityIdsRef.current.has(cid)) toFetch.push(cid);
    }
    if (toFetch.length === 0) return;

    let stale = false;
    Promise.all(
      toFetch.map(async (cid) => {
        try {
          const detail = await getPublicCityDetail(cid);
          const metrics = detail.metrics ?? [];
          if (metrics.length === 0) return [];
          const comps = await getPublicMetricComparisonsBatch({
            metric_ids: metrics.map((m) => m.id),
            district: 0,
            comparison_types: ["ytd"],
          });
          const slug = slugify(detail.name);
          const cityName = detail.name;
          const cityEmoji = detail.emoji ?? undefined;
          const portalDomain = detail.main_domain ?? undefined;
          return { metrics, comps, slug, cityName, cityEmoji, portalDomain };
        } catch {
          return [];
        }
      }),
    ).then((results) => {
      if (stale) return;
      const cards: MetricCardData[] = [];
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        // Error case returns []; only mark city as fetched on success
        if (Array.isArray(res)) continue;
        fetchedMetricCityIdsRef.current.add(toFetch[i]);
        const { metrics, comps, slug, cityName, cityEmoji, portalDomain } = res;
        // Build cards ranked by abs(pct_change) descending
        const candidates: Array<{ card: MetricCardData; absPct: number }> = [];
        for (const m of metrics) {
          const comp = comps[m.id]?.comparisons?.ytd;
          if (!comp) continue;
          const curr = comp.current_period_value;
          const prior = comp.comparison_period_value;
          if (curr == null || prior == null || prior === 0) continue;
          if (curr === 0 || Math.abs(curr) < 5) continue;
          const pct = ((curr - prior) / prior) * 100;
          // Suppress bad data: value dropped to 0 (data gap), change > 500%,
          // or extreme drops (>= 90%) that indicate partial reporting periods
          if (curr === 0 && pct === -100) continue;
          if (Math.abs(pct) > 500) continue;
          if (pct <= -90) continue;
          // Spread pseudo-published timestamps across recent days
          // so cards don't all cluster at the same time
          const idx = candidates.length;
          const hoursAgo = idx * 12 + 2; // space 12h apart, starting 2h ago
          const publishedAt = new Date(Date.now() - hoursAgo * 3600000).toISOString();
          candidates.push({
            card: {
              metric: m,
              comparison: comp,
              slug,
              cityName,
              cityEmoji,
              portalDomain,
              publishedAt,
            },
            absPct: Math.abs(pct),
          });
        }
        // Sort by interestingness and cap at 10
        candidates.sort((a, b) => b.absPct - a.absPct);
        cards.push(...candidates.slice(0, 10).map((c) => c.card));
      }
      if (cards.length > 0) {
        setMetricCardPool(cards);
      }
    }).catch(() => {});

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

  // Hidden metric cards (session-only, no persistence)
  const [hiddenMetricIds, setHiddenMetricIds] = useState<Set<number>>(new Set());
  const handleMetricHide = useCallback((metricId: number) => {
    if (metricId < 0) {
      setHiddenMetricIds((prev) => {
        const next = new Set(prev);
        next.delete(-metricId);
        return next;
      });
    } else {
      setHiddenMetricIds((prev) => new Set(prev).add(metricId));
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
      // Suppress stories with bad data: value 0 + down 100%, >500% change,
      // or extreme drops (>= 90%) that indicate partial reporting periods
      const meta = s.metadata ?? {};
      const storyPct = (meta.pct_change ?? meta.anomaly_change_pct ?? meta.trend_pct_change ?? meta.percent_change) as number | undefined;
      const storyVal = (meta.current_period_value ?? meta.anomaly_value) as number | undefined;
      if (storyPct != null) {
        if (storyVal === 0 && storyPct === -100) return false;
        if (Math.abs(storyPct) > 500) return false;
        if (storyPct <= -90) return false;
      }
      // Multi-topic filter: if topics selected, story must match one
      if (selectedTopics.size > 0 && !selectedTopics.has(s.card_type)) return false;
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
      // Multi-city filter
      if (selectedCityIds.size > 0 && !selectedCityIds.has(s.city_id)) return false;
      // Multi-district filter (client-side for multi-city or multi-district cases)
      if (selectedDistricts.size > 0) {
        const cityDistricts = selectedDistricts.get(s.city_id);
        // If this city has district filters, the story must match
        if (cityDistricts && cityDistricts.size > 0) {
          if (!cityDistricts.has(s.district ?? 0)) return false;
        }
      }
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
        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
        const visualIdx = deduped.findIndex(
          (s, i) => i >= 3 && VISUAL_TEMPLATES.has(s.template) &&
            Date.now() - new Date(s.published_at ?? s.story_date ?? 0).getTime() < THREE_DAYS_MS,
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
    selectedTopics,
    selectedCityIds,
    selectedDistricts,
    selectedPlaceId,
    userPlaces,
    onlyMySavedPlacesFeed,
    savedCityIds,
  ]);

  // Fetch public preview stories when the feed would otherwise be empty
  const feedShowsNothing = !isLoading && !error && visibleStories.length === 0;

  // When the user has a saved city, fetch stories from that city as fallback
  // instead of random trending stories from other cities.
  const previewCityId = feedShowsNothing && savedCityIds.size === 1
    ? [...savedCityIds][0]
    : undefined;

  useEffect(() => {
    if (!feedShowsNothing) {
      if (previewStories.length > 0) setPreviewStories([]);
      return;
    }
    let cancelled = false;
    listPublicFeedStories({
      limit: 10,
      order_by: "published_at",
      city_id: previewCityId,
    })
      .then((res) => {
        if (!cancelled) {
          setPreviewStories(enrichStories(res.stories ?? []).slice(0, 10));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [feedShowsNothing, previewCityId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Toggle follow only (no feed change). Used by the filter panel's row checkbox. ──
  const handleToggleFollow = useCallback(
    (cid: number) => {
      if (!isAuthenticated) {
        const city = uniqueCities.find((c) => c.city_id === cid);
        void startSignup(loginWithRedirect, "resident", {
          source_surface: "feed_filter_follow",
          city_id: cid,
          city_name: city?.city_name ?? null,
        });
        return;
      }
      const wasFollowed = effectiveSavedCityIds.has(cid);
      if (wasFollowed) {
        unsaveCityMutation.mutate(cid);
        setOptimisticFollowedIds((prev) => {
          if (!prev.has(cid)) return prev;
          const next = new Set(prev);
          next.delete(cid);
          return next;
        });
        setOptimisticUnfollowedIds((prev) => new Set(prev).add(cid));
        setSelectedDistricts((prev) => {
          if (!prev.has(cid)) return prev;
          const next = new Map(prev);
          next.delete(cid);
          return next;
        });
      } else {
        saveCityMutation.mutate(cid);
        setOptimisticFollowedIds((prev) => new Set(prev).add(cid));
        setOptimisticUnfollowedIds((prev) => {
          if (!prev.has(cid)) return prev;
          const next = new Set(prev);
          next.delete(cid);
          return next;
        });
      }
    },
    [isAuthenticated, effectiveSavedCityIds, saveCityMutation, unsaveCityMutation, loginWithRedirect, uniqueCities],
  );

  // ── Toggle feed membership only (no follow change). Used by the "View in Feed" row button and chip X. ──
  const handleToggleFeed = useCallback(
    (cid: number) => {
      setSelectedCityIds((prev) => {
        const next = new Set(prev);
        if (next.has(cid)) next.delete(cid);
        else next.add(cid);
        return next;
      });
    },
    [],
  );

  // ── Save a city without toggling feed membership (used by the "Browsing X — Follow X" banner). ──
  const handleFollowCity = useCallback(
    (cid: number) => {
      if (!isAuthenticated) return;
      if (effectiveSavedCityIds.has(cid)) return;
      saveCityMutation.mutate(cid);
      setOptimisticFollowedIds((prev) => new Set(prev).add(cid));
    },
    [isAuthenticated, effectiveSavedCityIds, saveCityMutation],
  );

  // ── Apply filters from FilterPanel ──
  const handleApplyFilters = useCallback((f: FilterState) => {
    setSelectedCityIds(f.selectedCityIds);
    setSelectedTopics(f.selectedTopics);
    setSelectedDistricts(f.selectedDistricts);
    setSelectedPlaceId(f.selectedPlaceId);
    setOnlyMySavedPlacesFeed(f.onlyMySavedPlaces);
    setFeedOrder(f.feedOrder);
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
    if (!singleCityId) return;
    const cityDists = selectedDistricts.get(singleCityId);
    const singleDist = cityDists?.size === 1 ? [...cityDists][0] : null;
    if (singleDist == null) return;
    if (!confirm("Delete all feed stories for this district?")) return;
    setBulkDeleting(true);
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStoriesByCity(singleCityId, token, singleDist);
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

  const hasActiveFilters =
    selectedTopics.size > 0 ||
    selectedDistricts.size > 0 ||
    selectedPlaceId != null ||
    selectedCityIds.size > 0 ||
    feedOrder !== "published_at";

  // Count active filters for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCityIds.size > 0) count += selectedCityIds.size;
    if (selectedTopics.size > 0) count += selectedTopics.size;
    if (selectedDistricts.size > 0) {
      for (const v of selectedDistricts.values()) count += v.size;
    }
    if (selectedPlaceId !== null) count += 1;
    if (feedOrder !== "published_at") count += 1;
    return count;
  }, [selectedCityIds, selectedTopics, selectedDistricts, selectedPlaceId, feedOrder]);

  // ── Unfollowed cities being browsed (for follow prompt) ──
  const unfollowedBrowsedCities = useMemo(() => {
    if (selectedCityIds.size === 0) return [];
    return [...selectedCityIds]
      .filter((id) => !effectiveSavedCityIds.has(id))
      .map((id) => uniqueCities.find((c) => c.city_id === id))
      .filter(Boolean) as CityInfo[];
  }, [selectedCityIds, effectiveSavedCityIds, uniqueCities]);

  // ── City discovery prompt (shown for single-city users) ──
  const showCityDiscovery = useMemo(() => {
    if (savedCities.length !== 1) return false;
    try {
      const count = parseInt(localStorage.getItem("tc:city-discovery-views") ?? "0", 10);
      return count < 5;
    } catch { return true; }
  }, [savedCities.length]);

  // Track discovery prompt views
  useEffect(() => {
    if (showCityDiscovery && visibleStories.length > 0) {
      try {
        const count = parseInt(localStorage.getItem("tc:city-discovery-views") ?? "0", 10);
        localStorage.setItem("tc:city-discovery-views", String(count + 1));
      } catch {}
    }
  }, [showCityDiscovery, visibleStories.length]);

  const topicLabels = TOPIC_LABELS;

  /** Saved places that appear on at least one visible story — offer chips to narrow the feed. */
  const placeNavIds = useMemo(() => {
    if (!isAuthenticated || userPlaces.length === 0 || selectedPlaceId !== null) {
      return [] as number[];
    }
    const allowed = new Set(userPlaces.map((p) => p.id));
    const found = new Set<number>();
    for (const s of visibleStories) {
      if (s.user_place_id != null && allowed.has(s.user_place_id)) {
        found.add(s.user_place_id);
      }
      const legacy = Array.isArray(s.metadata?.user_place_ids)
        ? s.metadata.user_place_ids
        : [];
      for (const id of legacy) {
        if (typeof id === "number" && allowed.has(id)) found.add(id);
      }
    }
    return [...found].sort((a, b) => a - b);
  }, [isAuthenticated, userPlaces, visibleStories, selectedPlaceId]);

  const showPillsRow = hasActiveFilters || placeNavIds.length > 0;

  return (
    <div
      ref={containerRef}
      className={styles.feedContainer}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── New simplified header ── */}
      <div className={`${styles.feedHeader} dashboard-page-header`}>
        <h1 className={styles.feedTitle}>Feed</h1>
        <div className={styles.feedHeaderRight}>
          <div className={styles.filterIconWrap}>
            <button
              type="button"
              className={styles.filterIconBtn}
              onClick={() => setShowFilterPanel((v) => !v)}
              aria-label="Open filters"
              aria-expanded={showFilterPanel}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {activeFilterCount > 0 && (
                <span className={styles.filterBadge}>{activeFilterCount}</span>
              )}
            </button>

            {/* FilterPanel (positioned relative to icon on desktop) */}
            <FilterPanel
              open={showFilterPanel}
              onClose={() => setShowFilterPanel(false)}
              allCities={uniqueCities}
              savedCityIds={effectiveSavedCityIds}
              filters={{
                selectedCityIds,
                selectedTopics,
                selectedDistricts,
                selectedPlaceId,
                onlyMySavedPlaces: onlyMySavedPlacesFeed,
                feedOrder,
              }}
              onApply={handleApplyFilters}
              onToggleFollow={handleToggleFollow}
              userPlaces={userPlaces}
              districtsPerCity={districtsPerCity}
              onAddAddress={() => setShowLocationModal(true)}
            />
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

      {/* ── Active filter pills (+ place navigation when the feed mixes in saved-place stories) ── */}
      {showPillsRow && (
        <div className={styles.activePillsRow}>
          <div className={styles.activePillsScroll}>
            {/* Saved-place chips: tap to filter to that address (only when not already narrowed) */}
            {placeNavIds.map((pid) => (
              <button
                key={`place-nav-${pid}`}
                type="button"
                className={`${styles.activePill} ${styles.placeNavPill}`}
                onClick={() => {
                  setSelectedPlaceId(pid);
                  setOnlyMySavedPlacesFeed(true);
                }}
              >
                <span className={styles.activePillLabel}>
                  📍 {userPlaces.find((p) => p.id === pid)?.label ?? "Saved place"}
                </span>
              </button>
            ))}

            {/* City pills */}
            {[...selectedCityIds].map((cid) => {
              const c = uniqueCities.find((u) => u.city_id === cid);
              if (!c) return null;
              return (
                <button
                  key={`city-${cid}`}
                  type="button"
                  className={styles.activePill}
                  onClick={() => handleToggleFeed(cid)}
                >
                  <span className={styles.activePillLabel}>
                    {c.city_emoji ? `${c.city_emoji} ` : ""}{c.city_name}
                  </span>
                  <span className={styles.activePillX} aria-hidden="true">&times;</span>
                </button>
              );
            })}

            {/* Topic pills */}
            {[...selectedTopics].map((t) => (
              <button
                key={`topic-${t}`}
                type="button"
                className={styles.activePill}
                onClick={() => {
                  const next = new Set(selectedTopics);
                  next.delete(t);
                  setSelectedTopics(next);
                }}
              >
                <span className={styles.activePillLabel}>{topicLabels[t] ?? t}</span>
                <span className={styles.activePillX} aria-hidden="true">&times;</span>
              </button>
            ))}

            {/* District pills */}
            {[...selectedDistricts].flatMap(([cid, nums]) => {
              const dc = districtsPerCity.find((d) => d.cityId === cid);
              if (!dc) return [];
              return [...nums].map((num) => (
                <button
                  key={`district-${cid}-${num}`}
                  type="button"
                  className={styles.activePill}
                  onClick={() => {
                    const next = new Map([...selectedDistricts].map(([k, v]) => [k, new Set(v)]));
                    const citySet = next.get(cid);
                    if (citySet) {
                      citySet.delete(num);
                      if (citySet.size === 0) next.delete(cid);
                    }
                    setSelectedDistricts(next);
                  }}
                >
                  <span className={styles.activePillLabel}>
                    {districtsPerCity.length > 1
                      ? `${dc.cityName.split(",")[0]} ${dc.prefix}${num}`
                      : `${dc.prefix}${num}`}
                  </span>
                  <span className={styles.activePillX} aria-hidden="true">&times;</span>
                </button>
              ));
            })}

            {/* My Places pill: only show when narrowed to a specific place */}
            {selectedPlaceId !== null && (
              <button
                type="button"
                className={styles.activePill}
                onClick={() => {
                  setSelectedPlaceId(null);
                }}
              >
                <span className={styles.activePillLabel}>
                  📍 Near {userPlaces.find((p) => p.id === selectedPlaceId)?.label ?? "address"}
                </span>
                <span className={styles.activePillX} aria-hidden="true">&times;</span>
              </button>
            )}

            {/* Sort pill (only if non-default) */}
            {feedOrder !== "published_at" && (
              <button
                type="button"
                className={styles.activePill}
                onClick={() => setFeedOrder("published_at")}
              >
                <span className={styles.activePillLabel}>Recommended</span>
                <span className={styles.activePillX} aria-hidden="true">&times;</span>
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className={styles.clearAllBtn}
              onClick={() => {
                setSelectedCityIds(new Set());
                setSelectedTopics(new Set());
                setSelectedDistricts(new Map());
                setSelectedPlaceId(null);
                setOnlyMySavedPlacesFeed(false);
                setFeedOrder("published_at");
              }}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* ── Follow prompt for unfollowed cities ── */}
      {isAuthenticated && unfollowedBrowsedCities.length > 0 && (
        <div className={styles.followPrompt}>
          <span className={styles.followPromptText}>
            Browsing {unfollowedBrowsedCities.map((c) => c.city_name).join(", ")} stories
          </span>
          {unfollowedBrowsedCities.length === 1 ? (
            <button
              type="button"
              className={styles.followPromptBtn}
              onClick={() => handleFollowCity(unfollowedBrowsedCities[0].city_id)}
            >
              Follow {unfollowedBrowsedCities[0].city_name}
            </button>
          ) : (
            <button
              type="button"
              className={styles.followPromptBtn}
              onClick={() => unfollowedBrowsedCities.forEach((c) => handleFollowCity(c.city_id))}
            >
              Follow all
            </button>
          )}
        </div>
      )}

      {/* ── City discovery prompt (single-city users) ── */}
      {showCityDiscovery && !hasActiveFilters && visibleStories.length > 0 && (
        <div className={styles.discoveryPrompt}>
          <span className={styles.discoveryText}>
            Stories from {savedCities[0]?.display_name || savedCities[0]?.city_name || "your city"}
          </span>
          <button
            type="button"
            className={styles.discoveryBtn}
            onClick={() => setShowFilterPanel(true)}
          >
            + Add more cities
          </button>
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
            <a href="/add-your-city" className={styles.cityLaunchLink}>Learn more</a>
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

      {/* Onboarding progress banner (shows while neighborhood/city data is building).
          Hidden during initial feed load to avoid two loaders at once,
          UNLESS city-level onboarding is active (we want to show "Looking for stories in X..."). */}
      {(!(isLoading && visibleStories.length === 0) || onboarding.mode === "city") && <OnboardingBanner />}

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

      {/* Empty: show preview stories when available, otherwise text fallback */}
      {!isLoading && !error && stories.length === 0 && (
        previewStories.length > 0 ? (
          <>
            <p className={styles.previewHeader}>
              {previewCityId
                ? `Stories from ${savedCities[0]?.display_name || savedCities[0]?.city_name || "your city"}`
                : "Trending stories"}
            </p>
            <div className={styles.storiesList}>
              {previewStories.map((story) => (
                <FeedCard
                  key={story.id}
                  story={story}
                  onHide={handleHide}
                  onOpenFeedDetail={openFeedDetail}
                />
              ))}
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <p>
              {personalNewsletterOnly
                ? "No newsletter stories yet. Check back soon as new data comes in."
                : onlyMySavedPlacesFeed
                  ? "No stories yet for your saved places. New stories appear as city data updates."
                : hasActiveFilters
                  ? "No stories match your current filters. Try adjusting or clearing them."
                  : isAdmin
                    ? "No feed stories yet. New stories appear as city data updates. Check back soon!"
                    : hasMyPlaces
                      ? "No stories yet for your cities. New stories appear as city data updates. Check back soon!"
                      : "Follow a city to see stories in your feed."}
            </p>
            {hasActiveFilters && !personalNewsletterOnly && (
              <button
                type="button"
                className={styles.compactClear}
                style={{ marginTop: 8 }}
                onClick={() => {
                  setSelectedCityIds(new Set());
                  setSelectedTopics(new Set());
                  setSelectedDistricts(new Map());
                  setSelectedPlaceId(null);
                  setOnlyMySavedPlacesFeed(false);
                  setFeedOrder("published_at");
                }}
              >
                Clear all filters
              </button>
            )}
            {!hasActiveFilters && !hasMyPlaces && !isAdmin && !personalNewsletterOnly && (
              <button
                type="button"
                className={styles.browseBtn}
                style={{ marginTop: 8 }}
                onClick={() => setShowFilterPanel(true)}
              >
                Browse cities
              </button>
            )}
          </div>
        )
      )}

      {/* My Places empty state (client-side filter returned nothing) */}
      {!isLoading &&
        !error &&
        visibleStories.length === 0 &&
        stories.length > 0 &&
        (selectedPlaceId !== null || onlyMySavedPlacesFeed) && (
        <>
          <div className={styles.emptyState}>
            <p className={styles.myBlockEmptyTitle}>
              {onboarding.status === "scanning" || onboarding.status === "found_rep"
                ? "Building your neighborhood feed"
                : onboarding.status === "completed"
                  ? "Neighborhood stories will appear soon"
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
          {previewStories.length > 0 && (isOnboardingScanning || onboarding.status === "completed") && (
            <>
              <p className={styles.previewHeader}>
                {previewCityId
                  ? `Stories from ${savedCities[0]?.display_name || savedCities[0]?.city_name || "your city"}`
                  : "Trending stories"}
              </p>
              <div className={styles.storiesList}>
                {previewStories.map((story) => (
                  <FeedCard
                    key={story.id}
                    story={story}
                    onHide={handleHide}
                    onOpenFeedDetail={openFeedDetail}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Generic client-side filter empty state */}
      {!isLoading &&
        !error &&
        visibleStories.length === 0 &&
        stories.length > 0 &&
        selectedPlaceId === null &&
        !onlyMySavedPlacesFeed &&
        selectedTopics.size > 0 && (
        <div className={styles.emptyState}>
          <p>No stories match this filter right now. Try a different topic or clear filters.</p>
          <button
            type="button"
            className={styles.compactClear}
            style={{ marginTop: 8 }}
            onClick={() => setSelectedTopics(new Set())}
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Stories + interleaved metric summary cards */}
      <MetricKeyProvider metrics={metricLookupItems}>
      {visibleStories.length > 0 && (
        <div className={styles.storiesList}>
          {visibleStories.map((story, storyIdx) => {
            // Interleave a metric summary card every 5th position (at indices 4, 9, 14, ...)
            const metricCardIdx = storyIdx >= 4 && (storyIdx - 4) % 5 === 0
              ? Math.floor((storyIdx - 4) / 5)
              : -1;
            const metricCard =
              metricCardIdx >= 0 && metricCardIdx < metricCardPool.length
                ? metricCardPool[metricCardIdx]
                : null;
            const showMetricCard = metricCard && !hiddenMetricIds.has(metricCard.metric.id);

            return (
              <React.Fragment key={story.id}>
                {showMetricCard && (
                  <MetricFeedCard
                    key={`metric-${metricCard.metric.id}`}
                    data={metricCard}
                    onHide={handleMetricHide}
                  />
                )}
                <FeedCard
                  story={story}
                  isAdmin={isAdmin}
                  onHide={handleHide}
                  onDelete={isAdmin ? handleDelete : undefined}
                  onOpenFeedDetail={openFeedDetail}
                />
              </React.Fragment>
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
          setOnlyMySavedPlacesFeed(true);
          setSelectedPlaceId(null);
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
