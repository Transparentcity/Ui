"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { InboxItem } from "@/lib/apiClient";
import styles from "./Inbox.module.css";

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays < 1) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;

  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

// ---------------------------------------------------------------------------
// Place pin SVG (matches MyCities.tsx)
// ---------------------------------------------------------------------------

function PlacePinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Lock icons for edition pills
// ---------------------------------------------------------------------------

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UnlockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 8-2 5 5 0 0 1 5 2" />
    </svg>
  );
}

function EditionLockHint({
  variant,
}: {
  variant: "personalized" | "citywide";
}) {
  const [pinned, setPinned] = useState(false);
  const hint =
    variant === "personalized"
      ? "Private"
      : "Citywide editions are public";
  const Icon = variant === "personalized" ? LockIcon : UnlockIcon;

  const togglePinned = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
    setPinned((value) => !value);
  };

  return (
    <span
      className={`${styles.editionLock}${pinned ? ` ${styles.editionLockPinned}` : ""}`}
      tabIndex={0}
      aria-label={hint}
      onClick={togglePinned}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          togglePinned(event);
        }
      }}
    >
      <Icon className={styles.editionLockIcon} />
      <span className={styles.editionLockTooltip} role="tooltip">
        {hint}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Scope icon + label
// ---------------------------------------------------------------------------

function isPlaceScoped(item: InboxItem): boolean {
  return (
    item.scope === "place" ||
    item.place_id != null ||
    Boolean(item.place_name?.trim())
  );
}

function ScopeIndicator({ item }: { item: InboxItem }) {
  if (isPlaceScoped(item)) {
    return (
      <span className={styles.scopeIcon}>
        <PlacePinIcon className={styles.scopeIconSvg} />
      </span>
    );
  }
  if (item.scope === "district") {
    const label = item.district_label ?? `D${item.district ?? "?"}`;
    return (
      <span className={styles.districtBadge} aria-label={label}>
        {label}
      </span>
    );
  }
  // city
  if (item.city_emoji) {
    return (
      <span className={styles.scopeIcon} role="img" aria-label={item.city_name}>
        {item.city_emoji}
      </span>
    );
  }
  return null;
}

function scopeLabel(item: InboxItem): string {
  if (isPlaceScoped(item)) return item.place_name ?? "Saved place";
  if (item.scope === "district") return item.district_label ?? item.district ?? "";
  return item.city_name;
}

// ---------------------------------------------------------------------------
// InboxCard
// ---------------------------------------------------------------------------

interface InboxCardProps {
  item: InboxItem;
  onClick: (id: string) => void;
}

function showCitywideEditionLabel(item: InboxItem): boolean {
  return !item.is_private && item.scope === "city" && !isPlaceScoped(item);
}

export default function InboxCard({ item, onClick }: InboxCardProps) {
  const label = scopeLabel(item);
  const isUnread = !item.is_read;
  const showCitywideEdition = showCitywideEditionLabel(item);

  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => onClick(item.id)}
      aria-label={`${isUnread ? "Unread: " : ""}${item.subject} from ${label}`}
    >
      <span
        className={`${styles.unreadDot}${item.is_read ? ` ${styles.unreadDotRead}` : ""}`}
        aria-label={isUnread ? "Unread" : undefined}
        aria-hidden={!isUnread}
        role={isUnread ? "status" : undefined}
      />

      {/* Line 1: icon + meta (icon is the first “character” of this line) */}
      <div className={styles.cardMeta}>
        <ScopeIndicator item={item} />
        <span className={styles.scopeLabel}>{label}</span>
        {showCitywideEdition && (
          <span className={`${styles.editionPill} ${styles.editionPillCitywide}`}>
            <EditionLockHint variant="citywide" />
            Citywide Edition
          </span>
        )}
        {item.is_private && (
          <span className={`${styles.editionPill} ${styles.editionPillPersonalized}`}>
            <EditionLockHint variant="personalized" />
            Personalized Edition
          </span>
        )}
        <span className={styles.cardDate}>{formatDate(item.sent_at)}</span>
      </div>

      {/* Line 2: subject */}
      <div className={styles.cardSubject}>{item.subject}</div>

      {/* Line 3: preview */}
      <div className={styles.cardPreview}>{item.preview}</div>

      {/* Right column: thumbnail (rows 2–3) */}
      {item.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.cover_image_url}
          alt=""
          aria-hidden="true"
          className={styles.cardThumbnail}
          loading="lazy"
        />
      )}
    </button>
  );
}
