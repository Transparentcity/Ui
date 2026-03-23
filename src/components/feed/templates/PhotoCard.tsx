"use client";

import { useState } from "react";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface PhotoCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
}

export default function PhotoCard({ story, children }: PhotoCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const meta = story.metadata ?? {};

  // Derive category from headline or metadata
  const category = (meta.complaint_category as string) ||
    (story.headline?.match(/pothole|graffiti|sidewalk|litter|noise|rodent|blocked/i)?.[0] ?? "311 Report");

  // Derive status
  const status = (meta.complaint_status as string) ?? "Open";
  const statusLower = status.toLowerCase();
  const statusClass = statusLower === "resolved" || statusLower === "closed"
    ? styles.statusResolved
    : statusLower.includes("progress")
      ? styles.statusInProgress
      : styles.statusOpen;
  const statusColor = statusLower === "resolved" || statusLower === "closed"
    ? "var(--success)"
    : statusLower.includes("progress")
      ? "#60a5fa"
      : "var(--warning)";

  const location = (meta.complaint_address as string) ?? null;
  const agency = (meta.assigned_agency as string) ?? null;
  const resolutionDays = meta.resolution_days as number | undefined;

  const showImage = story.image_url_resolved && !imgFailed;

  return (
    <>
      {/* Photo hero */}
      <div className={styles.photoHero}>
        {showImage ? (
          <img
            src={story.image_url_resolved!}
            alt={story.headline}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 28 }}>
            {"\u{1F4F8}"}
          </div>
        )}
        <span className={styles.categoryBadge}>{category}</span>
      </div>

      <CardHeader
        typeIcon={story.type_icon}
        typeLabel={story.type_label}
        actor={story.actor}
        subline={story.subline}
        neighborhoodLabel={story.neighborhood_label}
      />

      <div className={styles.photoBody}>
        <div className={styles.statusRow}>
          <div className={`${styles.statusDot} ${statusClass}`} />
          <span className={styles.statusText} style={{ color: statusColor }}>{status}</span>
        </div>

        {location && <div className={styles.complaintLocation}>{location}</div>}

        <div className={styles.complaintMeta}>
          {story.subline && (
            <span>
              <span className={styles.complaintMetaLabel}>Filed: </span>
              {story.subline}
            </span>
          )}
          {agency && (
            <span>
              <span className={styles.complaintMetaLabel}>Agency: </span>
              {agency}
            </span>
          )}
        </div>

        {resolutionDays != null && (statusLower === "resolved" || statusLower === "closed") && (
          <div className={styles.resolvedBadge}>
            {"\u2713"} Resolved in {resolutionDays} days
          </div>
        )}
      </div>

      {children}
    </>
  );
}
