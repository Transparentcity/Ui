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

/**
 * Returns true when the image_url points to a real photo (311, street view,
 * DALL-E, etc.) rather than a server-generated chart/map PNG.  Photos should
 * still render as <img>; chart/map PNGs are replaced by live iframe embeds.
 */
function isPhotoImage(url: string | null): boolean {
  if (!url) return false;
  if (url.includes("/api/time-series/")) return false;
  if (url.includes("/api/anomalies/")) return false;
  if (url.includes("/api/maps/")) return false;
  return true;
}

export default function TextChartCard({ story, children }: TextChartCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const meta = story.metadata ?? {};
  const isMapFocus = meta.map_focus === true;
  const hotspots = (meta.hotspot_neighborhoods as string[] | undefined) ?? [];

  const hasEmbed = !!story.embed_url_resolved;
  const hasPhoto = isPhotoImage(story.image_url_resolved) && !imgFailed;

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
        {hasEmbed ? (
          <LazyVizEmbed
            src={story.embed_url_resolved!}
            title={story.headline}
            className={isMapFocus ? styles.vizIframeMapFocus : undefined}
          />
        ) : hasPhoto ? (
          <img
            src={story.image_url_resolved!}
            alt={story.headline}
            className={`${styles.vizImage} ${isMapFocus ? styles.vizImageMapFocus : ""}`}
            loading="lazy"
            onError={() => setImgFailed(true)}
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
