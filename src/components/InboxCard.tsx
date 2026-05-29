"use client";

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
// Lock icon for Private pill
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

// ---------------------------------------------------------------------------
// Scope icon + label
// ---------------------------------------------------------------------------

function ScopeIndicator({ item }: { item: InboxItem }) {
  if (item.scope === "place") {
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
  if (item.scope === "place") return item.place_name ?? "Saved place";
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

export default function InboxCard({ item, onClick }: InboxCardProps) {
  const label = scopeLabel(item);
  const isUnread = !item.is_read;

  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => onClick(item.id)}
      aria-label={`${isUnread ? "Unread: " : ""}${item.subject} from ${label}`}
    >
      {/* Line 1: meta */}
      <div className={styles.cardMeta}>
        <span
          className={`${styles.unreadDot}${item.is_read ? ` ${styles.unreadDotRead}` : ""}`}
          aria-label={isUnread ? "Unread" : undefined}
          aria-hidden={!isUnread}
          role={isUnread ? "status" : undefined}
        />
        <ScopeIndicator item={item} />
        <span className={styles.scopeLabel}>{label}</span>
        {item.is_private && (
          <span className={styles.privatePill}>
            <LockIcon className={styles.privatePillIcon} />
            Private
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
