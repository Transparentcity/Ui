"use client";

/**
 * AdminStoryRow — one feed story in an admin or ops list.
 *
 * Reads left to right like the consumer card, then adds the admin columns:
 *   scope (city / district / place) · date → title → preview
 *   engagement (views, likes, clicks) · job + session · judge score · actions
 *
 * Shared by the Feed admin tool and the city ops dashboard so a story looks
 * the same wherever staff meet it.
 */

import type { ReactNode } from "react";
import {
  Building2,
  Eye,
  Heart,
  Landmark,
  MapPin,
  MousePointerClick,
  SquareTerminal,
} from "lucide-react";
import { ScoreBadge } from "@/components/eval/JudgeScoresPanel";
import { cleanDescription } from "@/lib/feed/textCleanup";
import styles from "./AdminStoryRow.module.css";

export interface AdminStoryRowData {
  id: number;
  headline: string;
  description?: string | null;
  city_name?: string | null;
  city_emoji?: string | null;
  district?: number | null;
  user_place_id?: number | null;
  place_label?: string | null;
  story_date?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  view_count?: number | null;
  click_count?: number | null;
  applaud_count?: number | null;
  /** Story-page views inside the selected window (top stories). */
  period_views?: number | null;
  /** All-time story-page views; when set, the views stat shows this instead of
   *  ``view_count`` (in-app feed impressions) so it matches ``period_views``. */
  page_views?: number | null;
  scheduled_job_name?: string | null;
  job_session_id?: string | null;
  accuracy?: number | null;
}

interface AdminStoryRowProps {
  story: AdminStoryRowData;
  /** Selection checkbox (Feed admin bulk actions). */
  selected?: boolean;
  onToggleSelected?: () => void;
  /** Whole-row click, e.g. open the preview panel. */
  onOpen?: () => void;
  /** Omit to show the job name without a session link (non-admins). */
  onViewSession?: (sessionId: string) => void;
  /** Small note under the judge score, e.g. gating state. */
  accuracyNote?: ReactNode;
  /** Right-aligned action buttons. */
  actions?: ReactNode;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(dt.getTime())) return "";
  const hours = (Date.now() - dt.getTime()) / 3_600_000;
  if (hours < 1) return "Just now";
  if (hours < 24) return `${Math.floor(hours)} hours ago`;
  if (hours < 48) return "Yesterday";
  if (hours < 24 * 7) return `${Math.floor(hours / 24)} days ago`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function scopeOf(story: AdminStoryRowData): { icon: ReactNode; label: string } {
  const city = story.city_name ?? "City";
  if (story.user_place_id != null || story.place_label) {
    return {
      icon: <MapPin size={14} strokeWidth={2.5} aria-label="Saved place" />,
      label: `${city} \u00B7 ${story.place_label || "Saved place"}`,
    };
  }
  if (story.district != null && story.district !== 0) {
    return {
      icon: <Landmark size={14} strokeWidth={2.5} aria-label="District" />,
      label: `${city} \u00B7 District ${story.district}`,
    };
  }
  return {
    icon: story.city_emoji ? (
      <span aria-hidden="true">{story.city_emoji}</span>
    ) : (
      <Building2 size={14} strokeWidth={2.5} aria-hidden="true" />
    ),
    label: `${city} \u00B7 City-wide`,
  };
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <span className={styles.stat} title={`${value.toLocaleString()} ${label}`}>
      {icon}
      <span className={styles.statValue}>{value.toLocaleString()}</span>
    </span>
  );
}

export default function AdminStoryRow({
  story,
  selected,
  onToggleSelected,
  onOpen,
  onViewSession,
  accuracyNote,
  actions,
}: AdminStoryRowProps) {
  const scope = scopeOf(story);
  const preview = cleanDescription(
    story.description ?? "",
    story.headline,
    story.city_name ?? undefined,
    scope.label
  );
  const when = formatWhen(story.published_at ?? story.story_date ?? story.created_at);

  return (
    <div
      className={`${styles.row} ${onOpen ? styles.rowClickable : ""} ${
        selected ? styles.rowSelected : ""
      }`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && e.key === "Enter") onOpen();
      }}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      {onToggleSelected && (
        <div className={styles.select} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelected}
            aria-label={`Select story ${story.id}`}
          />
        </div>
      )}

      <div className={styles.main}>
        <div className={styles.scope}>
          <span className={styles.scopeIcon}>{scope.icon}</span>
          <span className={styles.scopeName}>{scope.label}</span>
          {when && <span className={styles.when}>{when}</span>}
        </div>
        <div className={styles.title}>{story.headline}</div>
        {preview && <div className={styles.preview}>{preview}</div>}
      </div>

      <div className={styles.engagement}>
        {story.period_views != null && (
          <span className={styles.periodViews} title="Story-page views in the selected period">
            {story.period_views.toLocaleString()} in period
          </span>
        )}
        <div className={styles.stats}>
          {story.page_views != null ? (
            <Stat
              icon={<Eye size={13} aria-hidden="true" />}
              value={story.page_views}
              label="story page views, all time"
            />
          ) : (
            <Stat
              icon={<Eye size={13} aria-hidden="true" />}
              value={story.view_count ?? 0}
              label="views"
            />
          )}
          <Stat icon={<Heart size={13} aria-hidden="true" />} value={story.applaud_count ?? 0} label="likes" />
          <Stat
            icon={<MousePointerClick size={13} aria-hidden="true" />}
            value={story.click_count ?? 0}
            label="clicks"
          />
        </div>
      </div>

      <div className={styles.job}>
        <span className={styles.jobName} title={story.scheduled_job_name ?? undefined}>
          {story.scheduled_job_name || "Manual"}
        </span>
        {story.job_session_id && onViewSession && (
          <button
            type="button"
            className={styles.sessionLink}
            onClick={(e) => {
              e.stopPropagation();
              onViewSession(story.job_session_id!);
            }}
          >
            <SquareTerminal size={12} aria-hidden="true" />
            Session
          </button>
        )}
      </div>

      <div className={styles.score}>
        {story.accuracy != null ? (
          <ScoreBadge score={story.accuracy} title={`Judge accuracy ${story.accuracy}`} size={24} />
        ) : (
          <span className={styles.unjudged}>Unjudged</span>
        )}
        {accuracyNote && <span className={styles.scoreNote}>{accuracyNote}</span>}
      </div>

      <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
        {actions}
      </div>
    </div>
  );
}

/** Container with consistent dividers for a list of AdminStoryRow. */
export function AdminStoryList({
  children,
  bare = false,
}: {
  children: ReactNode;
  /** Drop the outer card border when the list already sits inside a card. */
  bare?: boolean;
}) {
  return <div className={bare ? styles.listBare : styles.list}>{children}</div>;
}

/** Compact square action button for the actions slot. */
export function AdminStoryAction({
  label,
  onClick,
  href,
  disabled,
  danger,
  active,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  const className = `${styles.action} ${danger ? styles.actionDanger : ""} ${
    active ? styles.actionActive : ""
  }`;
  if (href) {
    return (
      <a className={className} href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
