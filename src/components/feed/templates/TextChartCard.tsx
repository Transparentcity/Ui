"use client";

import { useState } from "react";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import LazyVizEmbed from "../LazyVizEmbed";
import styles from "../feed.module.css";

interface TextChartCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode; // action bar
}

export default function TextChartCard({ story, children }: TextChartCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const meta = story.metadata ?? {};
  const isMapFocus = meta.map_focus === true;
  const hotspots = (meta.hotspot_neighborhoods as string[] | undefined) ?? [];

  // Prefer static PNG image (fast) over iframe embed (slow). Fall back to
  // iframe only when the backend didn't generate an image URL.
  const hasImage = !!story.image_url_resolved && !imgFailed;
  const hasEmbed = !hasImage && !!story.embed_url_resolved;

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

      <div className={`${styles.vizArea} ${isMapFocus ? styles.vizAreaMapFocus : ""}`}>
        {hasImage ? (
          <img
            src={story.image_url_resolved!}
            alt={story.headline}
            className={`${styles.vizImage} ${isMapFocus ? styles.vizImageMapFocus : ""}`}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : hasEmbed ? (
          <LazyVizEmbed
            src={story.embed_url_resolved!}
            title={story.headline}
            className={isMapFocus ? styles.vizIframeMapFocus : undefined}
          />
        ) : (
          <div className={styles.vizPlaceholder}>
            <span style={{ fontSize: 28, display: "block", marginBottom: 6 }}>📊</span>
            View chart →
          </div>
        )}
      </div>

      {/* Hotspot neighborhood chips for map-focused stories */}
      {isMapFocus && hotspots.length > 0 && (
        <div className={styles.mapHotspots}>
          {hotspots.slice(0, 3).map((name) => (
            <span key={name} className={styles.mapHotspotChip}>{name}</span>
          ))}
        </div>
      )}

      {children}
    </>
  );
}
