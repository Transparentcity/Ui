"use client";

/**
 * CityOpsDashboard — the ops home for city leads and analysts, and the
 * "City view" tab for admins. One city at a time; every panel reads a
 * /api/ops/cities/{id}/... route that enforces the viewer's scope.
 *
 * Tabs: Overview (followers, city page views, top stories) · City health
 * (Needs attention) · Metrics (the city's metric list) · Stories (judge
 * scores, accuracy ≤ 2 highlighted) · LLM costs (job story generation +
 * the city's ops users).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ScheduleHealthDashboard from "@/components/ScheduleHealthDashboard";
import CitySiteView from "@/components/citySite/CitySiteView";
import Loader from "@/components/Loader";
import MarkdownWithEmbeds from "@/components/MarkdownWithEmbeds";
import MetricEditModal from "@/components/MetricEditModal";
import SeymourXReply from "@/components/SeymourXReply";
import OpsStoriesTab, {
  StoryList,
  StorySortSelect,
  toReviewStory,
} from "@/components/admin/OpsStoriesTab";
import SessionViewerModal from "@/components/eval/SessionViewerModal";
import StoryReviewModal, {
  publicStoryPath,
  type ReviewStory,
  type StoryReviewApi,
} from "@/components/StoryReviewModal";
import {
  deleteCivicItem,
  getCivicItems,
  getOpsCities,
  getOpsCityHealth,
  getOpsCityLlmCost,
  getOpsStoryReview,
  getAvailableModels,
  getJob,
  getLatestCivicDiscussionSummary,
  opsAutocorrectStory,
  opsDeleteStory,
  opsJudgeStory,
  opsRejudgeStory,
  opsSetStoryOverride,
  opsSetStoryVisibility,
  getOpsCityUsage,
  startCivicDiscussionSummary,
  type CivicDiscussionSummaryResult,
  type CivicLatestItem,
  type ModelGroupInfo,
  type OpsCity,
  type OpsStorySort,
  type OpsCityLlmCost,
  type OpsCityStory,
  type OpsCityUsage,
  type OpsStoryReview,
} from "@/lib/apiClient";
import { pickDefaultModelKey } from "@/lib/modelDefaults";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import { toast } from "sonner";
import { revalidatePublicStory } from "@/app/actions/revalidateStory";
import {
  isCanonicalStoryPath,
  nextPublicVisibility,
  visibilitySuccessMessage,
} from "@/lib/stories/staffModeration";
import { fmt, money, shortDate, StatCard } from "@/components/analytics/dashboardParts";
import { countCriticalAlerts, ensureCitiesAttention } from "@/lib/cityHealthAttention";
import styles from "./ProductAnalyticsDashboard.module.css";

export type CityOpsTabId =
  | "overview"
  | "health"
  | "metrics"
  | "stories"
  | "llm-costs"
  | "civic";

const TABS: { id: CityOpsTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "health", label: "City health" },
  { id: "metrics", label: "Metrics" },
  { id: "stories", label: "Stories" },
  { id: "llm-costs", label: "LLM costs" },
  { id: "civic", label: "Civic Discussion" },
];

/** Tabs whose data is a time window (L7 / L30 / L90). */
function usesWindow(tab: CityOpsTabId): boolean {
  return tab === "overview" || tab === "stories" || tab === "llm-costs";
}

const PRESETS = [
  { label: "L7", days: 7 },
  { label: "L30", days: 30 },
  { label: "L90", days: 90 },
];

const CHART_MARGIN = { top: 4, right: 8, left: 0, bottom: 0 };

