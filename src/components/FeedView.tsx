"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth0 } from "@auth0/auth0-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFeedStories, useTrackFeedEngagement, useFeedPlaces, type FeedStory } from "@/lib/hooks/useFeed";
import { useCities } from "@/lib/hooks/useCities";
import {
  listCitiesWithFeedStories,
  deleteFeedStory,
  deleteFeedStoriesByCity,
  type CityWithFeedStories,
} from "@/lib/apiClient";
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
  const canAdminFeed = isAdmin || cityLeadCityIds.length > 0;

  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace>(() =>
    cityId != null ? { city_id: cityId, district: district ?? null } : null
  );
  const [selectedFrequency, setSelectedFrequency] = useState<string | null>(null);
  /** When true, show only stories from "Generate example newsletter" (personal_newsletter category). */
  const [personalNewsletterOnly, setPersonalNewsletterOnly] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(10);
  const { data: citiesList } = useCities();
  const { data: placesData } = useFeedPlaces();
  const trackEngagement = useTrackFeedEngagement();

  // Admin: cities with feed stories for dropdown
  const [adminCities, setAdminCities] = useState<CityWithFeedStories[]>([]);
  const [adminCityId, setAdminCityId] = useState<number | null>(null);
  const [adminDistrict, setAdminDistrict] = useState<string>("");
  const [loadingAdminCities, setLoadingAdminCities] = useState(false);
  const [deletingStoryId, setDeletingStoryId] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadAdminCities = useCallback(async () => {
    if (!canAdminFeed) return;
    setLoadingAdminCities(true);
    try {
      const token = await getAccessTokenSilently();
      const list = await listCitiesWithFeedStories(token);
      setAdminCities(Array.isArray(list) ? list : []);
      if (Array.isArray(list) && list.length > 0 && adminCityId == null) {
        setAdminCityId(list[0].city_id);
      }
    } catch {
      setAdminCities([]);
    } finally {
      setLoadingAdminCities(false);
    }
  }, [canAdminFeed, getAccessTokenSilently, adminCityId]);

  useEffect(() => {
    if (canAdminFeed) loadAdminCities();
  }, [canAdminFeed, loadAdminCities]);

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
    if (adminCityId == null) return;
    if (!confirm("Delete all feed stories for this city? This cannot be undone.")) return;
    setBulkDeleting(true);
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStoriesByCity(adminCityId, token);
      invalidateFeedQueries();
      await loadAdminCities();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete stories");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDeleteAllForDistrict = async () => {
    if (adminCityId == null) return;
    const districtNum =
      adminDistrict === "citywide" ? 0 : adminDistrict === "" ? null : parseInt(adminDistrict, 10);
    if (districtNum === null || isNaN(districtNum)) {
      alert("Select a district first.");
      return;
    }
    const label = districtNum === 0 ? "city-wide" : `district ${districtNum}`;
    if (!confirm(`Delete all feed stories for ${label}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStoriesByCity(adminCityId, token, districtNum);
      invalidateFeedQueries();
      await loadAdminCities();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete stories");
    } finally {
      setBulkDeleting(false);
    }
  };

  const places = placesData?.places ?? [];

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

  const isPlaceSelected = (p: { city_id: number; district: number }) =>
    selectedPlace?.city_id === p.city_id && selectedPlace?.district === p.district;

  const handlePlaceClick = (place: { city_id: number; district: number }) => {
    setSelectedPlace((prev) =>
      prev?.city_id === place.city_id && prev?.district === place.district
        ? null
        : { city_id: place.city_id, district: place.district }
    );
  };

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

  /** Effective embed URL for iframe: use stored embed_url, or derive from short_hash/id for maps/charts/anomalies so embeds work when backend did not persist embed_url (e.g. older refs or generate_map without save). */
  const getEmbedUrl = (story: FeedStory): string | null => {
    const pv = story.primary_visualization;
    if (!pv) return null;
    if (pv.embed_url) return pv.embed_url;
    const type = (story.visualization_type || pv.type || "").toLowerCase();
    const hash = pv.short_hash;
    const id = pv.id;
    if (type === "map" && hash) return `/m/${hash}?embedded=true`;
    if (type === "chart" && id != null) return `/t/${id}?embedded=true`;
    if (type === "anomaly" && (id != null || hash)) return `/a/${id ?? hash}?embedded=true`;
    return null;
  };

  /** Effective view URL for "open in new tab" when embed_url is missing. */
  const getViewUrl = (story: FeedStory): string | null => {
    const pv = story.primary_visualization;
    if (!pv) return null;
    if (pv.view_url) return pv.view_url;
    if (pv.url) return pv.url;
    const type = (story.visualization_type || pv.type || "").toLowerCase();
    const hash = pv.short_hash;
    const id = pv.id;
    if (type === "map" && hash) return `/m/${hash}`;
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
              : `Stories for ${places.find((p) => isPlaceSelected(p))?.label ?? "selected place"}`
          }
        </p>
      </div>

      {/* Admin: filter by city/district and delete */}
      {canAdminFeed && (
        <div className={styles.adminBar}>
          <div className={styles.adminBarRow}>
            <label htmlFor="feed-admin-city" className={styles.adminLabel}>
              City
            </label>
            <select
              id="feed-admin-city"
              value={adminCityId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                const cid = v ? parseInt(v, 10) : null;
                setAdminCityId(cid);
                if (cid != null)
                  setSelectedPlace({
                    city_id: cid,
                    district: adminDistrict === "citywide" ? 0 : adminDistrict ? parseInt(adminDistrict, 10) : null,
                  });
              }}
              className={styles.adminSelect}
              disabled={loadingAdminCities}
            >
              <option value="">
                {loadingAdminCities ? "Loading…" : "Select city"}
              </option>
              {adminCities.map((c) => (
                <option key={c.city_id} value={c.city_id}>
                  {c.state ? `${c.city_name}, ${c.state}` : c.city_name}
                  {c.story_count != null ? ` (${c.story_count})` : ""}
                </option>
              ))}
            </select>
            <label htmlFor="feed-admin-district" className={styles.adminLabel}>
              District
            </label>
            <select
              id="feed-admin-district"
              value={adminDistrict}
              onChange={(e) => {
                const v = e.target.value;
                setAdminDistrict(v);
                if (adminCityId != null)
                  setSelectedPlace({
                    city_id: adminCityId,
                    district: v === "citywide" ? 0 : v ? parseInt(v, 10) : null,
                  });
              }}
              className={styles.adminSelect}
              disabled={!adminCityId}
            >
              <option value="">All</option>
              <option value="citywide">City-wide</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((d) => (
                <option key={d} value={String(d)}>
                  District {d}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.adminBarActions}>
            <button
              type="button"
              onClick={handleDeleteAllForCity}
              disabled={bulkDeleting || !adminCityId}
              className={styles.adminDeleteCity}
            >
              {bulkDeleting ? "Deleting…" : "Delete all for city"}
            </button>
            {adminCityId != null && adminDistrict !== "" && (
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

      {/* Place filter: All + actual cities/districts (only when not in Personal newsletter view) */}
      {!personalNewsletterOnly && (
      <div className={styles.chipBar}>
        <button
          type="button"
          className={`${styles.chip} ${selectedPlace === null ? styles.chipActive : ""}`}
          onClick={() => setSelectedPlace(null)}
        >
          All
        </button>
        {places.map((place) => (
          <button
            key={`${place.city_id}-${place.district}`}
            type="button"
            className={`${styles.chip} ${isPlaceSelected(place) ? styles.chipActive : ""}`}
            onClick={() => handlePlaceClick(place)}
          >
            <span className={styles.chipEmoji}>{place.city_emoji}</span>
            {place.label}
          </button>
        ))}
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
                    <span className={styles.districtBadge} title={(story.district ?? 0) === 0 ? "City-wide story" : `District ${story.district} story`}>
                      {getDistrictLabel(story.district ?? 0)}
                    </span>
                    {story.is_featured && (
                      <span className={styles.featuredBadge}>Featured</span>
                    )}
                    {canAdminFeed && (
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

                {/* Visualization: chart or map with clear link when available. Embed URL is derived from short_hash when not stored (e.g. district business stories with map refs). */}
                {story.primary_visualization && (
                  <div className={styles.storyVisualization}>
                    {story.visualization_type && (
                      <div className={styles.vizTypeBadge}>
                        {getVisualizationBadge(story)}
                      </div>
                    )}
                    {getEmbedUrl(story) ? (
                      <iframe
                        src={getEmbedUrl(story)!}
                        title={story.primary_visualization.title || "Visualization"}
                        className={`${styles.visualizationIframe} ${
                          story.visualization_type === "map"
                            ? styles.visualizationIframeMap
                            : story.visualization_type === "anomaly"
                            ? styles.visualizationIframeAnomaly
                            : ""
                        }`}
                        frameBorder="0"
                        scrolling="no"
                        allowFullScreen
                        loading="lazy"
                        sandbox="allow-scripts allow-same-origin allow-popups"
                      />
                    ) : getViewUrl(story) ? (
                      <a
                        href={getViewUrl(story)!}
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
                    )}
                  </div>
                )}

                {/* Footer actions */}
                <div className={styles.storyFooter}>
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
