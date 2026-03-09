"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth0 } from "@auth0/auth0-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFeedStories, useTrackFeedEngagement, useFeedPlaces, type FeedStory } from "@/lib/hooks/useFeed";
import { useCities } from "@/lib/hooks/useCities";
import {
  deleteFeedStory,
  deleteFeedStoriesByCity,
  listFeedStoryComments,
  addFeedStoryComment,
  type FeedStoryComment,
  type FeedStoryCommentCreate,
} from "@/lib/apiClient";
import { API_BASE } from "@/lib/apiBase";
import { feedKeys } from "@/lib/hooks/useFeed";
import Loader from "./Loader";
import styles from "./FeedView.module.css";

interface FeedViewProps {
  cityId?: number | null;
  district?: number | null;
  /** When true, show admin filters and delete options by city. */
  isAdmin?: boolean;
  /** City IDs the user leads; with isAdmin, show admin bar. */
  cityLeadCityIds?: number[];
}

/** Selected place filter: null = All; otherwise filter by this (city_id, district). district null = all districts for city. */
type SelectedPlace = { city_id: number; district: number | null } | null;

export default function FeedView({ cityId, district, isAdmin = false, cityLeadCityIds = [] }: FeedViewProps) {
  const router = useRouter();
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace>(() =>
    cityId != null ? { city_id: cityId, district: district ?? null } : null
  );
  const [selectedFrequency, setSelectedFrequency] = useState<string | null>(null);
  /** When true, show only stories from "Generate example newsletter" (personal_newsletter category). */
  const [personalNewsletterOnly, setPersonalNewsletterOnly] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(10);
  /** Resolve map id -> short_hash for feed stories that only have map id (so image and link work). */
  const [resolvedMapHashes, setResolvedMapHashes] = useState<Record<number, string>>({});
  const { data: citiesList } = useCities();
  const { data: placesData } = useFeedPlaces();
  const trackEngagement = useTrackFeedEngagement();

  const [deletingStoryId, setDeletingStoryId] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  /** Story ID whose comments are expanded; null = none. */
  const [commentsExpandedId, setCommentsExpandedId] = useState<number | null>(null);
  /** Cached comments per story (when expanded). */
  const [commentsCache, setCommentsCache] = useState<Record<number, FeedStoryComment[]>>({});
  const [commentsLoadingId, setCommentsLoadingId] = useState<number | null>(null);
  const [commentSubmittingId, setCommentSubmittingId] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState<Record<number, string>>({});
  const [commentAuthorName, setCommentAuthorName] = useState<Record<number, string>>({});

  const places = placesData?.places ?? [];

  /** Unique cities from places (first occurrence per city_id) for City dropdown. */
  const uniqueCities = useMemo(() => {
    const seen = new Set<number>();
    return places.filter((p) => {
      if (seen.has(p.city_id)) return false;
      seen.add(p.city_id);
      return true;
    });
  }, [places]);

  const invalidateFeedQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: feedKeys.lists() });
    queryClient.invalidateQueries({ queryKey: feedKeys.all });
  }, [queryClient]);

  const handleDeleteStory = async (storyId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingStoryId(storyId);
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStory(storyId, token);
      invalidateFeedQueries();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete story");
    } finally {
      setDeletingStoryId(null);
    }
  };

  const handleDeleteAllForCity = async () => {
    if (selectedPlace?.city_id == null) return;
    if (!confirm("Delete all feed stories for this city? This cannot be undone.")) return;
    setBulkDeleting(true);
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStoriesByCity(selectedPlace.city_id, token);
      invalidateFeedQueries();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete stories");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDeleteAllForDistrict = async () => {
    if (selectedPlace?.city_id == null || selectedPlace.district == null) return;
    const label = selectedPlace.district === 0 ? "city-wide" : `district ${selectedPlace.district}`;
    if (!confirm(`Delete all feed stories for ${label}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStoriesByCity(selectedPlace.city_id, token, selectedPlace.district);
      invalidateFeedQueries();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete stories");
    } finally {
      setBulkDeleting(false);
    }
  };

  // Reset to first page when filters change
  useEffect(() => {
    setDisplayLimit(10);
  }, [selectedPlace, selectedFrequency, personalNewsletterOnly]);

  // Feed: when "Personal newsletter" is on, filter by category; otherwise filter by place/frequency
  const { data: feedData, isLoading, error } = useFeedStories({
    city_id: personalNewsletterOnly ? undefined : selectedPlace?.city_id,
    district: personalNewsletterOnly ? undefined : (selectedPlace != null && selectedPlace.district !== null ? selectedPlace.district : undefined),
    newsletter_frequency: selectedFrequency ?? undefined,
    category: personalNewsletterOnly ? "personal_newsletter" : undefined,
    limit: displayLimit,
    order_by: "published_at",
    all_cities: personalNewsletterOnly || selectedPlace == null,
  });

  const viewedStoriesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (feedData?.stories) {
      feedData.stories.forEach((story) => {
        if (!viewedStoriesRef.current.has(story.id)) {
          viewedStoriesRef.current.add(story.id);
          trackEngagement.mutate({ storyId: story.id, action: "view" });
        }
      });
    }
  }, [feedData?.stories]);

  // Resolve map id -> short_hash for stories that have map id but no short_hash (e.g. old feed data).
  // Must run unconditionally (before any early return) to satisfy Rules of Hooks.
  const storiesForMaps = feedData?.stories ?? [];
  useEffect(() => {
    const mapIdsToResolve = new Set<number>();
    for (const story of storiesForMaps) {
      const pv = story.primary_visualization;
      if (!pv || (story.visualization_type || pv.type) !== "map") continue;
      const id = pv.id != null ? Number(pv.id) : NaN;
      if (Number.isNaN(id) || pv.short_hash || resolvedMapHashes[id]) continue;
      mapIdsToResolve.add(id);
    }
    if (mapIdsToResolve.size === 0) return;
    mapIdsToResolve.forEach((mapId) => {
      fetch(`${API_BASE.replace(/\/$/, "")}/api/maps/public/by-id/${mapId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { short_hash?: string } | null) => {
          if (data?.short_hash) {
            setResolvedMapHashes((prev) => ({ ...prev, [mapId]: data.short_hash! }));
          }
        })
        .catch(() => {});
    });
  }, [storiesForMaps.map((s) => s.primary_visualization?.id).join(",")]);

  const handlePlaceClick = (place: { city_id: number; district: number }) => {
    setSelectedPlace((prev) =>
      prev?.city_id === place.city_id && prev?.district === place.district
        ? null
        : { city_id: place.city_id, district: place.district }
    );
  };

  /** Label for the active filter (for subtitle and removable pill). */
  const activeFilterLabel = useMemo(() => {
    if (selectedPlace == null) return null;
    const city = uniqueCities.find((c) => c.city_id === selectedPlace.city_id);
    const cityName = city?.city_name ?? `City ${selectedPlace.city_id}`;
    if (selectedPlace.district == null) return `${cityName} (all districts)`;
    if (selectedPlace.district === 0) return `${cityName} · City-wide`;
    return `${cityName} · District ${selectedPlace.district}`;
  }, [selectedPlace, uniqueCities]);

  const handleStoryCityClick = (storyCityId: number, storyDistrict: number | null) => {
    const d = storyDistrict ?? 0;
    handlePlaceClick({ city_id: storyCityId, district: d });
  };

  const handleStoryClick = (story: FeedStory) => {
    trackEngagement.mutate({ storyId: story.id, action: "click" });
    if (story.detail_url) {
      router.push(story.detail_url);
    }
  };

  const handleShare = (story: FeedStory, e: React.MouseEvent) => {
    e.stopPropagation();
    trackEngagement.mutate({ storyId: story.id, action: "share" });
    if (story.detail_url) {
      const fullUrl = `${window.location.origin}${story.detail_url}`;
      navigator.clipboard.writeText(fullUrl).then(() => {
        alert("Link copied to clipboard!");
      });
    }
  };

  const handleLike = (story: FeedStory, e: React.MouseEvent) => {
    e.stopPropagation();
    trackEngagement.mutate({ storyId: story.id, action: "like" });
  };

  const handleToggleComments = async (storyId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (commentsExpandedId === storyId) {
      setCommentsExpandedId(null);
      return;
    }
    setCommentsExpandedId(storyId);
    if (!commentsCache[storyId]) {
      setCommentsLoadingId(storyId);
      try {
        const res = await listFeedStoryComments(storyId);
        setCommentsCache((prev) => ({ ...prev, [storyId]: res.comments }));
      } catch {
        setCommentsCache((prev) => ({ ...prev, [storyId]: [] }));
      } finally {
        setCommentsLoadingId(null);
      }
    }
  };

  const handleSubmitComment = async (storyId: number, e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const body = (commentDraft[storyId] ?? "").trim();
    if (!body) return;
    setCommentSubmittingId(storyId);
    try {
      const token = await getAccessTokenSilently().catch(() => undefined);
      const payload: FeedStoryCommentCreate = { body };
      if (!token && (commentAuthorName[storyId] ?? "").trim()) {
        payload.author_name = commentAuthorName[storyId]?.trim();
      } else if (token && (commentAuthorName[storyId] ?? "").trim()) {
        payload.author_name = commentAuthorName[storyId]?.trim();
      }
      await addFeedStoryComment(storyId, payload, token);
      invalidateFeedQueries();
      setCommentDraft((prev) => ({ ...prev, [storyId]: "" }));
      setCommentAuthorName((prev) => ({ ...prev, [storyId]: "" }));
      const res = await listFeedStoryComments(storyId);
      setCommentsCache((prev) => ({ ...prev, [storyId]: res.comments }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setCommentSubmittingId(null);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const getRelativeTime = (dateString: string | null | undefined) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffHours < 1) return "Just now";
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return formatDate(dateString);
    } catch {
      return formatDate(dateString);
    }
  };

  const getDistrictLabel = (district: number) => {
    return district === 0 ? "City-wide" : `District ${district}`;
  };

  const getCityDisplay = (story: FeedStory) => {
    const name = story.city_name || citiesList?.find(c => c.city_id === story.city_id)?.city_name || "Unknown";
    const emoji = story.city_emoji || citiesList?.find(c => c.city_id === story.city_id)?.emoji || "🏙️";
    return { name, emoji };
  };

  const getFrequencyLabel = (freq: string | null | undefined) => {
    if (!freq) return null;
    return freq.charAt(0).toUpperCase() + freq.slice(1);
  };

  const getMapTypeLabel = (story: FeedStory): string => {
    const mapType = story.primary_visualization?.map_type;
    const labels: Record<string, string> = {
      point: "Point Map",
      choropleth: "Choropleth",
      symbol: "Symbol Map",
      heatmap: "Heatmap",
      multi_layer: "Multi-Layer Map",
    };
    return labels[mapType as string] || "Map";
  };

  const getVisualizationBadge = (story: FeedStory): string => {
    switch (story.visualization_type) {
      case "chart":
        return "📊 Chart";
      case "map":
        return `🗺️ ${getMapTypeLabel(story)}`;
      case "anomaly":
        return "📈 Anomaly";
      default:
        return "📊 Visualization";
    }
  };

  const getVisualizationPlaceholder = (story: FeedStory): string => {
    switch (story.visualization_type) {
      case "chart":
        return "📊 Chart";
      case "map":
        return `🗺️ ${getMapTypeLabel(story)}`;
      case "anomaly":
        return "📈 Anomaly";
      default:
        return "📊 Visualization";
    }
  };

  const getVisualizationLinkLabel = (story: FeedStory): string => {
    switch (story.visualization_type) {
      case "chart":
        return "Open chart →";
      case "map":
        return "Open map →";
      case "anomaly":
        return "View details →";
      default:
        return "View →";
    }
  };

  /** Full URL for a static image of the visualization (chart, anomaly, or map). Used for feed cards instead of interactive embeds. */
  const getImageUrl = (story: FeedStory, resolvedMapHash?: string | null): string | null => {
    const base = API_BASE.replace(/\/$/, "");
    if (story.image_url) return `${base}${story.image_url}`;
    const pv = story.primary_visualization;
    if (!pv) return null;
    const type = (story.visualization_type || pv.type || "").toLowerCase();
    const id = pv.id;
    const hash = type === "map" ? (resolvedMapHash ?? pv.short_hash) : pv.short_hash;
    if (type === "chart" && id != null) return `${base}/api/time-series/public/${id}/image`;
    if (type === "anomaly" && id != null) return `${base}/api/anomalies/public/result/${id}/image`;
    if (type === "map" && hash) return `${base}/api/maps/public/${hash}/image`;
    return null;
  };

  /** Effective view URL for "open in new tab" (no embeds in feed; link to full view). */
  const getViewUrl = (story: FeedStory, resolvedMapHash?: string | null): string | null => {
    const pv = story.primary_visualization;
    if (!pv) return null;
    const type = (story.visualization_type || pv.type || "").toLowerCase();
    const hash = type === "map" ? (resolvedMapHash ?? pv.short_hash) : pv.short_hash;
    if (type === "map" && hash) return `/m/${hash}`;
    if (pv.view_url && !pv.view_url.startsWith("/map/")) return pv.view_url;
    if (pv.url) return pv.url;
    const id = pv.id;
    if (type === "map" && !hash) return id != null ? `/map/${id}` : null;
    if (type === "chart" && id != null) return `/t/${id}`;
    if (type === "anomaly" && (id != null || hash)) return `/a/${id ?? hash}`;
    return null;
  };

  if (isLoading) {
    return (
      <div className={styles.feedContainer}>
        <div className={styles.loadingState}>
          <Loader size="md" color="dark" />
          <p>Loading feed stories...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.feedContainer}>
        <div className={styles.errorState}>
          <p>Error loading feed stories. Please try again later.</p>
        </div>
      </div>
    );
  }

  const stories = feedData?.stories || [];

  return (
    <div className={styles.feedContainer}>
      <div className={`${styles.feedHeader} dashboard-page-header`}>
        <h1 className={styles.feedTitle}>Feed</h1>
        <p className={styles.feedSubtitle}>
          {personalNewsletterOnly
            ? "Sample newsletters you generated (from Settings)"
            : selectedPlace == null
              ? "Latest civic data stories from all cities"
              : `Stories for ${activeFilterLabel ?? "selected place"}`
          }
        </p>
      </div>

      {/* Admin only: delete actions (use current City/District filter) */}
      {isAdmin && (
        <div className={styles.adminBar}>
          <div className={styles.adminBarActions}>
            <button
              type="button"
              onClick={handleDeleteAllForCity}
              disabled={bulkDeleting || selectedPlace?.city_id == null}
              className={styles.adminDeleteCity}
            >
              {bulkDeleting ? "Deleting…" : "Delete all for city"}
            </button>
            {selectedPlace?.city_id != null && selectedPlace.district != null && (
              <button
                type="button"
                onClick={handleDeleteAllForDistrict}
                disabled={bulkDeleting}
                className={styles.adminDeleteDistrict}
              >
                {bulkDeleting ? "Deleting…" : "Delete all for district"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top-level filter: Personal newsletter vs main feed */}
      <div className={styles.chipBar}>
        <button
          type="button"
          className={`${styles.chip} ${!personalNewsletterOnly ? styles.chipActive : ""}`}
          onClick={() => setPersonalNewsletterOnly(false)}
        >
          All stories
        </button>
        <button
          type="button"
          className={`${styles.chip} ${personalNewsletterOnly ? styles.chipActive : ""}`}
          onClick={() => setPersonalNewsletterOnly(true)}
        >
          Personal newsletter
        </button>
      </div>

      {/* City + District dropdowns for all users (default All / All) */}
      {!personalNewsletterOnly && (
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label htmlFor="feed-city-filter" className={styles.filterLabel}>
              City
            </label>
            <select
              id="feed-city-filter"
              value={selectedPlace?.city_id ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  setSelectedPlace(null);
                  return;
                }
                const cid = parseInt(v, 10);
                setSelectedPlace({ city_id: cid, district: null });
              }}
              className={styles.filterSelect}
            >
              <option value="">All</option>
              {uniqueCities.map((c) => (
                <option key={c.city_id} value={c.city_id}>
                  {c.city_emoji} {c.city_name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label htmlFor="feed-district-filter" className={styles.filterLabel}>
              District
            </label>
            <select
              id="feed-district-filter"
              value={selectedPlace?.district != null ? String(selectedPlace.district) : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (selectedPlace == null) return;
                if (v === "") {
                  setSelectedPlace((prev) => (prev ? { ...prev, district: null } : null));
                  return;
                }
                const d = v === "0" ? 0 : parseInt(v, 10);
                setSelectedPlace((prev) => (prev ? { ...prev, district: d } : null));
              }}
              className={styles.filterSelect}
              disabled={selectedPlace == null}
            >
              <option value="">All</option>
              {selectedPlace != null && (
                <>
                  <option value="0">City-wide</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((d) => (
                    <option key={d} value={d}>
                      District {d}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
          {activeFilterLabel != null && (
            <button
              type="button"
              className={styles.filterPill}
              onClick={() => setSelectedPlace(null)}
              title="Clear filter"
            >
              <span className={styles.filterPillLabel}>{activeFilterLabel}</span>
              <span className={styles.filterPillRemove} aria-hidden>×</span>
            </button>
          )}
        </div>
      )}

      {/* Frequency filter */}
      <div className={styles.secondaryFilters}>
        <div className={styles.filterGroup}>
          <label htmlFor="frequency-filter">Frequency:</label>
          <select
            id="frequency-filter"
            value={selectedFrequency ?? ""}
            onChange={(e) => setSelectedFrequency(e.target.value || null)}
            className={styles.filterSelect}
          >
            <option value="">All</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      {/* Stories */}
      {stories.length === 0 ? (
        <div className={styles.emptyState}>
          <p>
            {personalNewsletterOnly
              ? "No personal newsletter samples yet. Generate one from Settings → Personalized newsletter."
              : "No feed stories found. Check back later for new newsletters!"}
          </p>
        </div>
      ) : (
        <div className={styles.storiesList}>
          {stories.map((story) => {
            const city = getCityDisplay(story);
            return (
              <article
                key={story.id}
                className={styles.storyCard}
                onClick={() => handleStoryClick(story)}
              >
                {/* City actor row */}
                <div className={styles.actorRow}>
                  <button
                    className={styles.actorAvatar}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStoryCityClick(story.city_id, story.district ?? null);
                    }}
                    title={`Filter by ${city.name}${(story.district ?? 0) !== 0 ? ` District ${story.district}` : ""}`}
                  >
                    {city.emoji}
                  </button>
                  <div className={styles.actorInfo}>
                    <button
                      className={styles.actorName}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStoryCityClick(story.city_id, story.district ?? null);
                      }}
                      title={`Filter by ${city.name}${(story.district ?? 0) !== 0 ? ` District ${story.district}` : ""}`}
                    >
                      {city.name}
                    </button>
                    <div className={styles.actorMeta}>
                      <span className={styles.timestamp}>
                        {getRelativeTime(story.published_at || story.story_date)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.actorRight}>
                    <button
                      type="button"
                      className={styles.districtBadgeButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlaceClick({ city_id: story.city_id, district: story.district ?? 0 });
                      }}
                      title={`Filter by ${getDistrictLabel(story.district ?? 0)}`}
                    >
                      {getDistrictLabel(story.district ?? 0)}
                    </button>
                    {story.is_featured && (
                      <span className={styles.featuredBadge}>Featured</span>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        className={styles.storyDeleteBtn}
                        onClick={(e) => handleDeleteStory(story.id, e)}
                        disabled={deletingStoryId === story.id}
                        title="Delete this story"
                      >
                        {deletingStoryId === story.id ? "…" : "Delete"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className={styles.storyContent}>
                  <h2 className={styles.storyHeadline}>{story.headline}</h2>
                  <p className={styles.storyDescription}>{story.description}</p>
                </div>

                {/* Visualization: static image when available (chart/anomaly); otherwise placeholder + link. No interactive embeds in feed. */}
                {story.primary_visualization && (
                  <div className={styles.storyVisualization}>
                    {story.visualization_type && (
                      <div className={styles.vizTypeBadge}>
                        {getVisualizationBadge(story)}
                      </div>
                    )}
                    {(() => {
                      const pv = story.primary_visualization;
                      const isMap = (story.visualization_type || pv?.type) === "map";
                      const mapId = pv?.id != null ? Number(pv.id) : null;
                      const resolvedHash = isMap && mapId != null ? resolvedMapHashes[mapId] : null;
                      const imageUrl = getImageUrl(story, resolvedHash);
                      const viewUrl = getViewUrl(story, resolvedHash);
                      return imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={pv?.title || "Story visualization"}
                          className={styles.visualizationImage}
                          loading="lazy"
                        />
                      ) : viewUrl ? (
                        <a
                          href={viewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.visualizationLink}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className={styles.visualizationPlaceholder}>
                            {getVisualizationPlaceholder(story)}
                            <span className={styles.visualizationLinkText}>
                              {getVisualizationLinkLabel(story)}
                            </span>
                          </div>
                        </a>
                      ) : (
                        <div className={styles.visualizationPlaceholder}>
                          {getVisualizationPlaceholder(story)}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Footer: engagement stats + actions */}
                <div className={styles.storyFooter}>
                  <div className={styles.storyStats} onClick={(e) => e.stopPropagation()}>
                    <span className={styles.storyStat} title="Views">
                      <span className={styles.storyStatIcon} aria-hidden>👁</span>
                      {(story.view_count ?? 0).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      className={styles.likeBtn}
                      onClick={(e) => handleLike(story, e)}
                      title="Like"
                    >
                      <span className={styles.storyStatIcon} aria-hidden>♥</span>
                      {(story.like_count ?? 0).toLocaleString()}
                    </button>
                    <button
                      type="button"
                      className={styles.commentToggleBtn}
                      onClick={(e) => handleToggleComments(story.id, e)}
                      title="Comments"
                    >
                      <span className={styles.storyStatIcon} aria-hidden>💬</span>
                      {(story.comment_count ?? 0).toLocaleString()}
                    </button>
                  </div>
                  <button
                    className={styles.readMoreBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStoryClick(story);
                    }}
                  >
                    {story.cta_label ?? "Read full report"} →
                  </button>
                  <button
                    className={styles.shareBtn}
                    onClick={(e) => handleShare(story, e)}
                    title="Share story"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 10C5.10457 10 6 9.10457 6 8C6 6.89543 5.10457 6 4 6C2.89543 6 2 6.89543 2 8C2 9.10457 2.89543 10 4 10Z" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M12 6C13.1046 6 14 5.10457 14 4C14 2.89543 13.1046 2 12 2C10.8954 2 10 2.89543 10 4C10 5.10457 10.8954 6 12 6Z" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M5.7 9.1L10.3 11.4" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M10.3 4.6L5.7 6.9" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                    Share
                  </button>
                </div>

                {/* Expandable comments */}
                {commentsExpandedId === story.id && (
                  <div
                    className={styles.commentsPanel}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {commentsLoadingId === story.id ? (
                      <p className={styles.commentsLoading}>Loading comments…</p>
                    ) : (
                      <>
                        <ul className={styles.commentsList}>
                          {(commentsCache[story.id] ?? []).length === 0 ? (
                            <li className={styles.commentsEmpty}>No comments yet. Be the first!</li>
                          ) : (
                            (commentsCache[story.id] ?? []).map((c) => (
                              <li key={c.id} className={styles.commentItem}>
                                <span className={styles.commentAuthor}>
                                  {c.author_name || "Anonymous"}
                                </span>
                                <span className={styles.commentTime}>
                                  {c.created_at ? getRelativeTime(c.created_at) : ""}
                                </span>
                                <p className={styles.commentBody}>{c.body}</p>
                              </li>
                            ))
                          )}
                        </ul>
                        <form
                          className={styles.commentForm}
                          onSubmit={(e) => handleSubmitComment(story.id, e)}
                        >
                          <input
                            type="text"
                            className={styles.commentAuthorInput}
                            placeholder="Your name (required when not logged in)"
                            value={commentAuthorName[story.id] ?? ""}
                            onChange={(e) =>
                              setCommentAuthorName((prev) => ({ ...prev, [story.id]: e.target.value }))
                            }
                            maxLength={255}
                          />
                          <textarea
                            className={styles.commentTextarea}
                            placeholder="Write a comment…"
                            value={commentDraft[story.id] ?? ""}
                            onChange={(e) =>
                              setCommentDraft((prev) => ({ ...prev, [story.id]: e.target.value }))
                            }
                            rows={2}
                            maxLength={2000}
                            required
                          />
                          <button
                            type="submit"
                            className={styles.commentSubmitBtn}
                            disabled={commentSubmittingId === story.id}
                          >
                            {commentSubmittingId === story.id ? "Posting…" : "Post comment"}
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Load more: show when we got a full page (may have more) */}
      {!isLoading && stories.length > 0 && stories.length >= displayLimit && (
        <div className={styles.loadMoreWrap}>
          <button
            type="button"
            className={styles.loadMoreBtn}
            onClick={() => setDisplayLimit((prev) => prev + 10)}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