function UsagePanel({
  usage,
  storySort,
  onStorySortChange,
  onViewSession,
  onOpenStory,
  canManage,
  canDelete,
  busyStoryId,
  onToggleVisibility,
  onDelete,
}: {
  usage: OpsCityUsage;
  storySort: OpsStorySort;
  onStorySortChange: (sort: OpsStorySort) => void;
  onViewSession?: (sessionId: string) => void;
  onOpenStory?: (story: OpsCityStory) => void;
  canManage: boolean;
  canDelete: boolean;
  busyStoryId: number | null;
  onToggleVisibility: (story: OpsCityStory) => void;
  onDelete: (story: OpsCityStory) => void;
}) {
  const chart = usage.daily.map((d) => ({
    day: shortDate(d.date),
    Followers: d.total_followers,
  }));
  const { by_surface: surfaces } = usage.page_views;
  return (
    <>
      <div className={styles.statGrid}>
        <StatCard
          label="Followers"
          value={fmt(usage.followers.total)}
          sub={`${fmt(usage.followers.new_in_window)} new in period`}
          highlight
        />
        <StatCard
          label="City page views"
          value={fmt(usage.page_views.views)}
          sub={`${fmt(surfaces.stories)} stories · ${fmt(surfaces.city)} city · ${fmt(
            surfaces.districts
          )} district · ${fmt(surfaces.places)} place`}
        />
      </div>
      <p className={styles.note}>
        Page views count story pages about this city plus its city, district, and saved-place
        overview pages, from first-party <code>product_events</code>. Followers are people who
        follow this city.
      </p>
      {chart.length > 0 && (
        <div className={styles.section}>
          <div className={styles.chartCard}>
            <div className={styles.chartCardHeader}>
              <div className={styles.sectionTitle}>Total followers</div>
            </div>
            <div className={styles.chartPlot}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary, #e5e5e5)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={32} />
                  <Tooltip contentStyle={{ fontSize: "12px" }} />
                  <Line
                    type="monotone"
                    dataKey="Followers"
                    stroke="var(--brand-primary, #ad35fa)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      <div className={styles.section}>
        <div className={styles.chartCardHeader}>
          <div className={styles.sectionTitle}>Top stories</div>
          <StorySortSelect value={storySort} onChange={onStorySortChange} />
        </div>
        <StoryList
          stories={usage.top_stories}
          onViewSession={onViewSession}
          onOpenStory={onOpenStory}
          emptyText="No story views or new stories in this period."
          canManageStory={canManage ? () => true : undefined}
          canDelete={canDelete}
          busyStoryId={busyStoryId}
          onToggleVisibility={onToggleVisibility}
          onDelete={onDelete}
        />
      </div>
    </>
  );
}

function LlmCostPanel({ cost }: { cost: OpsCityLlmCost }) {
  const chart = cost.daily.map((d) => ({
    day: shortDate(d.date),
    "Story jobs": d.story_jobs,
    People: d.people,
  }));
  return (
    <>
      <div className={styles.statGrid}>
        <StatCard label="Total" value={money(cost.total_cost_usd)} highlight />
        <StatCard label="Story generation jobs" value={money(cost.story_jobs_cost_usd)} />
        <StatCard label="City leads & analysts" value={money(cost.people_cost_usd)} />
      </div>
      <p className={styles.note}>
        Counts story generation run by jobs for this city, plus all LLM usage by this city&apos;s
        leads and the analysts who follow it. An analyst who follows several cities appears in
        each of them.
        {!cost.story_jobs_available && " Story-job cost is not available until migration 148 runs."}
      </p>
      {chart.length > 0 && (
        <div className={styles.section}>
          <div className={styles.chartCard}>
            <div className={styles.chartCardHeader}>
              <div className={styles.sectionTitle}>Daily LLM cost</div>
            </div>
            <div className={styles.chartPlot}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary, #e5e5e5)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={36} />
                  <Tooltip formatter={(v: number) => money(v)} contentStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="Story jobs" stackId="c" fill="#5B8DEF" />
                  <Bar dataKey="People" stackId="c" fill="#ad35fa" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>By job</div>
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                {["Job", "Calls", "Tokens", "Cost"].map((h, i) => (
                  <th key={h} className={i > 0 ? styles.thRight : styles.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cost.by_job.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={4}>
                    No story generation jobs in this window.
                  </td>
                </tr>
              ) : (
                cost.by_job.map((j) => (
                  <tr key={j.name}>
                    <td className={styles.td}>{j.name}</td>
                    <td className={styles.tdRight}>{fmt(j.calls)}</td>
                    <td className={styles.tdRight}>{fmt(j.tokens)}</td>
                    <td className={styles.tdRight}>{money(j.cost_usd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>By person</div>
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                {["Person", "Role", "Calls", "Tokens", "Cost"].map((h, i) => (
                  <th key={h} className={i > 1 ? styles.thRight : styles.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cost.by_person.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={5}>
                    No city leads or analysts for this city.
                  </td>
                </tr>
              ) : (
                cost.by_person.map((p) => (
                  <tr key={p.user_id}>
                    <td className={styles.td}>{p.name || p.email}</td>
                    <td className={styles.td}>{p.roles.join(", ").replace(/_/g, " ")}</td>
                    <td className={styles.tdRight}>{fmt(p.calls)}</td>
                    <td className={styles.tdRight}>{fmt(p.tokens)}</td>
                    <td className={styles.tdRight}>{money(p.cost_usd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// CivicIntelPanel — Civic tab content
// ---------------------------------------------------------------------------

interface CivicItemMeta {
  [key: string]: unknown;
  event_id?: string | number;  // Legistar event ID — used to group agenda items under their meeting
  event_date?: string;         // M/D/YYYY from Legistar raw (fallback when published_at is null)
  event_time?: string;
  body_name?: string;
  matter_file?: string;
  matter_type?: string;
  action_text?: string;
  agenda_sequence?: string | number;
  vote_result?: string;
  vote_summary?: string;
  vote_counts?: Record<string, number>;
  votes?: Array<{
    person_name?: string | null;
    person_id?: string | number | null;
    vote: string;
  }>;
  mover?: string;
  seconder?: string;
  // meeting_page fields
  page_url?: string;
  agenda_links?: string[];
  video_links?: string[];
  // post (X/social) fields
  author_handle?: string;
  author_name?: string;
  author_profile_image?: string;
  like_count?: number;
  retweet_count?: number;
  reply_count?: number;
  is_retweet?: boolean;
  rt_author_handle?: string;
  rt_author_name?: string;
  official_name?: string;
  official_title?: string;
  official_district?: string;
}

interface CivicItem extends CivicLatestItem {
  meta: CivicItemMeta;
}

const TIER_LABEL: Record<number, string> = {
  1: "Official",
  2: "Press",
  3: "Commentary",
  4: "Social",
};

// Tier badge colors — CSS-variable-based to support dark mode
const TIER_COLOR_VAR: Record<number, string> = {
  1: "var(--civic-tier1, #1d4ed8)",
  2: "var(--civic-tier2, #15803d)",
  3: "var(--civic-tier3, #7e22ce)",
  4: "var(--civic-tier4, #6b7280)",
};

const CIVIC_TABS = [
  { id: "all", label: "All" },
  { id: "cityhall", label: "City Hall" },
  { id: "press", label: "Press" },
  { id: "officials", label: "Officials" },
];

const DAYS_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "28 days", value: 28 },
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
];

/** A meeting with its child agenda items and optional meeting_page resource. */
interface MeetingGroup {
  meeting: CivicItem;
  items: CivicItem[];
  expanded: boolean;
  meetingPage?: CivicItem;  // merged from meeting_page content_type
}

/**
 * Build the grouped feed for the "All" tab (and Meetings / Agenda items tabs):
 *   - Meetings at the top, each with their agenda_items nested underneath
 *   - Non-civic items (articles, etc.) listed after all meetings
 *   - Meetings sorted by date desc; items within a meeting sorted by agenda_sequence
 */
function buildFeedGroups(items: CivicItem[]): {
  groups: MeetingGroup[];
  standaloneItems: CivicItem[];
} {
  const meetingMap = new Map<string, MeetingGroup>();
  const orphanItems: CivicItem[] = [];   // agenda_items with no matching meeting
  const standaloneItems: CivicItem[] = []; // articles, roster, etc.

  // Index meetings by event_id
  for (const item of items) {
    if (item.content_type === "meeting") {
      const key = String(item.meta.event_id ?? item.id);
      if (!meetingMap.has(key)) {
        meetingMap.set(key, { meeting: item, items: [], expanded: true });
      }
    }
  }

  // Attach agenda_items to their parent meeting; collect meeting_pages separately
  const meetingPages: CivicItem[] = [];
  for (const item of items) {
    if (item.content_type === "agenda_item") {
      const key = String(item.meta.event_id ?? "");
      if (key && meetingMap.has(key)) {
        meetingMap.get(key)!.items.push(item);
      } else {
        orphanItems.push(item);
      }
    } else if (item.content_type === "meeting_page") {
      meetingPages.push(item);
    } else if (item.content_type !== "meeting") {
      standaloneItems.push(item);
    }
  }

  // Merge each meeting_page into the best-matching meeting group by body_name
  for (const mp of meetingPages) {
    let matched = false;
    for (const group of meetingMap.values()) {
      const body = (group.meeting.meta.body_name ?? "").toLowerCase();
      if (body.includes("board") && body.includes("supervisor")) {
        group.meetingPage = mp;
        matched = true;
        break;
      }
    }
    // Fallback: attach to the first group
    if (!matched) {
      const first = meetingMap.values().next().value;
      if (first) first.meetingPage = mp;
    }
  }

  // Sort items within each meeting by agenda_sequence
  for (const group of meetingMap.values()) {
    group.items.sort((a, b) => {
      const seqA = Number(a.meta.agenda_sequence ?? 9999);
      const seqB = Number(b.meta.agenda_sequence ?? 9999);
      return seqA - seqB;
    });
  }

  // Sort meetings: most recent date first
  const groups = Array.from(meetingMap.values()).sort((a, b) => {
    const dA = a.meeting.published_at ?? a.meeting.meta.event_date ?? a.meeting.last_seen_at;
    const dB = b.meeting.published_at ?? b.meeting.meta.event_date ?? b.meeting.last_seen_at;
    const timeA = dA ? parseCivicDate(dA)?.getTime() ?? 0 : 0;
    const timeB = dB ? parseCivicDate(dB)?.getTime() ?? 0 : 0;
    return timeB - timeA;
  });

  // Orphan agenda items (no matching meeting row) appear as a catch-all group
  if (orphanItems.length > 0) {
    const phantom: CivicItem = {
      id: -1,
      content_type: "meeting",
      authority_tier: 1,
      source_name: "Legistar",
      title: "Upcoming meetings (agenda items)",
      url: null,
      published_at: null,
      author: null,
      body: null,
      meta: {},
      first_seen_at: null,
      last_seen_at: orphanItems[0]?.last_seen_at ?? null,
      source_kind: null,
      source_slug: "legistar",
      external_id: "orphan-agenda-items",
    };
    groups.push({ meeting: phantom, items: orphanItems, expanded: true });
  }

  return { groups, standaloneItems };
}

/** Parse "M/D/YYYY" (Legistar) or ISO datetime string into a JS Date. */
function parseCivicDate(raw: string): Date | null {
  // Try ISO first
  const iso = new Date(raw);
  if (!isNaN(iso.getTime())) return iso;
  // Try M/D/YYYY
  const mdY = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdY) return new Date(Number(mdY[3]), Number(mdY[1]) - 1, Number(mdY[2]));
  return null;
}

function formatEventDateTime(publishedAt: string | null, meta: CivicItemMeta): string | null {
  // Prefer published_at (ISO), fall back to meta.event_date (M/D/YYYY from Legistar raw)
  const rawDate = publishedAt ?? meta.event_date ?? null;
  if (!rawDate) return null;
  try {
    const date = parseCivicDate(rawDate);
    if (!date) return rawDate;
    const datePart = date.toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
    });
    const timePart = meta.event_time ? ` · ${meta.event_time}` : "";
    return datePart + timePart;
  } catch {
    return rawDate;
  }
}

interface CivicDayGroup {
  key: string;
  label: string;
  items: CivicItem[];
}

function groupCivicItemsByDay(items: CivicItem[]): CivicDayGroup[] {
  const groups = new Map<string, CivicDayGroup>();
  for (const item of items) {
    const rawDate = item.published_at ?? item.last_seen_at;
    const date = rawDate ? parseCivicDate(rawDate) : null;
    const key = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "unknown";
    const label = date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "Date unavailable";
    const group = groups.get(key) ?? { key, label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.key === "unknown") return 1;
    if (b.key === "unknown") return -1;
    return b.key.localeCompare(a.key);
  });
}

/** Abbreviate long Legistar action codes to a short readable label. */
function abbreviateAction(action: string): string {
  const a = action.toUpperCase();
  if (a.includes("PASSED")) return "Passed";
  if (a.includes("FAILED") || a.includes("REJECTED")) return "Failed";
  if (a.includes("TABLED") || a.includes("CONTINUED")) return "Tabled";
  if (a.includes("WITHDRAWN")) return "Withdrawn";
  if (a.includes("AMENDED")) return "Amended";
  if (a.includes("RECOMMENDED")) return "Recommended";
  if (a.includes("RECEIVED") || a.includes("FILED")) return "Received/Filed";
  if (a.includes("NOTED")) return "Noted";
  // Fallback: truncate
  return action.length > 22 ? action.slice(0, 20) + "…" : action;
}

function formatVoteTally(meta: CivicItemMeta): string | null {
  if (meta.vote_summary?.trim()) return meta.vote_summary.trim();
  const counts = Object.entries(meta.vote_counts ?? {}).filter(
    ([, count]) => Number.isFinite(count) && count > 0
  );
  return counts.length > 0
    ? counts.map(([vote, count]) => `${vote} ${count}`).join(" · ")
    : null;
}

function hasVoteResult(meta: CivicItemMeta): boolean {
  return Boolean(
    meta.vote_result?.trim()
    || meta.vote_summary?.trim()
    || Object.keys(meta.vote_counts ?? {}).length > 0
    || (meta.votes?.length ?? 0) > 0
  );
}

// ---------------------------------------------------------------------------
// CivicItemModal
// ---------------------------------------------------------------------------

function CivicItemModal({
  item,
  onClose,
  onDelete,
  deleting,
  canDelete = true,
}: {
  item: CivicItem;
  onClose: () => void;
  onDelete: (item: CivicItem) => void;
  deleting: boolean;
  canDelete?: boolean;
}) {
  const isAgendaItem = item.content_type === "agenda_item";
  const isMeeting = item.content_type === "meeting";
  const eventDateTime = (isAgendaItem || isMeeting)
    ? formatEventDateTime(item.published_at, item.meta)
    : null;
  const tierColor = TIER_COLOR_VAR[item.authority_tier] ?? "var(--text-tertiary, #6b7280)";
  const voteTally = formatVoteTally(item.meta);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
        zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-primary, #fff)",
          border: "1px solid var(--border-primary, #e5e7eb)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 640,
          maxHeight: "85vh",
          overflowY: "auto",
          padding: "24px 28px",
          position: "relative",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        }}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 16, right: 16,
            background: "transparent",
            border: "1px solid var(--border-primary, #e5e7eb)",
            borderRadius: 6,
            padding: "4px 8px",
            cursor: "pointer",
            color: "var(--text-tertiary, #6b7280)",
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ✕
        </button>

        {/* Header badges */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            color: tierColor,
            border: `1px solid ${tierColor}`,
            borderRadius: 999, padding: "2px 8px",
          }}>
            T{item.authority_tier} {TIER_LABEL[item.authority_tier]}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
            background: "rgba(173,53,250,0.10)", color: "var(--brand-primary, #ad35fa)",
            borderRadius: 999, padding: "2px 8px",
            textTransform: "capitalize",
          }}>
            {item.content_type.replace(/_/g, " ")}
          </span>
          {isAgendaItem && item.meta.action_text && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              background: "var(--bg-subtle, #f3f4f6)",
              color: "var(--text-secondary, #374151)",
              border: "1px solid var(--border-primary, #e5e7eb)",
              borderRadius: 999, padding: "2px 8px",
            }}>
              {abbreviateAction(item.meta.action_text)}
            </span>
          )}
        </div>

        {/* Title */}
        <h2 style={{
          margin: "0 0 10px",
          fontSize: "1.0625rem",
          fontWeight: 700,
          lineHeight: 1.4,
          color: "var(--text-primary, #111827)",
          paddingRight: 32,
        }}>
          {item.title ?? <em style={{ fontStyle: "italic", opacity: 0.5 }}>Untitled</em>}
        </h2>

        {/* Meta */}
        <div style={{
          fontSize: 12,
          color: "var(--text-tertiary, #6b7280)",
          display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
          marginBottom: 16,
        }}>
          <span style={{ fontWeight: 600, color: "var(--text-secondary, #374151)" }}>
            {item.source_name}
          </span>
          {item.meta.body_name && isAgendaItem && (
            <><span>·</span><span>{item.meta.body_name}</span></>
          )}
          {eventDateTime && (
            <><span>·</span>
            <span style={{ fontWeight: 500, color: "var(--text-secondary, #374151)" }}>
              {eventDateTime}
            </span></>
          )}
          {!isAgendaItem && !isMeeting && item.published_at && (
            <><span>·</span>
            <span>{new Date(item.published_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span></>
          )}
          {item.author && (
            <><span>·</span><span>{item.author}</span></>
          )}
        </div>

        {/* Agenda details table */}
        {isAgendaItem && (item.meta.matter_file || item.meta.matter_type) && (
          <div style={{
            background: "var(--bg-secondary, #f8f9fa)",
            border: "1px solid var(--border-primary, #e5e7eb)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "4px 16px",
            fontSize: 12,
          }}>
            {item.meta.matter_file && (
              <>
                <span style={{ color: "var(--text-tertiary, #6b7280)", fontWeight: 500 }}>File</span>
                <span style={{ color: "var(--text-primary, #111827)" }}>{item.meta.matter_file}</span>
              </>
            )}
            {item.meta.matter_type && (
              <>
                <span style={{ color: "var(--text-tertiary, #6b7280)", fontWeight: 500 }}>Type</span>
                <span style={{ color: "var(--text-primary, #111827)" }}>{item.meta.matter_type}</span>
              </>
            )}
            {item.meta.action_text && (
              <>
                <span style={{ color: "var(--text-tertiary, #6b7280)", fontWeight: 500 }}>Action</span>
                <span style={{ color: "var(--text-primary, #111827)" }}>{item.meta.action_text}</span>
              </>
            )}
          </div>
        )}

        {isAgendaItem && hasVoteResult(item.meta) && (
          <div style={{
            background: "rgba(21, 128, 61, 0.06)",
            border: "1px solid rgba(21, 128, 61, 0.25)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 12,
          }}>
            <div style={{
              color: "var(--text-primary, #111827)",
              fontWeight: 700,
              marginBottom: voteTally || item.meta.votes?.length ? 5 : 0,
            }}>
              Vote{item.meta.vote_result ? `: ${item.meta.vote_result}` : ""}
            </div>
            {voteTally && (
              <div style={{ color: "var(--text-secondary, #374151)" }}>
                Tally: {voteTally}
              </div>
            )}
            {(item.meta.votes?.length ?? 0) > 0 && (
              <div style={{
                color: "var(--text-secondary, #374151)",
                lineHeight: 1.6,
                marginTop: 5,
              }}>
                {item.meta.votes!.map((vote) => {
                  const person = vote.person_name
                    || (vote.person_id != null ? `Member ${vote.person_id}` : "Member");
                  return `${person}: ${vote.vote}`;
                }).join(" · ")}
              </div>
            )}
          </div>
        )}

        {/* Body */}
        {item.body && (
          <p style={{
            margin: "0 0 20px",
            fontSize: 13,
            lineHeight: 1.65,
            color: "var(--text-secondary, #374151)",
          }}>
            {item.body}
          </p>
        )}

        {/* Footer actions */}
        <div style={{
          display: "flex", gap: 8, alignItems: "center",
          paddingTop: 16,
          borderTop: "1px solid var(--border-primary, #e5e7eb)",
        }}>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "6px 14px",
                borderRadius: 6,
                background: "var(--brand-primary, #ad35fa)",
                color: "#fff",
                fontSize: 12, fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Open source ↗
            </a>
          )}
          {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(item)}
            disabled={deleting}
            style={{
              marginLeft: "auto",
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border-primary, #e5e7eb)",
              background: "transparent",
              color: "var(--text-tertiary, #6b7280)",
              fontSize: 12,
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? "Deleting…" : "Delete item"}
          </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CivicIntelPanel
// ---------------------------------------------------------------------------

interface CivicIntelPanelProps {
  cityId: number;
  cities?: Array<{ city_id: number; name: string }>;
  onCityChange?: (id: number) => void;
  /** City leads and admins can delete items and generate Seymour summaries. */
  canManage?: boolean;
  /** Global admins additionally see the source-management link. */
  isAdmin?: boolean;
}

function CivicIntelPanel({ cityId, cities, onCityChange, canManage = false, isAdmin = false }: CivicIntelPanelProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [items, setItems] = useState<CivicItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentType, setContentType] = useState("all");
  const [daysBack, setDaysBack] = useState(7);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<CivicItem | null>(null);
  const [summary, setSummary] = useState<CivicDiscussionSummaryResult | null>(null);
  const [summaryRunning, setSummaryRunning] = useState(false);
  const [summaryStatus, setSummaryStatus] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [summaryNextRunAt, setSummaryNextRunAt] = useState<string | null>(null);
  const [summaryModelGroups, setSummaryModelGroups] = useState<ModelGroupInfo[]>([]);
  const [summaryModelKey, setSummaryModelKey] = useState("");
  // Tracks which meeting groups are EXPANDED; empty = all collapsed by default
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const load = useCallback(async (ct: string, days: number) => {
    // Officials tab fetches posts
    if (ct === "officials") {
      // Will fall through to normal fetch with content_type=post below
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      // All and City Hall fetch all types because meetings need related
      // agenda_item and meeting_page records to build the grouped view.
      // Press: fetch only articles
      // Officials: fetch posts
      const contentType =
        ct === "press" ? "article" : ct === "officials" ? "post" : undefined;
      const data = await getCivicItems<CivicItem>(cityId, token, {
        contentType,
        daysBack: days,
        limit: 500,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [cityId, getAccessTokenSilently]);

  const handleDelete = useCallback(async (item: CivicItem) => {
    if (!canManage) return;
    const label = item.title?.slice(0, 50) || `item #${item.id}`;
    if (!window.confirm(`Delete "${label}"?\n\nThe next collection run may re-add it if it is still live at the source.`)) return;
    setDeletingId(item.id);
    try {
      const token = await getAccessTokenSilently();
      await deleteCivicItem(item.id, token);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setTotal((t) => t - 1);
      setSelectedItem((prev) => (prev?.id === item.id ? null : prev));
    } catch (e) {
      setError(`Delete failed: ${String(e)}`);
    } finally {
      setDeletingId(null);
    }
  }, [getAccessTokenSilently, canManage]);

  const handleGenerateSummary = useCallback(async () => {
    if (!canManage) return;
    setSummaryRunning(true);
    setSummaryError(null);
    setSummaryStatus("Starting Seymour...");
    try {
      const token = await getAccessTokenSilently();
      const started = await startCivicDiscussionSummary(
        cityId,
        summaryModelKey,
        token
      );
      notifyJobCreated(started.job_id);

      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        const job = await getJob(started.job_id, token);
        setSummaryStatus(job.status_message || "Seymour is reviewing the civic record...");
        if (job.status === "completed") {
          const result = job.result as CivicDiscussionSummaryResult | undefined;
          if (!result?.summary_markdown) {
            throw new Error("The job completed without a summary.");
          }
          setSummary(result);
          setSummaryExpanded(false);
          setSummaryStatus(null);
          return;
        }
        if (job.status === "failed" || job.status === "cancelled") {
          throw new Error(job.error_message || job.error || `Job ${job.status}.`);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      throw new Error("The summary is still running. Check the Jobs panel for progress.");
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : String(e));
      setSummaryStatus(null);
    } finally {
      setSummaryRunning(false);
    }
  }, [cityId, getAccessTokenSilently, summaryModelKey, canManage]);

  useEffect(() => { void load(contentType, daysBack); }, [load, contentType, daysBack]);
  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setSummaryExpanded(false);
    setSummaryNextRunAt(null);
    setSummaryError(null);
    setSummaryStatus(null);
    void (async () => {
      try {
        const token = await getAccessTokenSilently();
        const latest = await getLatestCivicDiscussionSummary(cityId, token);
        if (!cancelled) {
          setSummary(latest.summary);
          setSummaryNextRunAt(latest.next_run_at);
        }
      } catch {
        // No prior briefing is a valid empty state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cityId, getAccessTokenSilently]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getAccessTokenSilently();
        const groups = await getAvailableModels(token);
        if (cancelled) return;
        const availableGroups = groups
          .map((group) => ({
            ...group,
            models: group.models.filter((model) => model.is_available),
          }))
          .filter((group) => group.models.length > 0);
        setSummaryModelGroups(availableGroups);
        setSummaryModelKey(pickDefaultModelKey(availableGroups) ?? "");
      } catch {
        // The action stays disabled until an available model can be loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessTokenSilently, canManage]);

  const summaryNeedsUpdate = Boolean(
    summary
    && Date.now() - new Date(summary.generated_at).getTime()
      >= 7 * 24 * 60 * 60 * 1000
  );

  // All and City Hall use grouped meetings; All also includes standalone items.
  // Press uses a flat list, while Officials has a dedicated post feed.
  const useGrouped = contentType === "all" || contentType === "cityhall";
  const { groups: feedGroups, standaloneItems: feedStandaloneItems } = useMemo(
    () => useGrouped ? buildFeedGroups(items) : { groups: [], standaloneItems: items },
    [items, useGrouped]
  );
  const feedStandaloneByDay = useMemo(
    () => groupCivicItemsByDay(feedStandaloneItems),
    [feedStandaloneItems]
  );
  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "2px 0" }}>

      {/* ROW 1 — Primary tabs */}
      <div style={{
        display: "flex",
        gap: "var(--space-xs, 4px)",
        flexWrap: "wrap",
        paddingBottom: 12,
        borderBottom: "1px solid var(--border-primary, #e5e7eb)",
        marginBottom: 10,
      }}>
        {CIVIC_TABS.map((tab) => {
          const active = contentType === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setContentType(tab.id)}
              aria-pressed={active}
              style={{
                padding: "5px 10px",
                borderRadius: 999,
                border: "1px solid",
                borderColor: active
                  ? "var(--brand-primary, #ad35fa)"
                  : "transparent",
                background: active
                  ? "var(--brand-primary-light, rgba(173, 53, 250, 0.1))"
                  : "transparent",
                color: active
                  ? "var(--brand-primary, #ad35fa)"
                  : "var(--text-secondary, #374151)",
                fontFamily: "var(--font-heading)",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                lineHeight: 1.2,
                cursor: "pointer",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ROW 2 — City selector · days · count · summary · refresh */}
      <div style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 14,
      }}>
        {/* City selector — only shown if multiple cities */}
        {cities && cities.length > 1 && onCityChange && (
          <select
            value={cityId}
            onChange={(e) => onCityChange(Number(e.target.value))}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-primary, #e5e7eb)",
              background: "var(--bg-primary, #fff)",
              color: "var(--text-primary, #111827)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
            aria-label="City"
          >
            {cities.map((c) => (
              <option key={c.city_id} value={c.city_id}>{c.name}</option>
            ))}
          </select>
        )}

        {/* Days range */}
        <select
          value={daysBack}
          onChange={(e) => setDaysBack(Number(e.target.value))}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid var(--border-primary, #e5e7eb)",
            background: "var(--bg-primary, #fff)",
            color: "var(--text-secondary, #374151)",
            fontSize: 12,
            cursor: "pointer",
          }}
          aria-label="Date range"
        >
          {DAYS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Item count */}
        <span style={{ fontSize: 12, color: "var(--text-tertiary, #94a3b8)" }}>
          {loading ? "Loading…" : `${total} item${total !== 1 ? "s" : ""}`}
        </span>

        {canManage && (
        <select
          value={summaryModelKey}
          onChange={(event) => setSummaryModelKey(event.target.value)}
          disabled={summaryRunning || summaryModelGroups.length === 0}
          aria-label="Seymour summary model"
          style={{
            marginLeft: "auto",
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid var(--border-primary, #e5e7eb)",
            background: "var(--bg-primary, #fff)",
            color: "var(--text-secondary, #374151)",
            fontSize: 11,
            cursor: summaryRunning ? "not-allowed" : "pointer",
          }}
        >
          {summaryModelGroups.length === 0 && <option value="">Loading models…</option>}
          {summaryModelGroups.map((group) => (
            <optgroup key={group.label} label={`${group.emoji} ${group.label}`}>
              {group.models.map((model) => (
                <option key={model.key} value={model.key}>
                  {model.name}{model.is_default ? " (default)" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        )}

        {/* Fixed 7-day lookback + 7-day outlook Seymour briefing */}
        {canManage && (
        <button
          type="button"
          onClick={() => void handleGenerateSummary()}
          disabled={summaryRunning || !summaryModelKey}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: 6,
            border: "1px solid var(--brand-primary, #ad35fa)",
            background: "var(--brand-primary, #ad35fa)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: summaryRunning ? "not-allowed" : "pointer",
            opacity: summaryRunning ? 0.65 : 1,
          }}
        >
          {summaryRunning && <Loader size="sm" color="white" />}
          {summaryRunning ? "Analyzing conversation…" : "Seymour summary"}
        </button>
        )}

        {/* Refresh */}
        <button
          type="button"
          onClick={() => void load(contentType, daysBack)}
          disabled={loading}
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            border: "1px solid var(--border-primary, #e5e7eb)",
            background: "transparent",
            color: "var(--text-secondary, #374151)",
            fontSize: 12,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {(summaryRunning || summary || summaryError) && (
        <section style={{
          background: "var(--bg-secondary, #f8f9fa)",
          border: "1px solid var(--border-primary, #e5e7eb)",
          borderRadius: 12,
          padding: "16px 18px",
          marginBottom: 16,
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: summary || summaryError ? 12 : 0,
          }}>
            <div>
              <div style={{
                color: "var(--brand-primary, #ad35fa)",
                fontFamily: "var(--font-heading)",
                fontSize: 13,
                fontWeight: 700,
              }}>
                Seymour civic conversation brief
              </div>
              <div style={{ color: "var(--text-tertiary, #6b7280)", fontSize: 11 }}>
                {summary
                  ? `Last summary: ${new Date(summary.generated_at).toLocaleString()}`
                  : "No summary generated yet"}
                <span style={{ margin: "0 5px" }}>·</span>
                {summaryNextRunAt
                  ? `Next automatic run: ${new Date(summaryNextRunAt).toLocaleString()}`
                  : "No automatic run scheduled"}
                {summaryNeedsUpdate && (
                  <span style={{
                    color: "var(--warning, #d97706)",
                    fontWeight: 700,
                    marginLeft: 8,
                  }}>
                    Needs update
                  </span>
                )}
              </div>
            </div>
            {summaryRunning && (
              <span style={{ color: "var(--text-secondary, #374151)", fontSize: 12 }}>
                {summaryStatus}
              </span>
            )}
          </div>

          {summaryError && (
            <div style={{ color: "var(--error, #ef4444)", fontSize: 12 }}>
              {summaryError}
            </div>
          )}

          {summary && (
            <>
              <div className={[
                styles.civicSummaryMarkdown,
                !summaryExpanded ? styles.civicSummaryCollapsed : "",
              ].filter(Boolean).join(" ")}>
                <MarkdownWithEmbeds content={summary.summary_markdown} />
              </div>
              <button
                type="button"
                onClick={() => setSummaryExpanded((expanded) => !expanded)}
                className={styles.civicSummaryExpandButton}
                aria-expanded={summaryExpanded}
              >
                <span>{summaryExpanded ? "Show less" : "Show more"}</span>
              </button>
              <div style={{
                borderTop: "1px solid var(--border-primary, #e5e7eb)",
                color: "var(--text-tertiary, #6b7280)",
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                fontSize: 10,
                marginTop: 14,
                paddingTop: 10,
              }}>
                <span>{summary.item_count} source items</span>
                <span>{summary.social_item_count ?? 0} tracked social posts</span>
                <span>{new Date(summary.generated_at).toLocaleString()}</span>
                <span>Session {summary.session_id.slice(0, 8)}</span>
                {summary.model_key && <span>{summary.model_key}</span>}
                <span>${summary.estimated_cost_usd.toFixed(4)}</span>
              </div>
            </>
          )}
        </section>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 8,
          padding: "10px 14px",
          color: "var(--error, #ef4444)",
          fontSize: 12,
          marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {/* Officials tab — X posts or setup nudge */}
      {contentType === "officials" && !loading && items.length === 0 && (
        <div style={{
          padding: "48px 24px",
          textAlign: "center",
          color: "var(--text-tertiary, #6b7280)",
        }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>𝕏</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary, #374151)", marginBottom: 6 }}>
            X posts not yet collected
          </div>
          <div style={{ fontSize: 12, maxWidth: 380, margin: "0 auto", lineHeight: 1.7 }}>
            X handles are configured for all 12 SF supervisors + Mayor.
            Collection requires an X API <strong>Basic tier</strong> subscription ($100/mo)
            to read public timelines.
          </div>
          <a
            href="https://developer.twitter.com/en/portal/products"
            target="_blank" rel="noopener noreferrer"
            style={{
              display: "inline-block", marginTop: 16,
              padding: "7px 18px", borderRadius: 999,
              background: "var(--brand-primary, #ad35fa)", color: "#fff",
              fontSize: 12, fontWeight: 600, textDecoration: "none",
            }}
          >
            Upgrade X API plan ↗
          </a>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-tertiary, #94a3b8)" }}>
            Once subscribed, hit ↻ Refresh to pull the first batch of posts.
          </div>
        </div>
      )}

      {/* Officials — post feed */}
      {contentType === "officials" && !loading && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {items.filter(i => i.content_type === "post").map((post) => {
            const handle = post.meta.author_handle || post.source_name;
            const avatar = post.meta.author_profile_image;
            const dateStr = post.published_at
              ? new Date(post.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : null;
            const isDeleting = deletingId === post.id;
            return (
              <div
                key={post.id}
                role="button" tabIndex={0}
                onClick={() => setSelectedItem(post)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedItem(post); }}
                style={{
                  display: "flex", gap: 12, padding: "12px 4px",
                  borderBottom: "1px solid var(--border-primary, #e5e7eb)",
                  cursor: "pointer", opacity: isDeleting ? 0.4 : 1,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary, #f8f9fa)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {/* Avatar */}
                <div style={{ flexShrink: 0, width: 36, height: 36 }}>
                  {avatar ? (
                    <img src={avatar} alt={handle} width={36} height={36}
                      style={{ borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "var(--bg-secondary, #f3f4f6)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, color: "var(--text-tertiary, #94a3b8)", fontWeight: 700,
                    }}>
                      {(post.meta.author_name || handle).charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* RT label */}
                  {post.meta.is_retweet && (
                    <div style={{
                      fontSize: 11, color: "var(--text-tertiary, #6b7280)",
                      marginBottom: 4, display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <span>🔁</span>
                      <span style={{ fontWeight: 600 }}>{post.meta.author_name || handle}</span>
                      <span>retweeted</span>
                    </div>
                  )}

                  {/* Author row — for RTs show original author; for own tweets show supervisor */}
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #111827)" }}>
                      {post.meta.is_retweet
                        ? (post.meta.rt_author_name || `@${post.meta.rt_author_handle}`)
                        : (post.meta.author_name || handle)}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary, #94a3b8)" }}>
                      @{post.meta.is_retweet ? post.meta.rt_author_handle : handle}
                    </span>
                    {!post.meta.is_retweet && post.meta.official_district && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "1px 6px",
                        borderRadius: 999, border: "1px solid var(--border-primary, #e5e7eb)",
                        color: "var(--text-tertiary, #6b7280)",
                      }}>
                        D{post.meta.official_district}
                      </span>
                    )}
                    {dateStr && (
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary, #94a3b8)", flexShrink: 0 }}>
                        {dateStr}
                      </span>
                    )}
                  </div>

                  {/* Tweet text — full, no truncation in list view */}
                  <div style={{
                    fontSize: 13, color: "var(--text-primary, #111827)",
                    lineHeight: 1.55, marginBottom: 6,
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {post.body || post.title}
                  </div>

                  {/* Metrics */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 11, color: "var(--text-tertiary, #94a3b8)" }}>
                    {(post.meta.reply_count ?? 0) > 0 && (
                      <span>💬 {post.meta.reply_count}</span>
                    )}
                    {(post.meta.retweet_count ?? 0) > 0 && (
                      <span>🔁 {post.meta.retweet_count}</span>
                    )}
                    {(post.meta.like_count ?? 0) > 0 && (
                      <span>♥ {post.meta.like_count}</span>
                    )}
                    {post.url && (
                      <a href={post.url} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginLeft: "auto", color: "var(--brand-primary, #ad35fa)", textDecoration: "none" }}>
                        View ↗
                      </a>
                    )}
                    {canManage && !post.meta.is_retweet && <SeymourXReply itemId={post.id} />}
                  </div>
                </div>

                {/* Delete */}
                {canManage && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleDelete(post); }}
                  disabled={isDeleting} title="Delete"
                  style={{
                    flexShrink: 0, alignSelf: "flex-start", padding: "3px 6px", borderRadius: 4,
                    border: "1px solid transparent", background: "transparent",
                    color: "var(--text-tertiary, #94a3b8)", fontSize: 11, cursor: "pointer", opacity: 0.3,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.3"; }}
                >
                  ✕
                </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && contentType !== "officials" && items.length === 0 && (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-tertiary, #6b7280)", fontSize: 13 }}>
          No {contentType === "press" ? "press articles" : "civic items"} in the last {daysBack} days.{" "}
          <a href="/admin/civic" style={{ color: "var(--brand-primary, #ad35fa)" }}>Configure sources →</a>
        </div>
      )}

      {/* ── Grouped feed (All / City Hall tabs) ── */}
      {!loading && useGrouped && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {feedGroups.length > 0 && (
            <div style={{ margin: "2px 0 10px" }}>
              <div style={{
                color: "var(--text-primary, #111827)",
                fontFamily: "var(--font-heading)",
                fontSize: 15,
                fontWeight: 700,
              }}>
                Official Record
              </div>
              <div style={{
                color: "var(--text-tertiary, #6b7280)",
                fontSize: 11,
                marginTop: 2,
              }}>
                Meetings, agenda items, and recorded vote results
              </div>
            </div>
          )}
          {feedGroups.map((group) => {
            const { meeting, items: agendaItems } = group;
            const groupKey = String(meeting.meta.event_id ?? meeting.id);
            const collapsed = !expandedGroups.has(groupKey);
            const eventDateTime = formatEventDateTime(meeting.published_at, meeting.meta);
            const tierColor = TIER_COLOR_VAR[meeting.authority_tier] ?? "var(--text-tertiary, #6b7280)";

            return (
              <div key={groupKey} style={{ marginBottom: 10 }}>
                {/* ── Meeting header row ── */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroup(groupKey)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleGroup(groupKey); }}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 8px",
                    background: "var(--bg-secondary, #f8f9fa)",
                    border: "1px solid var(--border-primary, #e5e7eb)",
                    borderRadius: collapsed ? 8 : "8px 8px 0 0",
                    cursor: "pointer",
                  }}
                >
                  {/* Collapse toggle */}
                  <span style={{
                    flexShrink: 0, fontSize: 10, color: "var(--text-tertiary, #94a3b8)",
                    marginTop: 3, userSelect: "none", width: 12, textAlign: "center",
                  }}>
                    {collapsed ? "▶" : "▼"}
                  </span>

                  {/* Meeting pill */}
                  <span style={{
                    flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                    color: tierColor, border: `1px solid ${tierColor}`,
                    borderRadius: 999, padding: "2px 6px", marginTop: 2, whiteSpace: "nowrap",
                  }}>
                    Meeting
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Body name */}
                    <div style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                      color: "var(--text-tertiary, #6b7280)", textTransform: "uppercase",
                      marginBottom: 2,
                    }}>
                      {meeting.meta.body_name ?? meeting.source_name}
                    </div>
                    {/* Meeting title */}
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: "var(--text-primary, #111827)",
                      lineHeight: 1.35,
                    }}>
                      {meeting.title ?? "Meeting"}
                    </div>
                    {/* Date + time + item count */}
                    <div style={{
                      fontSize: 11, color: "var(--text-tertiary, #6b7280)",
                      marginTop: 2, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
                    }}>
                      {eventDateTime && <span style={{ fontWeight: 500, color: "var(--text-secondary, #374151)" }}>{eventDateTime}</span>}
                      {agendaItems.length > 0 && (
                        <span style={{ color: "var(--text-tertiary, #94a3b8)" }}>
                          {eventDateTime ? "·" : ""} {agendaItems.length} agenda item{agendaItems.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {/* meeting_page resource chips */}
                      {group.meetingPage?.meta.page_url && (
                        <a
                          href={group.meetingPage.meta.page_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            fontSize: 10, fontWeight: 600,
                            padding: "1px 7px", borderRadius: 999,
                            border: "1px solid var(--border-primary, #e5e7eb)",
                            color: "var(--text-secondary, #374151)",
                            background: "var(--bg-primary, #fff)",
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          📋 SF.gov agenda
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Open meeting detail + delete */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {meeting.id > 0 && (
                      <button
                        type="button"
                        title="View meeting details"
                        onClick={(e) => { e.stopPropagation(); setSelectedItem(meeting); }}
                        style={{
                          padding: "2px 8px", borderRadius: 4, fontSize: 11,
                          border: "1px solid var(--border-primary, #e5e7eb)",
                          background: "transparent", color: "var(--text-tertiary, #94a3b8)", cursor: "pointer",
                        }}
                      >
                        ↗
                      </button>
                    )}
                    {canManage && meeting.id > 0 && (
                      <button
                        type="button"
                        title="Delete meeting"
                        onClick={(e) => { e.stopPropagation(); void handleDelete(meeting); }}
                        disabled={deletingId === meeting.id}
                        style={{
                          padding: "2px 6px", borderRadius: 4, fontSize: 11,
                          border: "1px solid transparent",
                          background: "transparent", color: "var(--text-tertiary, #94a3b8)",
                          cursor: "pointer", opacity: 0.4,
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.4"; }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Agenda items (collapsible) ── */}
                {!collapsed && agendaItems.length > 0 && (
                  <div style={{
                    border: "1px solid var(--border-primary, #e5e7eb)",
                    borderTop: "none",
                    borderRadius: "0 0 8px 8px",
                    overflow: "hidden",
                  }}>
                    {agendaItems.map((agendaItem, idx) => {
                      const isLast = idx === agendaItems.length - 1;
                      const isDeleting = deletingId === agendaItem.id;
                      const voteTally = formatVoteTally(agendaItem.meta);
                      return (
                        <div
                          key={agendaItem.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedItem(agendaItem)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedItem(agendaItem); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "7px 12px 7px 30px",
                            borderBottom: isLast ? "none" : "1px solid var(--border-primary, #e5e7eb)",
                            background: "var(--bg-primary, #fff)",
                            cursor: "pointer",
                            opacity: isDeleting ? 0.4 : 1,
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary, #f8f9fa)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-primary, #fff)"; }}
                        >
                          {/* Sequence number */}
                          <span style={{
                            flexShrink: 0, fontSize: 10, fontWeight: 600,
                            color: "var(--text-tertiary, #94a3b8)", width: 20, textAlign: "right",
                          }}>
                            {agendaItem.meta.agenda_sequence ?? idx + 1}
                          </span>

                          {/* Title + meta */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 12, fontWeight: 500, color: "var(--text-primary, #111827)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {agendaItem.title ?? <em style={{ opacity: 0.45 }}>Untitled</em>}
                            </div>
                            <div style={{
                              display: "flex", gap: 5, alignItems: "center",
                              fontSize: 10, color: "var(--text-tertiary, #6b7280)",
                              marginTop: 1, flexWrap: "wrap",
                            }}>
                              {agendaItem.meta.matter_file && <span>{agendaItem.meta.matter_file}</span>}
                              {agendaItem.meta.matter_type && (
                                <><span>·</span><span>{agendaItem.meta.matter_type}</span></>
                              )}
                              {agendaItem.meta.action_text && (
                                <span style={{
                                  padding: "1px 5px", borderRadius: 999, fontSize: 9, fontWeight: 600,
                                  background: "var(--bg-tertiary, #f3f4f6)",
                                  color: "var(--text-secondary, #374151)",
                                  border: "1px solid var(--border-primary, #e5e7eb)",
                                }}>
                                  {abbreviateAction(agendaItem.meta.action_text)}
                                </span>
                              )}
                            </div>
                            {hasVoteResult(agendaItem.meta) && (
                              <div style={{
                                display: "flex",
                                gap: 5,
                                alignItems: "center",
                                flexWrap: "wrap",
                                fontSize: 10,
                                marginTop: 4,
                              }}>
                                <span style={{
                                  padding: "1px 6px",
                                  borderRadius: 999,
                                  background: "rgba(21, 128, 61, 0.08)",
                                  border: "1px solid rgba(21, 128, 61, 0.25)",
                                  color: "var(--success, #15803d)",
                                  fontWeight: 700,
                                }}>
                                  Vote{agendaItem.meta.vote_result ? `: ${agendaItem.meta.vote_result}` : ""}
                                </span>
                                {voteTally && (
                                  <span style={{ color: "var(--text-secondary, #374151)" }}>
                                    {voteTally}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Delete */}
                          {canManage && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); void handleDelete(agendaItem); }}
                            disabled={isDeleting}
                            title="Delete"
                            style={{
                              flexShrink: 0, padding: "2px 5px", borderRadius: 4,
                              border: "1px solid transparent", background: "transparent",
                              color: "var(--text-tertiary, #94a3b8)", fontSize: 10, cursor: "pointer", opacity: 0.3,
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.3"; }}
                          >
                            ✕
                          </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Meeting with no agenda items yet */}
                {!collapsed && agendaItems.length === 0 && (
                  <div style={{
                    padding: "8px 12px 8px 30px",
                    border: "1px solid var(--border-primary, #e5e7eb)", borderTop: "none",
                    borderRadius: "0 0 8px 8px",
                    fontSize: 11, color: "var(--text-tertiary, #94a3b8)", fontStyle: "italic",
                    background: "var(--bg-primary, #fff)",
                  }}>
                    No agenda items collected yet
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Non-meeting items shown in the aggregate All view ── */}
          {feedStandaloneItems.length > 0 && contentType !== "cityhall" && (
            <div style={{ marginTop: feedGroups.length > 0 ? 16 : 0 }}>
              {feedGroups.length > 0 && (
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                  color: "var(--text-tertiary, #94a3b8)", marginBottom: 8,
                }}>
                  News &amp; other sources
                </div>
              )}
              {feedStandaloneByDay.map((day) => (
                <section key={day.key} style={{ marginTop: 12 }}>
                  <div style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    padding: "5px 4px",
                    background: "var(--bg-primary, #fff)",
                    borderBottom: "1px solid var(--border-primary, #e5e7eb)",
                    color: "var(--text-secondary, #374151)",
                    fontFamily: "var(--font-heading)",
                    fontSize: 11,
                    fontWeight: 700,
                  }}>
                    {day.label}
                  </div>
                  {day.items.map((item) => {
                const tierColor = TIER_COLOR_VAR[item.authority_tier] ?? "var(--text-tertiary, #6b7280)";
                const isDeleting = deletingId === item.id;
                const accountName = item.meta.author_name ?? item.author;
                const accountHandle = item.meta.author_handle?.replace(/^@/, "");
                const accountLabel = accountName
                  ? `${accountName}${accountHandle ? ` (@${accountHandle})` : ""}`
                  : accountHandle
                    ? `@${accountHandle}`
                    : null;
                return (
                  <div
                    key={item.id}
                    role="button" tabIndex={0}
                    onClick={() => setSelectedItem(item)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedItem(item); }}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "9px 4px",
                      borderBottom: "1px solid var(--border-primary, #e5e7eb)",
                      cursor: "pointer", opacity: isDeleting ? 0.4 : 1,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary, #f8f9fa)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span style={{
                      flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                      color: tierColor, border: `1px solid ${tierColor}`,
                      borderRadius: 999, padding: "2px 6px", marginTop: 2, whiteSpace: "nowrap",
                    }}>
                      {TIER_LABEL[item.authority_tier]}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: "var(--text-primary, #111827)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {item.title ?? <em style={{ opacity: 0.45 }}>Untitled</em>}
                      </div>
                      <div style={{
                        display: "flex", gap: 6, alignItems: "center", marginTop: 2,
                        fontSize: 11, color: "var(--text-tertiary, #6b7280)",
                      }}>
                        <span style={{ fontWeight: 500 }}>{item.source_name}</span>
                        {accountLabel && <><span>·</span><span>{accountLabel}</span></>}
                        {item.published_at && (
                          <><span>·</span>
                          <span>{new Date(item.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></>
                        )}
                      </div>
                      {item.body && (
                        <p style={{
                          margin: "3px 0 0", fontSize: 11, color: "var(--text-tertiary, #6b7280)",
                          lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {item.body}
                        </p>
                      )}
                    </div>
                    {canManage && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleDelete(item); }}
                      disabled={isDeleting} title="Delete"
                      style={{
                        flexShrink: 0, alignSelf: "center", padding: "3px 7px", borderRadius: 4,
                        border: "1px solid transparent", background: "transparent",
                        color: "var(--text-tertiary, #94a3b8)", fontSize: 11, cursor: "pointer", opacity: 0.4,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.4"; }}
                    >
                      ✕
                    </button>
                    )}
                  </div>
                );
                  })}
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Flat feed (filtered tabs: Articles, Roster, etc.) ── */}
      {!loading && !useGrouped && contentType !== "officials" && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {feedStandaloneItems.map((item) => {
            const tierColor = TIER_COLOR_VAR[item.authority_tier] ?? "var(--text-tertiary, #6b7280)";
            const isDeleting = deletingId === item.id;
            return (
              <div
                key={item.id}
                role="button" tabIndex={0}
                onClick={() => setSelectedItem(item)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedItem(item); }}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "9px 4px",
                  borderBottom: "1px solid var(--border-primary, #e5e7eb)",
                  cursor: "pointer", opacity: isDeleting ? 0.4 : 1,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary, #f8f9fa)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{
                  flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                  color: tierColor, border: `1px solid ${tierColor}`,
                  borderRadius: 999, padding: "2px 6px", marginTop: 2, whiteSpace: "nowrap",
                }}>
                  {TIER_LABEL[item.authority_tier]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: "var(--text-primary, #111827)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.title ?? <em style={{ opacity: 0.45 }}>Untitled</em>}
                  </div>
                  <div style={{
                    display: "flex", gap: 6, alignItems: "center", marginTop: 2,
                    fontSize: 11, color: "var(--text-tertiary, #6b7280)",
                  }}>
                    <span style={{ fontWeight: 500 }}>{item.source_name}</span>
                    {item.author && <><span>·</span><span>{item.author}</span></>}
                    {item.published_at && (
                      <><span>·</span>
                      <span>{new Date(item.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></>
                    )}
                  </div>
                  {item.body && (
                    <p style={{
                      margin: "3px 0 0", fontSize: 11, color: "var(--text-tertiary, #6b7280)",
                      lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.body}
                    </p>
                  )}
                </div>
                {canManage && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleDelete(item); }}
                  disabled={isDeleting} title="Delete"
                  style={{
                    flexShrink: 0, alignSelf: "center", padding: "3px 7px", borderRadius: 4,
                    border: "1px solid transparent", background: "transparent",
                    color: "var(--text-tertiary, #94a3b8)", fontSize: 11, cursor: "pointer", opacity: 0.4,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.4"; }}
                >
                  ✕
                </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer link */}
      {!loading && isAdmin && (
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--border-primary, #e5e7eb)" }}>
          <a
            href="/admin/civic"
            style={{ fontSize: 11, color: "var(--text-tertiary, #94a3b8)", textDecoration: "none" }}
          >
            Manage civic sources &amp; collection health →
          </a>
        </div>
      )}

      {/* Modal */}
      {selectedItem && (
        <CivicItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onDelete={handleDelete}
          deleting={deletingId === selectedItem.id}
          canDelete={canManage}
        />
      )}
    </div>
  );
}

interface CityOpsDashboardProps {
  isAdmin: boolean;
  onViewJob?: (jobId: string) => void;
  /** Hide the page title when embedded as a tab in the admin dashboard. */
  embedded?: boolean;
  /** Lock the dashboard to one city when it is embedded in that city's admin view. */
  fixedCityId?: number;
  /** Select a specific ops panel on first render. */
  initialTab?: CityOpsTabId;
  /** Render only the selected panel, without the dashboard's own tab navigation. */
  singlePanel?: boolean;
}

export default function CityOpsDashboard({
  isAdmin,
  onViewJob,
  embedded,
  fixedCityId,
  initialTab = "overview",
  singlePanel = false,
}: CityOpsDashboardProps) {
  const { getAccessTokenSilently } = useAuth0();
  const viewJob = useCallback(
    (jobId: string) => onViewJob?.(jobId),
    [onViewJob]
  );
  const [cities, setCities] = useState<OpsCity[] | null>(null);
  const [cityId, setCityId] = useState<number | null>(fixedCityId ?? null);
  const [tab, setTab] = useState<CityOpsTabId>(initialTab);
  const [days, setDays] = useState(30);
  const [overviewSort, setOverviewSort] = useState<OpsStorySort>("period_views");
  const [storyRefresh, setStoryRefresh] = useState(0);
  const [metricsRefresh, setMetricsRefresh] = useState(0);
  const [editingMetricId, setEditingMetricId] = useState<number | null>(null);
  const [usage, setUsage] = useState<OpsCityUsage | null>(null);
  const [cost, setCost] = useState<OpsCityLlmCost | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingSession, setViewingSession] = useState<{ id: string; label: string } | null>(
    null
  );
  // Job sessions are admin-readable only; leads and analysts see the job name.
  const viewSession = isAdmin
    ? (id: string, label = "Creation session") => setViewingSession({ id, label })
    : undefined;
  const [reviewing, setReviewing] = useState<{
    story: ReviewStory;
    evals: OpsStoryReview["evals"];
  } | null>(null);
  const [busyStoryId, setBusyStoryId] = useState<number | null>(null);

  const markVisibility = useCallback((storyId: number, status: "active" | "hidden") => {
    setUsage((prev) =>
      prev
        ? {
            ...prev,
            top_stories: prev.top_stories.map((s) =>
              s.id === storyId ? { ...s, status } : s
            ),
          }
        : prev
    );
    setReviewing((prev) =>
      prev && prev.story.id === storyId ? { ...prev, story: { ...prev.story, status } } : prev
    );
  }, []);

  const dropStory = useCallback((storyId: number) => {
    setUsage((prev) =>
      prev
        ? { ...prev, top_stories: prev.top_stories.filter((s) => s.id !== storyId) }
        : prev
    );
    setReviewing((prev) => (prev && prev.story.id === storyId ? null : prev));
  }, []);

  const toggleVisibility = useCallback(
    async (story: OpsCityStory) => {
      if (cityId == null) return;
      const next = nextPublicVisibility(story.status);
      setBusyStoryId(story.id);
      try {
        const token = await getAccessTokenSilently();
        await opsSetStoryVisibility(cityId, story.id, next, token);
        const path = publicStoryPath(story);
        if (isCanonicalStoryPath(path)) void revalidatePublicStory(path);
        markVisibility(story.id, next);
        toast.success(visibilitySuccessMessage(next));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update visibility");
      } finally {
        setBusyStoryId(null);
      }
    },
    [cityId, getAccessTokenSilently, markVisibility]
  );

  const deleteStory = useCallback(
    async (story: OpsCityStory) => {
      if (cityId == null) return;
      const headline = story.headline.trim() || "this story";
      if (
        !window.confirm(
          `Delete "${headline}"? This removes it from the public site and cannot be undone.`
        )
      ) {
        return;
      }
      setBusyStoryId(story.id);
      try {
        const token = await getAccessTokenSilently();
        await opsDeleteStory(cityId, story.id, token);
        const path = publicStoryPath(story);
        if (isCanonicalStoryPath(path)) void revalidatePublicStory(path);
        dropStory(story.id);
        toast.success("Story deleted.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not delete story");
      } finally {
        setBusyStoryId(null);
      }
    },
    [cityId, dropStory, getAccessTokenSilently]
  );

  const openStory = useCallback(
    async (story: OpsCityStory) => {
      if (cityId == null) return;
      try {
        const token = await getAccessTokenSilently();
        const res = await getOpsStoryReview(cityId, story.id, token);
        setReviewing({ story: toReviewStory(res.story), evals: res.evals });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to open story");
      }
    },
    [cityId, getAccessTokenSilently]
  );

  const reviewApi = useMemo<StoryReviewApi | null>(() => {
    if (cityId == null) return null;
    return {
      loadEvals: async (storyId, token) =>
        (await getOpsStoryReview(cityId, storyId, token)).evals,
      judge: (storyId, token) => opsJudgeStory(cityId, storyId, token),
      rejudge: (evalId, storyId, token) => opsRejudgeStory(cityId, storyId, evalId, token),
      autocorrect: (evalId, storyId, token) =>
        opsAutocorrectStory(cityId, storyId, evalId, token),
      override: (storyId, token) => opsSetStoryOverride(cityId, storyId, false, token),
      revokeOverride: (storyId, token) => opsSetStoryOverride(cityId, storyId, true, token),
      setVisibility: (storyId, status, token) =>
        opsSetStoryVisibility(cityId, storyId, status, token),
      deleteStory: isAdmin
        ? (storyId, token) => opsDeleteStory(cityId, storyId, token)
        : undefined,
    };
  }, [cityId, isAdmin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await getOpsCities(token);
        if (cancelled) return;
        setCities(res.cities);
        setCityId(fixedCityId ?? res.cities[0]?.city_id ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load cities");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fixedCityId, getAccessTokenSilently]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const load = useCallback(async () => {
    if (cityId == null || tab === "health" || tab === "metrics" || tab === "stories") return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      if (tab === "overview") {
        setUsage(await getOpsCityUsage(cityId, token, { days, sort: overviewSort }));
      } else if (tab === "llm-costs") {
        setCost(await getOpsCityLlmCost(cityId, token, { days }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [cityId, tab, days, overviewSort, getAccessTokenSilently]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setUsage(null);
    setCost(null);
  }, [cityId]);

  // Badge on the City health tab: critical issues for this city (launched or dark).
  const [criticalAlerts, setCriticalAlerts] = useState(0);
  useEffect(() => {
    if (cityId == null) {
      setCriticalAlerts(0);
      return;
    }
    // The health tab loads this payload itself, and single-panel embeds have no
    // tab bar to put the badge on. Skip the badge request in both cases.
    if (tab === "health" || singlePanel) return;
    let cancelled = false;
    setCriticalAlerts(0);
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await getOpsCityHealth(cityId, token, { daysBack: 14 });
        const { cities } = ensureCitiesAttention(res.cities || [], res.attention_summary ?? null);
        if (!cancelled) setCriticalAlerts(countCriticalAlerts(cities));
      } catch (e) {
        console.error("Failed to load critical alert count", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cityId, tab, singlePanel, getAccessTokenSilently]);

  const selected = cities?.find((c) => c.city_id === cityId) ?? null;
  // Civic Discussion is visible to global admins and to city leads
  // (can_manage) on the city they lead — this is the briefing + feed tab
  // city leads see on their default ops landing page.
  const showCivicTab = isAdmin || !!selected?.can_manage;

  if (cities && cities.length === 0) {
    return (
      <div className={styles.root}>
        {!embedded && <h2 className={styles.title}>Dashboards</h2>}
        <p className={styles.note}>
          Follow a city to see its dashboard here. Analysts see the cities they follow and their
          home city; city leads see the cities they are assigned to.
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.root} ${singlePanel ? styles.panelRoot : ""}`}>
      <div className={styles.header}>
        <div>
          {!embedded && <h2 className={styles.title}>{selected ? selected.name : "Dashboards"}</h2>}
          {selected && !selected.can_manage && (
            <div className={styles.subtitle}>View only</div>
          )}
        </div>
        {/* Civic tab owns its own city selector + refresh — hide them here */}
        {tab !== "civic" && (
        <div className={styles.toolbar}>
          {!fixedCityId && cities && cities.length > 1 && (
            <select
              className={styles.metricSelect}
              value={cityId ?? ""}
              onChange={(e) => setCityId(Number(e.target.value))}
              aria-label="City"
            >
              {cities.map((c) => (
                <option key={c.city_id} value={c.city_id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {usesWindow(tab) &&
            PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                className={days === p.days ? styles.presetBtnActive : styles.presetBtn}
                onClick={() => setDays(p.days)}
              >
                {p.label}
              </button>
            ))}
          {tab !== "health" && (
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={() => {
                if (tab === "stories") setStoryRefresh((n) => n + 1);
                else if (tab === "metrics") setMetricsRefresh((n) => n + 1);
                else void load();
              }}
              disabled={loading}
            >
              {loading ? "Loading…" : "↻ Refresh"}
            </button>
          )}
        </div>
        )}
      </div>

      {!singlePanel && (
        <div className={styles.tabBar}>
          {TABS.filter((t) => t.id !== "civic" || showCivicTab).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={tab === t.id ? styles.tabActive : styles.tab}
            >
              {t.label}
              {t.id === "health" && criticalAlerts > 0 && (
                <span className={styles.tabBadge} title="Critical issues needing attention">
                  {criticalAlerts}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {error && <div className={styles.errorBanner}>{error}</div>}
      {loading && usesWindow(tab) && tab !== "stories" && (
        <div className={styles.loading}>Loading…</div>
      )}

      {cityId != null && tab === "overview" && usage && (
        <UsagePanel
          usage={usage}
          storySort={overviewSort}
          onStorySortChange={setOverviewSort}
          onViewSession={viewSession}
          onOpenStory={openStory}
          canManage={!!selected?.can_manage}
          canDelete={isAdmin}
          busyStoryId={busyStoryId}
          onToggleVisibility={(story) => void toggleVisibility(story)}
          onDelete={(story) => void deleteStory(story)}
        />
      )}
      {cityId != null && tab === "stories" && selected && (
        <OpsStoriesTab
          cityId={cityId}
          cityName={selected.name}
          canManage={selected.can_manage}
          isAdmin={isAdmin}
          days={days}
          refreshToken={storyRefresh}
          onViewJob={onViewJob}
        />
      )}
      {cityId != null && tab === "llm-costs" && cost && <LlmCostPanel cost={cost} />}
      {cityId != null && tab === "health" && selected && (
        <ScheduleHealthDashboard
          key={cityId}
          token={null}
          getAccessTokenSilently={getAccessTokenSilently}
          onViewJob={viewJob}
          scope={{ cityId, canManage: selected.can_manage, isAdmin }}
        />
      )}
      {cityId != null && tab === "metrics" && selected && (
        <CitySiteView
          key={`${cityId}-${metricsRefresh}`}
          scope={{ cityId, canManage: selected.can_manage, isAdmin }}
          onViewJob={viewJob}
          onEditMetric={isAdmin ? setEditingMetricId : undefined}
        />
      )}
      {cityId != null && tab === "civic" && (singlePanel || showCivicTab) && (
        <CivicIntelPanel
          cityId={cityId}
          cities={
            fixedCityId
              ? undefined
              : cities?.map((c) => ({ city_id: c.city_id, name: c.name }))
          }
          onCityChange={fixedCityId ? undefined : (id) => setCityId(id)}
          canManage={selected?.can_manage ?? isAdmin}
          isAdmin={isAdmin}
        />
      )}
      {reviewing && reviewApi && (
        <StoryReviewModal
          story={reviewing.story}
          initialEvals={reviewing.evals}
          api={reviewApi}
          canAct={!!selected?.can_manage}
          onClose={() => {
            setReviewing(null);
            void load();
          }}
          onViewSession={viewSession}
          onVisibilityChange={markVisibility}
          onDeleted={dropStory}
        />
      )}
      {editingMetricId != null && (
        <MetricEditModal
          metricId={editingMetricId}
          isOpen
          onClose={() => setEditingMetricId(null)}
        />
      )}
      {viewingSession && (
        <SessionViewerModal
          sessionId={viewingSession.id}
          label={viewingSession.label}
          onClose={() => setViewingSession(null)}
        />
      )}
    </div>
  );
}
