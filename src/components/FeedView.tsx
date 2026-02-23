"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFeedStories, useCityFeedStories, useTrackFeedEngagement, type FeedStory } from "@/lib/hooks/useFeed";
import { useCities } from "@/lib/hooks/useCities";
import Loader from "./Loader";
import styles from "./FeedView.module.css";

interface FeedViewProps {
  cityId?: number | null;
  district?: number | null;
}

export default function FeedView({ cityId, district }: FeedViewProps) {
  const router = useRouter();
  const [selectedCityId, setSelectedCityId] = useState<number | null>(cityId ?? null);
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(district ?? null);
  const [selectedFrequency, setSelectedFrequency] = useState<string | null>(null);
  const { data: citiesList } = useCities();
  const trackEngagement = useTrackFeedEngagement();

  const { data: feedData, isLoading, error } = selectedCityId
    ? useCityFeedStories(selectedCityId, {
        district: selectedDistrict,
        newsletter_frequency: selectedFrequency ?? undefined,
        limit: 50,
        order_by: "published_at",
      })
    : useFeedStories({
        city_id: selectedCityId ?? undefined,
        district: selectedDistrict ?? undefined,
        newsletter_frequency: selectedFrequency ?? undefined,
        limit: 50,
        order_by: "published_at",
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

  // Derive unique cities from the feed data for filter chips
  const feedCities = useMemo(() => {
    if (!feedData?.stories) return [];
    const cityMap = new Map<number, { id: number; name: string; emoji: string }>();
    for (const story of feedData.stories) {
      if (!cityMap.has(story.city_id)) {
        cityMap.set(story.city_id, {
          id: story.city_id,
          name: story.city_name || citiesList?.find(c => c.city_id === story.city_id)?.city_name || "Unknown",
          emoji: story.city_emoji || citiesList?.find(c => c.city_id === story.city_id)?.emoji || "🏙️",
        });
      }
    }
    return Array.from(cityMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [feedData?.stories, citiesList]);

  const handleCityChipClick = (chipCityId: number) => {
    if (selectedCityId === chipCityId) {
      setSelectedCityId(null);
      setSelectedDistrict(null);
    } else {
      setSelectedCityId(chipCityId);
      setSelectedDistrict(null);
    }
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
        return "📊 View Chart";
      case "map":
        return `🗺️ View ${getMapTypeLabel(story)}`;
      case "anomaly":
        return "📈 View Anomaly";
      default:
        return "📊 View Visualization";
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
          Latest civic data stories across your cities
        </p>
      </div>

      {/* City filter chips */}
      {feedCities.length > 1 && (
        <div className={styles.chipBar}>
          <button
            className={`${styles.chip} ${selectedCityId === null ? styles.chipActive : ""}`}
            onClick={() => { setSelectedCityId(null); setSelectedDistrict(null); }}
          >
            All Cities
          </button>
          {feedCities.map((city) => (
            <button
              key={city.id}
              className={`${styles.chip} ${selectedCityId === city.id ? styles.chipActive : ""}`}
              onClick={() => handleCityChipClick(city.id)}
            >
              <span className={styles.chipEmoji}>{city.emoji}</span>
              {city.name}
            </button>
          ))}
        </div>
      )}

      {/* Secondary filters row */}
      {(selectedCityId || selectedFrequency) && (
        <div className={styles.secondaryFilters}>
          {selectedCityId && (
            <div className={styles.filterGroup}>
              <label htmlFor="district-filter">District:</label>
              <select
                id="district-filter"
                value={selectedDistrict ?? ""}
                onChange={(e) => setSelectedDistrict(e.target.value ? Number(e.target.value) : null)}
                className={styles.filterSelect}
              >
                <option value="">All Districts</option>
                <option value="0">City-wide</option>
                {Array.from({ length: 11 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    District {d}
                  </option>
                ))}
              </select>
            </div>
          )}
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
      )}

      {/* Stories */}
      {stories.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No feed stories found. Check back later for new newsletters!</p>
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
                      handleCityChipClick(story.city_id);
                    }}
                    title={`Filter by ${city.name}`}
                  >
                    {city.emoji}
                  </button>
                  <div className={styles.actorInfo}>
                    <button
                      className={styles.actorName}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCityChipClick(story.city_id);
                      }}
                      title={`Filter by ${city.name}`}
                    >
                      {city.name}
                    </button>
                    <div className={styles.actorMeta}>
                      <span className={styles.timestamp}>
                        {getRelativeTime(story.published_at || story.story_date)}
                      </span>
                      {story.newsletter_frequency && (
                        <>
                          <span className={styles.metaDot}>·</span>
                          <span className={styles.frequencyTag}>
                            {getFrequencyLabel(story.newsletter_frequency)}
                          </span>
                        </>
                      )}
                      {story.district !== undefined && (
                        <>
                          <span className={styles.metaDot}>·</span>
                          <span className={styles.districtTag}>
                            {getDistrictLabel(story.district)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {story.is_featured && (
                    <span className={styles.featuredBadge}>Featured</span>
                  )}
                </div>

                {/* Content */}
                <div className={styles.storyContent}>
                  <h2 className={styles.storyHeadline}>{story.headline}</h2>
                  <p className={styles.storyDescription}>{story.description}</p>
                </div>

                {/* Visualization */}
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
                          <span className={styles.visualizationLinkText}>View →</span>
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
                    Read Full Report →
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
    </div>
  );
}
