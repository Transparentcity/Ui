"use client";

import { useState } from "react";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface PhotoCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
  /** "311" for full 311-specific layout, "generic" for simple text+photo. */
  variant?: "311" | "generic";
}

export default function PhotoCard({ story, children, variant }: PhotoCardProps) {
  // Generic variant: simple header + headline + description + photo
  if (variant === "generic") {
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

  // Calculate days open for unresolved complaints
  const filedDate = (meta.filed_date ?? story.story_date) as string | undefined;
  const daysOpen = (() => {
    if (statusLower !== "open" || !filedDate) return null;
    const time = new Date(filedDate).getTime();
    return isNaN(time) ? null : Math.floor((Date.now() - time) / 86400000);
  })();

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

        {/* Resolution status overlay */}
        {(statusLower === "resolved" || statusLower === "closed") && (
          <div className={styles.photoResolutionBadge}>
            <span className={styles.photoResolutionIcon}>{"\u2713"}</span>
            <span className={styles.photoResolutionText}>RESOLVED</span>
            {resolutionDays != null && (
              <span className={styles.photoResolutionDays}>{resolutionDays}d</span>
            )}
          </div>
        )}
        {statusLower === "open" && daysOpen != null && daysOpen > 0 && (
          <div className={styles.photoOpenBadge}>
            {daysOpen}d open
          </div>
        )}
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
