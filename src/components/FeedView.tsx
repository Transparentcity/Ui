"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFeedStories, useTrackFeedEngagement, useFeedPlaces, type FeedStory } from "@/lib/hooks/useFeed";
import { useCities } from "@/lib/hooks/useCities";
import Loader from "./Loader";
import styles from "./FeedView.module.css";

interface FeedViewProps {
  cityId?: number | null;
  district?: number | null;
}

/** Selected place filter: null = All; otherwise filter by this (city_id, district). */
type SelectedPlace = { city_id: number; district: number } | null;

export default function FeedView({ cityId, district }: FeedViewProps) {
  const router = useRouter();
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace>(() =>
    cityId != null ? { city_id: cityId, district: district ?? 0 } : null
  );
  const [selectedFrequency, setSelectedFrequency] = useState<string | null>(null);
  /** When true, show only stories from "Generate example newsletter" (personal_newsletter category). */
  const [personalNewsletterOnly, setPersonalNewsletterOnly] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(10);
  const { data: citiesList } = useCities();
  const { data: placesData } = useFeedPlaces();
  const trackEngagement = useTrackFeedEngagement();

  const places = placesData?.places ?? [];

  // Reset to first page when filters change
  useEffect(() => {
    setDisplayLimit(10);
  }, [selectedPlace, selectedFrequency, personalNewsletterOnly]);

  // Feed: when "Personal newsletter" is on, filter by category; otherwise filter by place/frequency
  const { data: feedData, isLoading, error } = useFeedStories({
    city_id: personalNewsletterOnly ? undefined : selectedPlace?.city_id,
    district: personalNewsletterOnly ? undefined : (selectedPlace != null ? selectedPlace.district : undefined),
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
      <div className={styles.feedHeader}>
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
                  </div>
                </div>

                {/* Content */}
                <div className={styles.storyContent}>
                  <h2 className={styles.storyHeadline}>{story.headline}</h2>
                  <p className={styles.storyDescription}>{story.description}</p>
                </div>

                {/* Visualization: chart or map with clear link when available */}
                {story.primary_visualization && (
                  <div className={styles.storyVisualization}>
                    {story.visualization_type && (
                      <div className={styles.vizTypeBadge}>
                        {getVisualizationBadge(story)}
                      </div>
                    )}
                    {story.primary_visualization.embed_url ? (
                      <iframe
                        src={story.primary_visualization.embed_url}
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
                    ) : story.primary_visualization.view_url || story.primary_visualization.url ? (
                      <a
                        href={story.primary_visualization.view_url || story.primary_visualization.url}
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
