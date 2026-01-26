"use client";

import { useState, useEffect, useRef } from "react";
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

  // Use city-specific feed if city is selected, otherwise use general feed
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

  // Track view engagement once per story (use ref to track which stories we've already viewed)
  const viewedStoriesRef = useRef<Set<number>>(new Set());
  
  useEffect(() => {
    if (feedData?.stories) {
      feedData.stories.forEach((story) => {
        // Only track view if we haven't already tracked it
        if (!viewedStoriesRef.current.has(story.id)) {
          viewedStoriesRef.current.add(story.id);
          trackEngagement.mutate({ storyId: story.id, action: "view" });
        }
      });
    }
  }, [feedData?.stories]); // Remove trackEngagement from deps - mutations are stable

  const handleStoryClick = (story: FeedStory) => {
    // Track click engagement
    trackEngagement.mutate({ storyId: story.id, action: "click" });
    
    // Navigate to research report
    if (story.detail_url) {
      router.push(story.detail_url);
    }
  };

  const handleShare = (story: FeedStory, e: React.MouseEvent) => {
    e.stopPropagation();
    trackEngagement.mutate({ storyId: story.id, action: "share" });
    
    // Copy link to clipboard
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

  const getDistrictLabel = (district: number) => {
    return district === 0 ? "City-wide" : `District ${district}`;
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
          Stories from weekly and monthly newsletters
        </p>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label htmlFor="city-filter">City:</label>
          <select
            id="city-filter"
            value={selectedCityId ?? ""}
            onChange={(e) => setSelectedCityId(e.target.value ? Number(e.target.value) : null)}
            className={styles.filterSelect}
          >
            <option value="">All Cities</option>
            {citiesList?.map((city) => (
              <option key={city.city_id} value={city.city_id}>
                {city.city_name}
              </option>
            ))}
          </select>
        </div>

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

      {/* Stories List */}
      {stories.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No feed stories found. Check back later for new newsletters!</p>
        </div>
      ) : (
        <div className={styles.storiesList}>
          {stories.map((story) => (
            <div
              key={story.id}
              className={styles.storyCard}
              onClick={() => handleStoryClick(story)}
            >
              <div className={styles.storyHeader}>
                <h2 className={styles.storyHeadline}>{story.headline}</h2>
                {story.is_featured && (
                  <span className={styles.featuredBadge}>Featured</span>
                )}
              </div>

              <div className={styles.storyMeta}>
                <span className={styles.storyDate}>
                  {formatDate(story.published_at || story.story_date)}
                </span>
                {story.newsletter_frequency && (
                  <span className={styles.storyFrequency}>
                    {story.newsletter_frequency}
                  </span>
                )}
                {story.district !== undefined && (
                  <span className={styles.storyDistrict}>
                    {getDistrictLabel(story.district)}
                  </span>
                )}
              </div>

              <p className={styles.storyDescription}>{story.description}</p>

              {story.primary_visualization && (
                <div className={styles.storyVisualization}>
                  {story.primary_visualization.embed_url ? (
                    <iframe
                      src={story.primary_visualization.embed_url}
                      title={story.primary_visualization.title || "Visualization"}
                      className={styles.visualizationIframe}
                      frameBorder="0"
                      scrolling="no"
                      allowFullScreen
                      loading="lazy"
                      sandbox="allow-scripts allow-same-origin allow-popups"
                    />
                  ) : story.primary_visualization.url ? (
                    <a
                      href={story.primary_visualization.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.visualizationLink}
                    >
                      <div className={styles.visualizationPlaceholder}>
                        {story.visualization_type === "chart" && "📊 Chart"}
                        {story.visualization_type === "map" && "🗺️ Map"}
                        {story.visualization_type === "anomaly_chart" && "📈 Anomaly Chart"}
                        {!story.visualization_type && "📊 Visualization"}
                        <span className={styles.visualizationLinkText}>View →</span>
                      </div>
                    </a>
                  ) : (
                    <div className={styles.visualizationPlaceholder}>
                      {story.visualization_type === "chart" && "📊 Chart"}
                      {story.visualization_type === "map" && "🗺️ Map"}
                      {story.visualization_type === "anomaly_chart" && "📈 Anomaly Chart"}
                      {!story.visualization_type && "📊 Visualization"}
                    </div>
                  )}
                </div>
              )}

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
                  🔗 Share
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
