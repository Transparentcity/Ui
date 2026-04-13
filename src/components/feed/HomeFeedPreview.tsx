"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { listPublicFeedStories } from "@/lib/apiClient";
import { enrichStory, type EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { resolveCanonicalUrl } from "@/lib/feed/canonicalUrl";
import CardHeader from "./CardHeader";
import MetricSummaryCard, { type MetricCardData } from "./templates/MetricSummaryCard";
import styles from "./feed.module.css";
import homeStyles from "./homeFeedPreview.module.css";

const DISPLAY_COUNT = 10;

interface HomeFeedPreviewProps {
  /** Pre-fetched stories from the server (SSR). Skips client fetch when provided. */
  initialStories?: EnrichedFeedStory[];
  /** Pre-fetched metric cards to interleave in the feed preview. */
  metricCards?: MetricCardData[];
}

/**
 * Renders up to 10 curated public feed cards on the logged-out home page.
 * When initialStories are provided (SSR), renders instantly with no loading state.
 * Falls back to client-side fetch when no initial data is available.
 */
export default function HomeFeedPreview({ initialStories, metricCards = [] }: HomeFeedPreviewProps) {
  const hasInitial = initialStories && initialStories.length > 0;
  const [stories, setStories] = useState<EnrichedFeedStory[]>(hasInitial ? initialStories : []);
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Skip client fetch if server already provided stories
    if (hasInitial) return;

    let cancelled = false;

    async function load() {
      try {
        const res = await listPublicFeedStories({
          limit: DISPLAY_COUNT,
          order_by: "published_at",
        });
        if (cancelled) return;

        const enriched = (res.stories ?? []).map((s) => enrichStory(s));
        setStories(enriched.slice(0, DISPLAY_COUNT));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [hasInitial]);

  if (error || (!loading && stories.length === 0)) return null;

  return (
    <div className={homeStyles.previewGrid}>
      {loading
        ? Array.from({ length: DISPLAY_COUNT }).map((_, i) => (
            <div key={i} className={homeStyles.previewCard} role="article" aria-label="Loading story">
              <div className={homeStyles.skeletonHeader} />
              <div className={homeStyles.skeletonHeadline} />
              <div className={homeStyles.skeletonBody} />
              <div className={homeStyles.skeletonBody} style={{ width: "60%" }} />
            </div>
          ))
        : stories.map((story, idx) => {
            // Interleave a metric card every 5th position
            const metricIdx = idx >= 4 && (idx - 4) % 5 === 0
              ? Math.floor((idx - 4) / 5)
              : -1;
            const metricCard =
              metricIdx >= 0 && metricIdx < metricCards.length
                ? metricCards[metricIdx]
                : null;
            return (
              <Fragment key={story.id}>
                {metricCard && (
                  <MetricSummaryCard data={metricCard} />
                )}
                <Link
                  href={resolveCanonicalUrl(story)}
                  className={homeStyles.previewCard}
                >
                  <CardHeader
                    typeIcon={story.type_icon}
                    typeLabel={story.type_label}
                    actor={story.actor}
                    subline={story.subline}
                    neighborhoodLabel={story.neighborhood_label}
                  />
                  <h3 className={styles.cardHeadline}>{story.headline}</h3>
                  {story.cleaned_description && (
                    <p className={styles.cardDescription}>
                      {story.cleaned_description}
                    </p>
                  )}
                </Link>
              </Fragment>
            );
          })}
    </div>
  );
}
