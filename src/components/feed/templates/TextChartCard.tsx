"use client";

import { useState } from "react";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface TextChartCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode; // action bar
}

export default function TextChartCard({ story, children }: TextChartCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const showImage = story.image_url_resolved && !imgFailed;

  return (
    <>
      <CardHeader
        typeIcon={story.type_icon}
        typeLabel={story.type_label}
        actor={story.actor}
        subline={story.subline}
        neighborhoodLabel={story.neighborhood_label}
      />
      <h2 className={styles.cardHeadline}>{story.headline}</h2>
      {story.cleaned_description && (
        <p className={styles.cardDescription}>{story.cleaned_description}</p>
      )}

      <div className={styles.vizArea}>
        {showImage ? (
          <img
            src={story.image_url_resolved!}
            alt={story.headline}
            className={styles.vizImage}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : story.embed_url_resolved ? (
          <iframe
            src={story.embed_url_resolved}
            title={story.headline}
            className={styles.vizIframeThumb}
            loading="lazy"
          />
        ) : (
          <div className={styles.vizPlaceholder}>
            <span style={{ fontSize: 28, display: "block", marginBottom: 6 }}>📊</span>
            View chart →
          </div>
        )}
      </div>

      {children}
    </>
  );
}
