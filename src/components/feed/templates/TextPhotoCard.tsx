"use client";

import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface TextPhotoCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode; // action bar
}

export default function TextPhotoCard({ story, children }: TextPhotoCardProps) {
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

      <div className={`${styles.vizArea} ${styles.vizAreaPhoto}`}>
        {story.image_url_resolved ? (
          <img
            src={story.image_url_resolved}
            alt={story.headline}
            className={`${styles.vizImage} ${styles.vizImagePhoto}`}
            loading="lazy"
          />
        ) : (
          <div className={styles.vizPlaceholder}>{"\u{1F4F8}"} Photo</div>
        )}
      </div>

      {children}
    </>
  );
}
