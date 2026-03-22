"use client";

import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface TextOnlyCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode; // action bar
}

export default function TextOnlyCard({ story, children }: TextOnlyCardProps) {
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
      {children}
    </>
  );
}
