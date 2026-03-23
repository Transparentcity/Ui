"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listPublicFeedStories } from "@/lib/apiClient";
import { enrichStory, type EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "./CardHeader";
import styles from "./feed.module.css";
import homeStyles from "./homeFeedPreview.module.css";

/**
 * Renders 6 recent public feed cards on the logged-out home page.
 * Uses the public (no-auth) feed endpoint and a simplified card
 * layout without action bars or interactive features.
 */
export default function HomeFeedPreview() {
  const [stories, setStories] = useState<EnrichedFeedStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await listPublicFeedStories({
          limit: 6,
          order_by: "published_at",
        });
        if (cancelled) return;

        const enriched = res.stories.map((s) => enrichStory(s));
        setStories(enriched.slice(0, 6));
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
  }, []);

  if (error || (!loading && stories.length === 0)) return null;

  return (
    <div className={homeStyles.previewGrid}>
      {loading
        ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={homeStyles.previewCard}>
              <div className={homeStyles.skeletonHeader} />
              <div className={homeStyles.skeletonHeadline} />
              <div className={homeStyles.skeletonBody} />
              <div className={homeStyles.skeletonBody} style={{ width: "60%" }} />
            </div>
          ))
        : stories.map((story) => (
            <Link
              key={story.id}
              href={`/feed/${story.id}`}
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
              <span className={homeStyles.previewCta}>
                Read more &rarr;
              </span>
            </Link>
          ))}
    </div>
  );
}
