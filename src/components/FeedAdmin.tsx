"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type FeedStory,
  type CityWithFeedStories,
  type CreateFeedStoryPayload,
  listFeedStories,
  listCitiesWithFeedStories,
  deleteFeedStory,
  deleteFeedStoriesByCity,
  createFeedStory,
  updateFeedStory,
  likeFeedStoryAdmin,
  unlikeFeedStoryAdmin,
} from "@/lib/api/feed";
import {
  autocorrectStoryEval,
  getJob,
  getStoryEvalSettings,
  importStoryEvals,
  listStoryEvals,
  overrideStoryEligible,
  rejudgeStoryEval,
  revokeStoryEligibleOverride,
  updateStoryEvalSettings,
  type StoryEvalRow,
  type StoryEvalSettings,
} from "@/lib/apiClient";
import { slugify } from "@/lib/utils";
import JobSessionDebugLink from "@/components/JobSessionDebugLink";
import Loader from "@/components/Loader";
import { EvalCorrectionHistoryPanel } from "@/components/eval/EvalCorrectionHistoryPanel";
import { EvalTicketsPanel } from "@/components/eval/EvalTicketsPanel";
import { JudgeScoresPanel, ScoreBadge } from "@/components/eval/JudgeScoresPanel";
import SessionViewerModal from "@/components/eval/SessionViewerModal";
import { VisualizationDeferredInteractiveContainer } from "@/components/VisualizationDeferredInteractiveContainer";
import { processVisualizationShortcodes } from "@/lib/visualizationShortcodes";
import styles from "./FeedAdmin.module.css";

type TimeRange = "day" | "week" | "month" | "all";
type ExportTimeRange = "today" | "week" | "month" | "year" | "all";
type EvalFilter = "" | "passing" | "failing" | "unjudged";

const PASSING_ACCURACY = 4;

const TIME_RANGE_MS: Record<Exclude<TimeRange, "all">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const EXPORT_TIME_RANGE_MS: Record<Exclude<ExportTimeRange, "all">, number> = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

function formatDate(value?: string | null): string {
  if (!value) return "\u2014";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString();
}

function storyAccuracy(story: FeedStory): number | null {
  const raw = story.metadata?.eval_accuracy;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function GatingBadge({
  accuracy,
  manualOverride,
}: {
  accuracy: number | null;
  manualOverride?: boolean;
}) {
  if (manualOverride) {
    return (
      <span className={`${styles.badge} ${styles.badgeYellow}`} title="Admin override: eligible regardless of eval score">
        override: eligible
      </span>
    );
  }
  if (accuracy == null) {
    return <span className={styles.badge}>unjudged</span>;
  }
  if (accuracy >= PASSING_ACCURACY) {
    return (
      <span className={`${styles.badge} ${styles.badgeGreen}`}>
        public + newsletter
      </span>
    );
  }
  return (
    <span
      className={`${styles.badge} ${styles.badgeRed}`}
      title="Hidden from the public site and newsletter pools until accuracy ≥ 4 or admin override"
    >
      hidden: accuracy {accuracy}
    </span>
  );
}

function fmtTokens(n?: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtCost(n?: number | null): string {
  if (n == null) return "—";
  if (n < 0.001) return "<$0.001";
  return `$${n.toFixed(3)}`;
}

function fmtMs(ms?: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Creation-session tool-call summary for the story-eval sidebar. */
function StoryEvalTelemetry({ row }: { row: StoryEvalRow }) {
  const t = row.run_telemetry;
  const u = row.judge_usage;
  const byName =
    t?.tool_calls_by_name || t?.session_tool_calls_by_name || null;
  const toolCount = t?.tool_call_count ?? t?.session_tool_call_count;
  const llmCount = t?.llm_call_count ?? t?.session_llm_call_count;
  const failed = t?.failed_tool_calls ?? t?.session_failed_tool_calls;
  const execMs = t?.execution_time_ms ?? t?.session_execution_time_ms;

  if (!t && !u) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
        Creation session
      </div>
      <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          <tr>
            <td className={styles.muted}>Session trace</td>
            <td style={{ textAlign: "right" }}>
              {t?.session_trace_available
                ? `${toolCount ?? 0} calls loaded`
                : "not available"}
            </td>
          </tr>
          <tr>
            <td className={styles.muted}>LLM calls</td>
            <td style={{ textAlign: "right" }}>{llmCount ?? "n/a"}</td>
          </tr>
          <tr>
            <td className={styles.muted}>Tool calls</td>
            <td style={{ textAlign: "right" }}>
              {toolCount ?? "n/a"}
              {failed ? ` (${failed} failed)` : ""}
            </td>
          </tr>
          {execMs != null && (
            <tr>
              <td className={styles.muted}>Session time</td>
              <td style={{ textAlign: "right" }}>{fmtMs(execMs)}</td>
            </tr>
          )}
          {(row.judge_model_key || u) && (
            <tr>
              <td className={styles.muted}>Judge model</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>
                {row.judge_model_key || "default"}
              </td>
            </tr>
          )}
          {u && (
            <tr>
              <td className={styles.muted}>Judge cost / time</td>
              <td style={{ textAlign: "right" }}>
                {fmtCost(u.cost_usd)} / {fmtMs(u.judge_ms)}
                {u.prompt_tokens != null || u.completion_tokens != null
                  ? ` · ${fmtTokens(u.prompt_tokens)}→${fmtTokens(u.completion_tokens)}`
                  : ""}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {byName && Object.keys(byName).length > 0 && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--text-secondary)",
            lineHeight: 1.45,
          }}
        >
          {Object.entries(byName)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `${count}× ${name}`)
            .join(", ")}
        </div>
      )}
    </div>
  );
}

function extractVisualizationUrl(viz: Record<string, any> | null | undefined): string {
  if (!viz) return "";
  return viz.url || viz.image_url || viz.src || viz.chart_url || viz.embed_url || "";
}

function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Auto-correction history panel for the eval sidebar. */
function CorrectionHistoryPanel({ row }: { row: StoryEvalRow }) {
  return (
    <EvalCorrectionHistoryPanel
      attemptedAt={row.correction_attempted_at}
      sessionId={row.correction_session_id}
      fields={row.correction_fields}
      errors={row.correction_errors}
      before={row.correction_before}
      after={row.correction_after}
      attempts={row.correction_attempts}
      attemptCount={row.correction_attempt_count}
    />
  );
}

function filterByTime(stories: FeedStory[], range: TimeRange | ExportTimeRange, rangeMap: Record<string, number>): FeedStory[] {
  if (range === "all") return stories;
  const ms = rangeMap[range];
  if (!ms) return stories;
  const cutoff = Date.now() - ms;
  return stories.filter((s) => {
    const d = new Date(s.story_date).getTime();
    return !Number.isNaN(d) && d >= cutoff;
  });
}

/** Public story page for admin preview — not the CTA `detail_url` (report / chart / anomaly). */
function publicStoryPath(story: FeedStory): string {
  if (story.canonical_path?.startsWith("/")) return story.canonical_path;
  if (story.public_url?.startsWith("/")) return story.public_url;
  if (story.short_hash && story.city_name) {
    const slug = slugify(story.city_name);
    if (slug) return `/c/${slug}/stories/${story.short_hash}`;
  }
  if (story.short_hash) return `/s/${story.short_hash}`;
  return `/feed/${story.id}`;
}

const PAGE_SIZE = 50;
const FETCH_BATCH = 200;

export default function FeedAdmin() {
  const { getAccessTokenSilently } = useAuth0();

  const [stories, setStories] = useState<FeedStory[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [cities, setCities] = useState<CityWithFeedStories[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table filters
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [evalFilter, setEvalFilter] = useState<EvalFilter>("");
  const [selectedStoryIds, setSelectedStoryIds] = useState<Set<number>>(new Set());
  const [judgingSelected, setJudgingSelected] = useState(false);

  // Story-eval auto-correct switch (platform setting, default on)
  const [evalSettings, setEvalSettings] = useState<StoryEvalSettings | null>(null);
  const [savingEvalSettings, setSavingEvalSettings] = useState(false);

  // Table pagination
  const [page, setPage] = useState(0);

  // Export state
  const [showExport, setShowExport] = useState(false);
  const [exportCityId, setExportCityId] = useState<number | null>(null);
  const [exportTimeRange, setExportTimeRange] = useState<ExportTimeRange>("all");

  // Delete state
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Like state
  const [likingId, setLikingId] = useState<number | null>(null);

  // Editor modal state (create = editingStory null; edit = existing story)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStory, setEditorStory] = useState<FeedStory | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorForm, setEditorForm] = useState<CreateFeedStoryPayload>({
    city_id: 1,
    district: 0,
    headline: "",
    description: "",
    summary: "",
    story_type: "research",
    status: "active",
    visualization_type: null,
    image_url: "",
    image_alt: "",
    cta_label: "",
    is_featured: false,
    priority_score: 0.5,
    story_date: new Date().toISOString().slice(0, 10),
  });

  // Story preview popover + eval sidebar
  const [previewStory, setPreviewStory] = useState<FeedStory | null>(null);
  const [previewEvals, setPreviewEvals] = useState<StoryEvalRow[]>([]);
  const [previewEvalsLoading, setPreviewEvalsLoading] = useState(false);
  // Which eval row is shown in detail (null = latest)
  const [selectedEvalId, setSelectedEvalId] = useState<number | null>(null);
  const [viewingSession, setViewingSession] = useState<{ id: string; label: string } | null>(null);
  const [previewJudging, setPreviewJudging] = useState(false);
  const [rejudgingId, setRejudgingId] = useState<number | null>(null);
  const [correctingId, setCorrectingId] = useState<number | null>(null);
  const [lastCorrectionResult, setLastCorrectionResult] = useState<{
    corrected: boolean;
    changed_fields?: string[];
    reason?: string;
  } | null>(null);
  const [overridingEligibility, setOverridingEligibility] = useState(false);

  // Expand [chart:]/[map:]/[anomaly:] shortcodes into live embeds; keep the
  // debug label so admins can still see which shortcode produced each embed.
  const previewArticleHtml = useMemo(() => {
    const html = previewStory?.article_html?.trim();
    if (!html) return null;
    return processVisualizationShortcodes(html, {
      chartHeight: "480px",
      mapHeight: "480px",
      anomalyHeight: "380px",
    });
  }, [previewStory]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getAccessTokenSilently();
        const settings = await getStoryEvalSettings(token);
        if (!cancelled) setEvalSettings(settings);
      } catch (err) {
        console.error("Error loading story eval settings:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessTokenSilently]);

  const handleToggleAutoCorrect = useCallback(
    async (enabled: boolean) => {
      try {
        setSavingEvalSettings(true);
        const token = await getAccessTokenSilently();
        const settings = await updateStoryEvalSettings(
          { auto_correct: enabled },
          token
        );
        setEvalSettings(settings);
        toast.success(
          enabled
            ? "Auto-correct on — failing stories get up to 3 repair attempts (re-judge between each)"
            : "Auto-correct off — failing stories keep their original text"
        );
      } catch (err) {
        console.error("Error saving story eval settings:", err);
        toast.error(err instanceof Error ? err.message : "Could not save setting");
      } finally {
        setSavingEvalSettings(false);
      }
    },
    [getAccessTokenSilently]
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();

      // Fetch cities in parallel with first batch of stories
      const [firstBatch, citiesRes] = await Promise.all([
        listFeedStories(token, {
          all_cities: true,
          include_staff_saved_place_stories: true,
          include_failing_accuracy: true,
          limit: FETCH_BATCH,
          offset: 0,
          order_by: "story_date:desc",
        }),
        listCitiesWithFeedStories(token),
      ]);

      let allStories = [...firstBatch.stories];
      // `count` is the page size; `total_count` is the actual total across all pages.
      const total = firstBatch.total_count ?? firstBatch.count;
      setTotalCount(total);
      setCities(citiesRes);

      // Fetch remaining pages until we've pulled every story.
      if (firstBatch.stories.length === FETCH_BATCH) {
        let offset = FETCH_BATCH;
        while (true) {
          const batch = await listFeedStories(token, {
            all_cities: true,
            include_staff_saved_place_stories: true,
            include_failing_accuracy: true,
            limit: FETCH_BATCH,
            offset,
            order_by: "story_date:desc",
          });
          allStories = [...allStories, ...batch.stories];
          if (batch.stories.length < FETCH_BATCH) break;
          offset += FETCH_BATCH;
        }
        setTotalCount(allStories.length);
      }

      setStories(allStories);
    } catch (err: any) {
      setError(err?.message || "Failed to load feed data");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stats
  const stats = useMemo(() => {
    const now = Date.now();
    const day = now - 24 * 60 * 60 * 1000;
    const week = now - 7 * 24 * 60 * 60 * 1000;
    let last24h = 0;
    let last7d = 0;
    for (const s of stories) {
      const d = new Date(s.story_date).getTime();
      if (Number.isNaN(d)) continue;
      if (d >= day) last24h++;
      if (d >= week) last7d++;
    }
    return { total: totalCount || stories.length, last24h, last7d };
  }, [stories, totalCount]);

  // Filtered stories for table
  const filteredStories = useMemo(() => {
    let result = filterByTime(stories, timeRange, TIME_RANGE_MS);
    if (selectedCityId !== null) {
      result = result.filter((s) => s.city_id === selectedCityId);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((s) => {
        const haystack = [
          s.headline,
          s.description,
          s.summary,
          s.article_html,
          s.short_hash,
          String(s.id),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    if (evalFilter) {
      result = result.filter((s) => {
        const accuracy = storyAccuracy(s);
        if (evalFilter === "unjudged") return accuracy == null;
        if (evalFilter === "passing")
          return accuracy != null && accuracy >= PASSING_ACCURACY;
        if (evalFilter === "failing")
          return accuracy != null && accuracy < PASSING_ACCURACY;
        return true;
      });
    }
    return result;
  }, [stories, timeRange, selectedCityId, searchQuery, evalFilter]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
    setSelectedStoryIds(new Set());
  }, [timeRange, selectedCityId, searchQuery, evalFilter]);

  // Paginated slice for table display
  const totalPages = Math.max(1, Math.ceil(filteredStories.length / PAGE_SIZE));
  const pagedStories = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filteredStories.slice(start, start + PAGE_SIZE);
  }, [filteredStories, page]);

  // Delete single story
  const handleDeleteStory = useCallback(
    async (storyId: number, headline: string) => {
      const confirmed = window.confirm(`Delete story "${headline}"?\n\nThis cannot be undone.`);
      if (!confirmed) return;
      try {
        setDeletingId(storyId);
        const token = await getAccessTokenSilently();
        await deleteFeedStory(storyId, token);
        setStories((prev) => prev.filter((s) => s.id !== storyId));
      } catch (err: any) {
        alert(`Failed to delete story: ${err?.message || "Unknown error"}`);
      } finally {
        setDeletingId(null);
      }
    },
    [getAccessTokenSilently],
  );

  const applyLikeState = useCallback(
    (storyId: number, liked: boolean, likeCount: number) => {
      setStories((prev) =>
        prev.map((s) =>
          s.id === storyId
            ? { ...s, liked_by_me: liked, applaud_count: likeCount }
            : s,
        ),
      );
      setPreviewStory((prev) =>
        prev && prev.id === storyId
          ? { ...prev, liked_by_me: liked, applaud_count: likeCount }
          : prev,
      );
    },
    [],
  );

  const handleToggleLikeStory = useCallback(
    async (storyId: number, currentlyLiked: boolean) => {
      try {
        setLikingId(storyId);
        const token = await getAccessTokenSilently();
        const res = currentlyLiked
          ? await unlikeFeedStoryAdmin(storyId, token)
          : await likeFeedStoryAdmin(storyId, token);
        applyLikeState(storyId, res.liked, res.like_count);
      } catch (err: any) {
        alert(
          `Failed to ${currentlyLiked ? "unlike" : "like"} story: ${
            err?.message || "Unknown error"
          }`,
        );
      } finally {
        setLikingId(null);
      }
    },
    [getAccessTokenSilently, applyLikeState],
  );

  // Bulk delete stories for a city
  const handleBulkDelete = useCallback(async () => {
    if (selectedCityId === null) return;
    const city = cities.find((c) => c.city_id === selectedCityId);
    const cityName = city?.city_name || `City ${selectedCityId}`;
    const count = filteredStories.length;
    const confirmed = window.confirm(
      `Delete ALL ${count} stories for ${cityName}?\n\nThis cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      setBulkDeleting(true);
      const token = await getAccessTokenSilently();
      await deleteFeedStoriesByCity(selectedCityId, token);
      setStories((prev) => prev.filter((s) => s.city_id !== selectedCityId));
    } catch (err: any) {
      alert(`Failed to delete stories: ${err?.message || "Unknown error"}`);
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedCityId, cities, filteredStories.length, getAccessTokenSilently]);

  // CSV export
  const handleExport = useCallback(() => {
    let toExport = stories;

    // Filter by city
    if (exportCityId !== null) {
      toExport = toExport.filter((s) => s.city_id === exportCityId);
    }

    // Filter by time
    toExport = filterByTime(toExport, exportTimeRange, EXPORT_TIME_RANGE_MS);

    const header = "date,city,headline,story_type,link,story_text,image_chart_url";
    const rows = toExport.map((s) => {
      const text = s.summary || s.description || "";
      const vizUrl = extractVisualizationUrl(s.primary_visualization);
      const link = s.detail_url.startsWith("http") ? s.detail_url : `${window.location.origin}${s.detail_url}`;
      return [
        escapeCSV(s.story_date || ""),
        escapeCSV(s.city_name || ""),
        escapeCSV(s.headline || ""),
        escapeCSV(s.story_type || ""),
        escapeCSV(link),
        escapeCSV(text),
        escapeCSV(vizUrl),
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cityLabel = exportCityId
      ? cities.find((c) => c.city_id === exportCityId)?.city_name || "city"
      : "all-cities";
    a.download = `feed-stories-${cityLabel}-${exportTimeRange}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExport(false);
  }, [stories, exportCityId, exportTimeRange, cities]);

  // Editor: open for new story
  const handleOpenCreate = useCallback(() => {
    setEditorStory(null);
    setEditorError(null);
    setEditorForm({
      city_id: selectedCityId ?? cities[0]?.city_id ?? 1,
      district: 0,
      headline: "",
      description: "",
      summary: "",
      story_type: "research",
      status: "active",
      visualization_type: null,
      image_url: "",
      image_alt: "",
      cta_label: "",
      is_featured: false,
      priority_score: 0.5,
      story_date: new Date().toISOString().slice(0, 10),
    });
    setEditorOpen(true);
  }, [selectedCityId, cities]);

  // Editor: open for existing story
  const handleOpenEdit = useCallback((story: FeedStory) => {
    setEditorStory(story);
    setEditorError(null);
    setEditorForm({
      city_id: story.city_id,
      district: story.district,
      headline: story.headline,
      description: story.description,
      summary: story.summary || "",
      story_type: story.story_type,
      status: (story.status as any) || "active",
      visualization_type: (story.visualization_type as any) || null,
      image_url: "",
      image_alt: "",
      cta_label: story.cta_label || "",
      is_featured: story.is_featured,
      priority_score: story.priority_score,
      story_date: story.story_date,
    });
    setEditorOpen(true);
  }, []);

  const handleEditorSave = useCallback(async () => {
    if (!editorForm.headline.trim() || !editorForm.description.trim()) {
      setEditorError("Headline and description are required");
      return;
    }
    try {
      setEditorSaving(true);
      setEditorError(null);
      const token = await getAccessTokenSilently();
      const clean: any = { ...editorForm };
      // Convert empty-string summary/cta_label to null so the DB clears them.
      for (const k of ["summary", "cta_label"]) {
        if (clean[k] === "") clean[k] = null;
      }
      // Image fields aren't exposed in this form. Don't send them on PATCH —
      // otherwise the empty defaults would wipe any existing values.
      for (const k of ["image_url", "image_alt", "image_caption", "article_html"]) {
        delete clean[k];
      }
      if (editorStory) {
        await updateFeedStory(editorStory.id, clean, token);
      } else {
        await createFeedStory(clean, token);
      }
      setEditorOpen(false);
      await loadData();
    } catch (err: any) {
      setEditorError(err?.message || "Save failed");
    } finally {
      setEditorSaving(false);
    }
  }, [editorForm, editorStory, getAccessTokenSilently, loadData]);

  // Open the canonical public story page (same slug as /s/[hash] redirect), not detail_url.
  const handleStoryClick = useCallback((story: FeedStory) => {
    setPreviewStory(story);
  }, []);

  const loadPreviewEvals = useCallback(
    async (storyId: number) => {
      try {
        setPreviewEvalsLoading(true);
        const token = await getAccessTokenSilently();
        const res = await listStoryEvals(token, {
          story_id: storyId,
          page: 1,
          page_size: 10,
        });
        setPreviewEvals(res.items);
        const latest = res.items.find((r) => r.accuracy_score != null);
        if (latest?.accuracy_score != null) {
          const accuracy = latest.accuracy_score;
          setStories((prev) =>
            prev.map((s) => {
              if (s.id !== storyId) return s;
              if (Number(s.metadata?.eval_accuracy) === accuracy) return s;
              return {
                ...s,
                metadata: {
                  ...(s.metadata || {}),
                  eval_accuracy: accuracy,
                },
              };
            }),
          );
          setPreviewStory((prev) => {
            if (!prev || prev.id !== storyId) return prev;
            if (Number(prev.metadata?.eval_accuracy) === accuracy) return prev;
            return {
              ...prev,
              metadata: {
                ...(prev.metadata || {}),
                eval_accuracy: accuracy,
              },
            };
          });
        }
      } catch (err) {
        console.error("Error loading story evals:", err);
        setPreviewEvals([]);
      } finally {
        setPreviewEvalsLoading(false);
      }
    },
    [getAccessTokenSilently],
  );

  const previewStoryId = previewStory?.id ?? null;
  useEffect(() => {
    if (previewStoryId == null) {
      setPreviewEvals([]);
      setSelectedEvalId(null);
      return;
    }
    setSelectedEvalId(null);
    void loadPreviewEvals(previewStoryId);
  }, [previewStoryId, loadPreviewEvals]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedStoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectPage = useCallback(() => {
    setSelectedStoryIds((prev) => {
      const pageIds = pagedStories.map((s) => s.id);
      const allSelected = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }, [pagedStories]);

  const handleJudgeStories = useCallback(
    async (storyIds: number[]) => {
      if (storyIds.length === 0) return;
      try {
        setJudgingSelected(true);
        const token = await getAccessTokenSilently();
        const res = await importStoryEvals({ story_ids: storyIds }, token);
        toast.success(
          `Judging ${res.imported} stor${res.imported === 1 ? "y" : "ies"} in the background`,
        );
        setSelectedStoryIds(new Set());
        if (previewStory && storyIds.includes(previewStory.id)) {
          setTimeout(() => void loadPreviewEvals(previewStory.id), 1200);
        }
      } catch (err) {
        console.error("Error importing stories for eval:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to judge stories",
        );
      } finally {
        setJudgingSelected(false);
      }
    },
    [getAccessTokenSilently, previewStory, loadPreviewEvals],
  );

  const handleRejudge = useCallback(
    async (rowId: number) => {
      if (!previewStory) return;
      try {
        setRejudgingId(rowId);
        const token = await getAccessTokenSilently();
        await rejudgeStoryEval(rowId, {}, token);
        toast.success("Story re-judged");
        await loadPreviewEvals(previewStory.id);
      } catch (err) {
        console.error("Error re-judging story:", err);
        toast.error(err instanceof Error ? err.message : "Re-judge failed");
      } finally {
        setRejudgingId(null);
      }
    },
    [getAccessTokenSilently, previewStory, loadPreviewEvals],
  );

  const handleAutoCorrect = useCallback(
    async (rowId: number) => {
      if (!previewStory) return;
      try {
        setCorrectingId(rowId);
        setLastCorrectionResult(null);
        const token = await getAccessTokenSilently();
        const resp = await autocorrectStoryEval(rowId, token);

        // Already-passing fast path — no job created.
        if ("skipped" in resp && resp.skipped) {
          toast.info(resp.reason ?? "Nothing to correct");
          setLastCorrectionResult({ corrected: false, reason: resp.reason });
          return;
        }

        // Poll the background job until it completes or fails.
        const { job_id } = resp as { job_id: string };
        const POLL_MS = 3000;
        const TIMEOUT_MS = 120_000;
        const deadline = Date.now() + TIMEOUT_MS;

        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          const job = await getJob(job_id, token);

          if (job.status === "completed") {
            const result = job.result as {
              corrected?: boolean;
              changed_fields?: string[];
              reason?: string;
            } | null;
            setLastCorrectionResult({
              corrected: result?.corrected ?? false,
              changed_fields: result?.changed_fields,
              reason: result?.reason,
            });
            if (result?.corrected) {
              toast.success(
                `Corrected: ${(result.changed_fields ?? []).join(", ")} updated`
              );
            } else {
              toast.info(result?.reason ?? "Seymour made no changes");
            }
            await loadPreviewEvals(previewStory.id);
            return;
          }

          if (job.status === "failed") {
            throw new Error(job.error ?? "Correction job failed");
          }
          // still running — keep polling
        }
        throw new Error("Auto-correct timed out after 2 minutes");
      } catch (err) {
        console.error("Auto-correct failed:", err);
        toast.error(err instanceof Error ? err.message : "Auto-correct failed");
      } finally {
        setCorrectingId(null);
      }
    },
    [getAccessTokenSilently, previewStory, loadPreviewEvals],
  );

  const handleOverrideEligible = useCallback(
    async (revoke = false) => {
      if (!previewStory) return;
      try {
        setOverridingEligibility(true);
        const token = await getAccessTokenSilently();
        if (revoke) {
          await revokeStoryEligibleOverride(previewStory.id, token);
          toast.success("Override revoked — normal eval gating restored");
        } else {
          await overrideStoryEligible(previewStory.id, token);
          toast.success("Story marked eligible — bypass eval gate");
        }
        // Optimistically patch the local story metadata so the badge updates
        // without a full list reload.
        setPreviewStory((prev) =>
          prev
            ? {
                ...prev,
                metadata: {
                  ...(prev.metadata || {}),
                  eval_manual_eligible: revoke ? undefined : "true",
                },
              }
            : prev
        );
        setStories((prev) =>
          prev.map((s) =>
            s.id === previewStory.id
              ? {
                  ...s,
                  metadata: {
                    ...(s.metadata || {}),
                    eval_manual_eligible: revoke ? undefined : "true",
                  },
                }
              : s
          )
        );
      } catch (err) {
        console.error("Override eligibility failed:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to update override"
        );
      } finally {
        setOverridingEligibility(false);
      }
    },
    [getAccessTokenSilently, previewStory, setStories]
  );

  const handleJudgePreview = useCallback(async () => {
    if (!previewStory) return;
    try {
      setPreviewJudging(true);
      await handleJudgeStories([previewStory.id]);
    } finally {
      setPreviewJudging(false);
    }
  }, [previewStory, handleJudgeStories]);

  if (loading) {
    return (
      <div className={styles.feedAdmin} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, gap: 8 }}>
        <Loader size="sm" color="dark" />
        <span>Loading feed data...</span>
      </div>
    );
  }

  return (
    <div className={styles.feedAdmin}>
      {error && <div className={styles.errorMessage}>{error}</div>}

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <svg className={styles.statIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                <path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" />
              </svg>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Total Stories</div>
                <div className={styles.statValue}>{stats.total.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <svg className={styles.statIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Last 24 Hours</div>
                <div className={styles.statValue}>{stats.last24h.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <svg className={styles.statIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Last 7 Days</div>
                <div className={styles.statValue}>{stats.last7d.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersContainer}>
        <div className={styles.filtersRow}>
          <select
            className={styles.select}
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          >
            <option value="all">All Time</option>
            <option value="day">Last 24 Hours</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>

          <select
            className={styles.select}
            value={selectedCityId ?? ""}
            onChange={(e) => setSelectedCityId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">All Cities</option>
            {cities.map((c) => (
              <option key={c.city_id} value={c.city_id}>
                {c.city_name} ({c.story_count})
              </option>
            ))}
          </select>

          <input
            type="search"
            className={styles.select}
            placeholder="Search headline, body, or hash..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ minWidth: 220, flex: "1 1 220px" }}
          />

          <select
            className={styles.select}
            value={evalFilter}
            onChange={(e) => setEvalFilter(e.target.value as EvalFilter)}
            title="Filter by story eval accuracy (newsletter gating)"
          >
            <option value="">All evals</option>
            <option value="unjudged">Unjudged</option>
            <option value="passing">Passing (accuracy ≥ 4)</option>
            <option value="failing">Failing (accuracy &lt; 4)</option>
          </select>

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              whiteSpace: "nowrap",
              opacity: evalSettings ? 1 : 0.5,
            }}
            title={
              evalSettings?.auto_correct_env_override != null
                ? `Pinned ${evalSettings.auto_correct_env_override ? "on" : "off"} by the STORY_EVAL_AUTO_CORRECT environment variable — the stored setting is ignored until that is removed`
                : "When a judged story fails on accuracy, Seymour fixes the flagged claims and the story is re-judged. Applies to feed stories only, not newsletters."
            }
          >
            <input
              type="checkbox"
              checked={!!evalSettings?.auto_correct}
              disabled={
                !evalSettings ||
                savingEvalSettings ||
                evalSettings.auto_correct_env_override != null
              }
              onChange={(e) => void handleToggleAutoCorrect(e.target.checked)}
            />
            Auto-correct failing stories
            {savingEvalSettings ? <Loader size="sm" color="dark" /> : null}
          </label>

          <button
            className={styles.secondaryBtn}
            disabled={selectedStoryIds.size === 0 || judgingSelected}
            onClick={() => void handleJudgeStories(Array.from(selectedStoryIds))}
            title="Judge selected stories against their creation session trace"
          >
            {judgingSelected ? (
              <Loader size="sm" color="dark" />
            ) : (
              `Judge ${selectedStoryIds.size || ""} selected`.trim()
            )}
          </button>

          <button className={styles.primaryBtn} onClick={handleOpenCreate}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Story
          </button>

          <button className={styles.secondaryBtn} onClick={() => setShowExport(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>

          <button
            className={styles.dangerBtn}
            onClick={handleBulkDelete}
            disabled={selectedCityId === null || bulkDeleting || filteredStories.length === 0}
            title={selectedCityId === null ? "Select a city first" : ""}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {bulkDeleting
              ? "Deleting..."
              : selectedCityId !== null
                ? `Delete All for City (${filteredStories.length})`
                : "Delete All for City"}
          </button>

          <button className={styles.secondaryBtn} onClick={loadData} style={{ marginLeft: "auto" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stories Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>
            Feed Stories <span className={styles.tableCount}>({filteredStories.length})</span>
          </span>
        </div>
        <div className={styles.tableWrapper}>
          {filteredStories.length === 0 ? (
            <div className={styles.emptyState}>No stories found for the selected filters.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th} style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={
                        pagedStories.length > 0 &&
                        pagedStories.every((s) => selectedStoryIds.has(s.id))
                      }
                      onChange={toggleSelectPage}
                      aria-label="Select page"
                    />
                  </th>
                  <th className={styles.th}>ID</th>
                  <th className={styles.th}>Date</th>
                  <th className={styles.th}>City</th>
                  <th className={styles.th}>Headline</th>
                  <th className={styles.th}>Type</th>
                  <th className={styles.th} title="Accuracy score from story eval (≥4 = newsletter-eligible)">
                    Accuracy
                  </th>
                  <th className={`${styles.th} ${styles.hideNarrow}`}>Gating</th>
                  <th className={`${styles.th} ${styles.hideNarrow}`} title="user_places.id when the story is saved-place scoped">
                    Saved place
                  </th>
                  <th className={`${styles.th} ${styles.hideNarrow}`}>Views</th>
                  <th className={`${styles.th} ${styles.hideNarrow}`}>Clicks</th>
                  <th className={`${styles.th} ${styles.hideNarrow}`} title="Like count">Likes</th>
                  <th className={`${styles.th} ${styles.hideNarrow}`}>Scheduled job</th>
                  <th className={styles.th}>Job session</th>
                  <th className={styles.th} style={{ width: 150 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedStories.map((story) => {
                  const accuracy = storyAccuracy(story);
                  return (
                  <tr
                    key={story.id}
                    className={styles.rowClickable}
                    onClick={() => handleStoryClick(story)}
                    tabIndex={0}
                    role="link"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleStoryClick(story);
                    }}
                  >
                    <td className={styles.td}>
                      <input
                        type="checkbox"
                        checked={selectedStoryIds.has(story.id)}
                        onChange={() => toggleSelected(story.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select story ${story.id}`}
                      />
                    </td>
                    <td className={styles.td}>
                      <span className={styles.muted}>#{story.id}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.muted}>{formatDate(story.story_date)}</span>
                    </td>
                    <td className={styles.td}>
                      {story.city_emoji ? `${story.city_emoji} ` : ""}{story.city_name || "\u2014"}
                    </td>
                    <td className={styles.td}>
                      <span className={styles.headline}>{story.headline}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.badge}>{story.story_type}</span>
                    </td>
                    <td className={styles.td}>
                      {accuracy != null ? (
                        <ScoreBadge score={accuracy} title={`Accuracy ${accuracy}`} size={22} />
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td className={`${styles.td} ${styles.hideNarrow}`}>
                      <GatingBadge
                        accuracy={accuracy}
                        manualOverride={!!story.metadata?.eval_manual_eligible}
                      />
                    </td>
                    <td className={`${styles.td} ${styles.hideNarrow}`}>
                      {story.user_place_id != null ? (
                        <span className={styles.badge} title="Tagged to a user saved place">
                          {story.user_place_id}
                        </span>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td className={`${styles.td} ${styles.hideNarrow}`}>
                      {story.view_count.toLocaleString()}
                    </td>
                    <td className={`${styles.td} ${styles.hideNarrow}`}>
                      {story.click_count.toLocaleString()}
                    </td>
                    <td className={`${styles.td} ${styles.hideNarrow}`}>
                      {(story.applaud_count ?? story.like_count ?? 0).toLocaleString()}
                    </td>
                    <td className={`${styles.td} ${styles.hideNarrow}`}>
                      {story.scheduled_job_name ? (
                        <span title="Custom scheduled job that created the source research report">
                          {story.scheduled_job_name}
                        </span>
                      ) : (
                        <span className={styles.muted} title="Not from a custom scheduled research job, or job was removed">
                          —
                        </span>
                      )}
                    </td>
                    <td className={styles.td}>
                      {story.job_session_id ? (
                        <button
                          type="button"
                          className={styles.jobSessionLink}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingSession({ id: story.job_session_id!, label: "Creation session" });
                          }}
                        >
                          View session
                        </button>
                      ) : (
                        <span className={styles.muted} title="No research job session on file">
                          —
                        </span>
                      )}
                    </td>
                    <td className={styles.td} style={{ whiteSpace: "nowrap" }}>
                      {story.job_session_id ? (
                        <button
                          type="button"
                          className={styles.jobSessionAction}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingSession({ id: story.job_session_id!, label: "Creation session" });
                          }}
                        >
                          Session
                        </button>
                      ) : null}
                      <button
                        className={`${styles.iconBtn} ${styles.iconBtnApplaud}${
                          story.liked_by_me ? ` ${styles.iconBtnApplaudActive}` : ""
                        }`}
                        title={
                          story.liked_by_me
                            ? "Unlike story (removes newsletter boost if no other admin likes remain)"
                            : "Like story (boosts newsletter ranking)"
                        }
                        aria-label={story.liked_by_me ? "Unlike story" : "Like story"}
                        aria-pressed={Boolean(story.liked_by_me)}
                        disabled={likingId === story.id}
                        style={{ marginRight: 4 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleLikeStory(story.id, Boolean(story.liked_by_me));
                        }}
                      >
                        {likingId === story.id ? (
                          <Loader size="sm" color="dark" />
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill={story.liked_by_me ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M9 11V6a2 2 0 0 1 4 0v5" />
                            <path d="M13 11V4a2 2 0 0 1 4 0v7" />
                            <path d="M17 11V7a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6h-2.5a4 4 0 0 1-3.2-1.6L5 14.5a1.5 1.5 0 0 1 2.1-2.1L9 14" />
                          </svg>
                        )}
                      </button>
                      <button
                        className={styles.iconBtn}
                        title="Edit story"
                        style={{ marginRight: 4 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(story);
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                      <button
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        title="Delete story"
                        disabled={deletingId === story.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStory(story.id, story.headline);
                        }}
                      >
                        {deletingId === story.id ? (
                          <Loader size="sm" color="dark" />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {/* Pagination controls */}
        {filteredStories.length > PAGE_SIZE && (
          <div className={styles.pagination}>
            <button
              className={styles.secondaryBtn}
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span className={styles.pageInfo}>
              Page {page + 1} of {totalPages} ({filteredStories.length} stories)
            </span>
            <button
              className={styles.secondaryBtn}
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Story Preview + Eval (workbench-style split) */}
      {previewStory && (
        <div className={styles.previewOverlay} onClick={() => setPreviewStory(null)}>
          <div
            className={`${styles.previewPanel} ${styles.previewPanelWide}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={styles.previewHeader}>
              <div className={styles.previewMeta}>
                <span className={styles.badge}>{previewStory.story_type}</span>
                <span className={styles.muted}>{formatDate(previewStory.story_date)}</span>
                {previewStory.city_emoji && <span>{previewStory.city_emoji}</span>}
                <span className={styles.muted}>{previewStory.city_name}</span>
                <GatingBadge
                  accuracy={storyAccuracy(previewStory)}
                  manualOverride={!!previewStory.metadata?.eval_manual_eligible}
                />
              </div>
              <button
                className={styles.previewClose}
                onClick={() => setPreviewStory(null)}
                aria-label="Close preview"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <h2 className={styles.previewHeadline}>{previewStory.headline}</h2>

            <div className={styles.previewSplit}>
              {/* Left: story content */}
              <div className={styles.previewMain}>
                {(previewStory.user_place_id != null || previewStory.metadata?.category === "personal_newsletter") && (
                  <div className={styles.previewPersonalization}>
                    <div className={styles.previewPersonalizationTitle}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      Personalized story
                    </div>
                    <div className={styles.previewPersonalizationGrid}>
                      {previewStory.user_place_id != null && (
                        <div className={styles.previewInfoRow}>
                          <span className={styles.previewInfoLabel}>Saved place ID</span>
                          <span className={styles.previewInfoValue}>{previewStory.user_place_id}</span>
                        </div>
                      )}
                      {previewStory.metadata?.category && (
                        <div className={styles.previewInfoRow}>
                          <span className={styles.previewInfoLabel}>Category</span>
                          <span className={styles.previewInfoValue}>{previewStory.metadata.category}</span>
                        </div>
                      )}
                      {previewStory.metadata?.user_place_ids && Array.isArray(previewStory.metadata.user_place_ids) && previewStory.metadata.user_place_ids.length > 0 && (
                        <div className={styles.previewInfoRow}>
                          <span className={styles.previewInfoLabel}>Place IDs</span>
                          <span className={styles.previewInfoValue}>{(previewStory.metadata.user_place_ids as number[]).join(", ")}</span>
                        </div>
                      )}
                      {previewStory.metadata?.user_id && (
                        <div className={styles.previewInfoRow}>
                          <span className={styles.previewInfoLabel}>User ID</span>
                          <span className={styles.previewInfoValue}>{String(previewStory.metadata.user_id)}</span>
                        </div>
                      )}
                      {previewStory.metadata?.user_email && (
                        <div className={styles.previewInfoRow}>
                          <span className={styles.previewInfoLabel}>User email</span>
                          <span className={styles.previewInfoValue}>{String(previewStory.metadata.user_email)}</span>
                        </div>
                      )}
                      <div className={styles.previewInfoRow}>
                        <span className={styles.previewInfoLabel}>Privacy</span>
                        <span className={styles.previewInfoValue}>
                          <span className={styles.previewPrivacyBadge}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            Private (saved place)
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className={styles.previewBody}>
                  {previewArticleHtml ? (
                    <VisualizationDeferredInteractiveContainer
                      className={styles.previewArticle}
                      html={previewArticleHtml}
                    />
                  ) : (
                    <p className={styles.previewFallback}>
                      {previewStory.summary || previewStory.description || "No content available."}
                    </p>
                  )}
                </div>
              </div>

              {/* Right: eval sidebar (mirrors newsletter workbench) */}
              <aside className={styles.previewEvalSidebar}>
                {(() => {
                  // Derive the active eval row: the one selected by the user,
                  // or the latest row if none is selected.
                  const latestEval = previewEvals[0] ?? null;
                  const activeEval =
                    selectedEvalId != null
                      ? (previewEvals.find((r) => r.id === selectedEvalId) ?? latestEval)
                      : latestEval;
                  const isViewingOlderRow =
                    selectedEvalId != null && selectedEvalId !== latestEval?.id;

                  return (
                    <>
                      {/* ── Header ──────────────────────────────────────────────── */}
                      <div className={styles.previewEvalTitle}>Story eval</div>
                      <div className={styles.muted} style={{ fontSize: 12, marginBottom: 10 }}>
                        Judged against the Seymour session tool-call trace. Accuracy ≥ 4
                        keeps the story on the public site and in newsletter pools;
                        failing accuracy hides it from readers until it passes or an
                        admin sets a manual override.
                      </div>

                      {/* ── Eval history picker (all rows, newest first) ─────────── */}
                      {previewEvals.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 5 }}>
                            Eval history ({previewEvals.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {previewEvals.map((row, i) => {
                              const isActive =
                                selectedEvalId === row.id ||
                                (selectedEvalId == null && i === 0);
                              return (
                                <button
                                  key={row.id}
                                  type="button"
                                  onClick={() =>
                                    setSelectedEvalId(isActive ? null : row.id)
                                  }
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "5px 8px",
                                    borderRadius: 6,
                                    border: isActive
                                      ? "1px solid var(--brand-primary, #2563eb)"
                                      : "1px solid var(--border-primary)",
                                    background: isActive
                                      ? "rgba(37, 99, 235, 0.06)"
                                      : "transparent",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    width: "100%",
                                  }}
                                >
                                  <ScoreBadge score={row.accuracy_score} size={18} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 11.5, fontWeight: 600 }}>
                                      #{row.id}
                                      {i === 0 ? (
                                        <span
                                          style={{
                                            marginLeft: 5,
                                            fontSize: 9.5,
                                            fontWeight: 500,
                                            padding: "1px 5px",
                                            borderRadius: 8,
                                            background: "var(--bg-secondary)",
                                            color: "var(--text-secondary)",
                                          }}
                                        >
                                          latest
                                        </span>
                                      ) : null}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 10.5,
                                        color: "var(--text-tertiary)",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {row.status}
                                      {row.correction_attempted_at ? " · corrected" : ""}
                                      {row.completed_at
                                        ? ` · ${formatDate(row.completed_at)}`
                                        : ""}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ── "Viewing older eval" notice ───────────────────────────── */}
                      {isViewingOlderRow && (
                        <div
                          style={{
                            fontSize: 11,
                            padding: "5px 8px",
                            marginBottom: 10,
                            borderRadius: 6,
                            background: "rgba(180,130,0,0.07)",
                            color: "#8a6400",
                            border: "1px solid rgba(180,130,0,0.2)",
                          }}
                        >
                          Viewing an older eval. Actions (re-judge, correct) always
                          operate on the <strong>latest</strong> row.
                        </div>
                      )}

                      {/* ── Eval detail for the active row ───────────────────────── */}
                      {previewEvalsLoading ? (
                        <div className={styles.muted} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Loader size="sm" color="dark" /> Loading eval…
                        </div>
                      ) : activeEval?.scores_json ? (
                        <>
                          <JudgeScoresPanel
                            scores={activeEval.scores_json}
                            judgeModelKey={activeEval.judge_model_key}
                          />

                          {/* Tickets from new accuracy judge */}
                          {(activeEval.scores_json._tickets?.length ?? 0) > 0 && (
                            <EvalTicketsPanel tickets={activeEval.scores_json._tickets!} />
                          )}

                          {/* Action buttons — always target the latest eval row */}
                          {!isViewingOlderRow && latestEval && (
                            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                disabled={rejudgingId === latestEval.id}
                                onClick={() => void handleRejudge(latestEval.id)}
                              >
                                {rejudgingId === latestEval.id ? (
                                  <Loader size="sm" color="dark" />
                                ) : (
                                  "Re-judge"
                                )}
                              </button>
                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                disabled={previewJudging || judgingSelected}
                                onClick={() => void handleJudgePreview()}
                              >
                                {previewJudging ? <Loader size="sm" color="dark" /> : "Judge again"}
                              </button>
                              {storyAccuracy(previewStory) !== null &&
                                (storyAccuracy(previewStory) ?? PASSING_ACCURACY) < PASSING_ACCURACY && (
                                  <button
                                    type="button"
                                    className={styles.primaryBtn}
                                    disabled={correctingId === latestEval.id}
                                    title="Ask Seymour to make a minimal factual fix based on the judge's accuracy errors"
                                    onClick={() => void handleAutoCorrect(latestEval.id)}
                                  >
                                    {correctingId === latestEval.id ? (
                                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <Loader size="sm" color="white" /> Correcting…
                                      </span>
                                    ) : (
                                      "✦ Auto-correct"
                                    )}
                                  </button>
                                )}
                              {previewStory.metadata?.eval_manual_eligible ? (
                                <button
                                  type="button"
                                  className={styles.secondaryBtn}
                                  disabled={overridingEligibility}
                                  title="Remove admin override — story returns to normal eval gating"
                                  onClick={() => void handleOverrideEligible(true)}
                                >
                                  {overridingEligibility ? (
                                    <Loader size="sm" color="dark" />
                                  ) : (
                                    "Revoke override"
                                  )}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={styles.secondaryBtn}
                                  disabled={overridingEligibility}
                                  title="Force this story into the newsletter pool regardless of eval score"
                                  onClick={() => void handleOverrideEligible(false)}
                                >
                                  {overridingEligibility ? (
                                    <Loader size="sm" color="dark" />
                                  ) : (
                                    "Override eligible"
                                  )}
                                </button>
                              )}
                            </div>
                          )}

                          {lastCorrectionResult && !isViewingOlderRow && (
                            <div style={{ marginTop: 8, fontSize: 12 }} className={styles.muted}>
                              {lastCorrectionResult.corrected
                                ? `Corrected: ${(lastCorrectionResult.changed_fields ?? []).join(", ")} — re-judged`
                                : lastCorrectionResult.reason ?? "No changes made"}
                            </div>
                          )}

                          <div style={{ marginTop: 10, fontSize: 11 }} className={styles.muted}>
                            Status: {activeEval.status}
                            {activeEval.source ? ` · ${activeEval.source}` : ""}
                            {activeEval.completed_at
                              ? ` · ${formatDate(activeEval.completed_at)}`
                              : ""}
                          </div>

                          <StoryEvalTelemetry row={activeEval} />
                          <CorrectionHistoryPanel row={activeEval} />
                        </>
                      ) : activeEval?.status === "pending" ? (
                        <div className={styles.muted}>
                          Judging in progress…{" "}
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            style={{ marginLeft: 6 }}
                            onClick={() => void loadPreviewEvals(previewStory.id)}
                          >
                            Refresh
                          </button>
                        </div>
                      ) : activeEval?.error ? (
                        <div>
                          <div className={styles.errorMessage}>{activeEval.error}</div>
                          {!isViewingOlderRow && latestEval && (
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              style={{ marginTop: 8 }}
                              disabled={rejudgingId === latestEval.id}
                              onClick={() => void handleRejudge(latestEval.id)}
                            >
                              {rejudgingId === latestEval.id ? (
                                <Loader size="sm" color="dark" />
                              ) : (
                                "Re-judge"
                              )}
                            </button>
                          )}
                          <StoryEvalTelemetry row={activeEval} />
                          <CorrectionHistoryPanel row={activeEval} />
                        </div>
                      ) : (
                        <div>
                          <div className={styles.muted} style={{ marginBottom: 10 }}>
                            Not judged yet. New stories are judged automatically when
                            producer jobs run; you can also judge this story now.
                          </div>
                          <button
                            type="button"
                            className={styles.primaryBtn}
                            disabled={previewJudging || judgingSelected}
                            onClick={() => void handleJudgePreview()}
                          >
                            {previewJudging ? <Loader size="sm" color="dark" /> : "Judge story"}
                          </button>
                        </div>
                      )}

                      {/* ── Session links ──────────────────────────────────────────── */}
                      {(previewStory.job_session_id ||
                        latestEval?.session_id ||
                        activeEval?.judge_usage?.judge_session_id) && (
                        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                          {(latestEval?.session_id || previewStory.job_session_id) && (
                            <button
                              type="button"
                              className={styles.jobSessionLink}
                              onClick={() =>
                                setViewingSession({
                                  id: (latestEval?.session_id || previewStory.job_session_id)!,
                                  label: "Creation session",
                                })
                              }
                            >
                              Creation session
                            </button>
                          )}
                          {activeEval?.judge_usage?.judge_session_id && (
                            <button
                              type="button"
                              className={styles.jobSessionLink}
                              onClick={() =>
                                setViewingSession({
                                  id: activeEval.judge_usage!.judge_session_id!,
                                  label: "Judge session",
                                })
                              }
                            >
                              Judge session
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </aside>
            </div>

            {/* Footer */}
            <div className={styles.previewFooter}>
              <button className={styles.secondaryBtn} onClick={() => setPreviewStory(null)}>
                Close
              </button>
              <div className={styles.previewFooterActions}>
                <button
                  type="button"
                  className={`${styles.applaudBtn}${
                    previewStory.liked_by_me ? ` ${styles.applaudBtnActive}` : ""
                  }`}
                  title={
                    previewStory.liked_by_me
                      ? "Unlike this story (removes newsletter boost if no other admin likes remain)"
                      : "Like this story (boosts newsletter ranking)"
                  }
                  aria-pressed={Boolean(previewStory.liked_by_me)}
                  disabled={likingId === previewStory.id}
                  onClick={() =>
                    void handleToggleLikeStory(
                      previewStory.id,
                      Boolean(previewStory.liked_by_me),
                    )
                  }
                >
                  {likingId === previewStory.id ? (
                    <Loader size="sm" color="dark" />
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill={previewStory.liked_by_me ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M9 11V6a2 2 0 0 1 4 0v5" />
                      <path d="M13 11V4a2 2 0 0 1 4 0v7" />
                      <path d="M17 11V7a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6h-2.5a4 4 0 0 1-3.2-1.6L5 14.5a1.5 1.5 0 0 1 2.1-2.1L9 14" />
                    </svg>
                  )}
                  {previewStory.liked_by_me ? "Liked" : "Like"}
                  <span className={styles.applaudCount}>
                    {(previewStory.applaud_count ?? previewStory.like_count ?? 0).toLocaleString()}
                  </span>
                </button>
                <a
                  className={styles.primaryBtn}
                  href={(() => {
                    const path = publicStoryPath(previewStory);
                    return path.startsWith("http") ? path : `${typeof window !== "undefined" ? window.location.origin : ""}${path}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Visit story
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editor Modal (create / edit) */}
      {editorOpen && (
        <div className={styles.exportOverlay} onClick={() => !editorSaving && setEditorOpen(false)}>
          <div
            className={styles.exportPanel}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className={styles.exportTitle}>
              {editorStory ? `Edit story #${editorStory.id}` : "New Feed Story"}
            </div>

            {editorError && (
              <div className={styles.errorMessage} style={{ marginBottom: 8 }}>
                {editorError}
              </div>
            )}

            <div className={styles.exportField}>
              <label className={styles.exportLabel}>City</label>
              <select
                className={styles.exportSelect}
                value={editorForm.city_id}
                onChange={(e) => setEditorForm((f) => ({ ...f, city_id: Number(e.target.value) }))}
              >
                {cities.length === 0 && <option value={1}>San Francisco (1)</option>}
                {cities.map((c) => (
                  <option key={c.city_id} value={c.city_id}>
                    {c.city_name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.exportField}>
              <label className={styles.exportLabel}>District (0 = citywide)</label>
              <input
                type="number"
                className={styles.exportSelect}
                min={0}
                value={editorForm.district ?? 0}
                onChange={(e) => setEditorForm((f) => ({ ...f, district: Number(e.target.value) }))}
              />
            </div>

            <div className={styles.exportField}>
              <label className={styles.exportLabel}>Headline</label>
              <input
                type="text"
                className={styles.exportSelect}
                value={editorForm.headline}
                onChange={(e) => setEditorForm((f) => ({ ...f, headline: e.target.value }))}
              />
            </div>

            <div className={styles.exportField}>
              <label className={styles.exportLabel}>Description</label>
              <textarea
                className={styles.exportSelect}
                rows={4}
                value={editorForm.description}
                onChange={(e) => setEditorForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className={styles.exportField}>
              <label className={styles.exportLabel}>Summary (optional, one-line)</label>
              <input
                type="text"
                className={styles.exportSelect}
                value={editorForm.summary ?? ""}
                onChange={(e) => setEditorForm((f) => ({ ...f, summary: e.target.value }))}
              />
            </div>

            <div className={styles.exportField} style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className={styles.exportLabel}>Story type</label>
                <select
                  className={styles.exportSelect}
                  value={editorForm.story_type ?? "research"}
                  onChange={(e) => setEditorForm((f) => ({ ...f, story_type: e.target.value }))}
                >
                  <option value="research">research</option>
                  <option value="traction">traction</option>
                  <option value="context">context</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.exportLabel}>Status</label>
                <select
                  className={styles.exportSelect}
                  value={editorForm.status ?? "active"}
                  onChange={(e) => setEditorForm((f) => ({ ...f, status: e.target.value as any }))}
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                  <option value="hidden">hidden</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.exportLabel}>Visualization</label>
                <select
                  className={styles.exportSelect}
                  value={editorForm.visualization_type ?? ""}
                  onChange={(e) =>
                    setEditorForm((f) => ({
                      ...f,
                      visualization_type: (e.target.value || null) as any,
                    }))
                  }
                >
                  <option value="">none</option>
                  <option value="chart">chart</option>
                  <option value="map">map</option>
                  <option value="anomaly">anomaly</option>
                </select>
              </div>
            </div>

            <div className={styles.exportField} style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className={styles.exportLabel}>Story date</label>
                <input
                  type="date"
                  className={styles.exportSelect}
                  value={editorForm.story_date ?? ""}
                  onChange={(e) => setEditorForm((f) => ({ ...f, story_date: e.target.value }))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.exportLabel}>Priority (0–1)</label>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  className={styles.exportSelect}
                  value={editorForm.priority_score ?? 0.5}
                  onChange={(e) =>
                    setEditorForm((f) => ({ ...f, priority_score: Number(e.target.value) }))
                  }
                />
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "flex-end", paddingBottom: 6 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!editorForm.is_featured}
                    onChange={(e) => setEditorForm((f) => ({ ...f, is_featured: e.target.checked }))}
                  />
                  Featured
                </label>
              </div>
            </div>

            <div className={styles.exportField}>
              <label className={styles.exportLabel}>CTA label (optional)</label>
              <input
                type="text"
                className={styles.exportSelect}
                placeholder="e.g. Read full report"
                value={editorForm.cta_label ?? ""}
                onChange={(e) => setEditorForm((f) => ({ ...f, cta_label: e.target.value }))}
              />
            </div>

            <div className={styles.exportActions}>
              <button
                className={styles.secondaryBtn}
                onClick={() => setEditorOpen(false)}
                disabled={editorSaving}
              >
                Cancel
              </button>
              <button
                className={styles.primaryBtn}
                onClick={handleEditorSave}
                disabled={editorSaving}
              >
                {editorSaving ? "Saving..." : editorStory ? "Save changes" : "Create story"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExport && (
        <div className={styles.exportOverlay} onClick={() => setShowExport(false)}>
          <div className={styles.exportPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.exportTitle}>Export Feed Stories to CSV</div>

            <div className={styles.exportField}>
              <label className={styles.exportLabel}>City</label>
              <select
                className={styles.exportSelect}
                value={exportCityId ?? ""}
                onChange={(e) => setExportCityId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">All Cities</option>
                {cities.map((c) => (
                  <option key={c.city_id} value={c.city_id}>
                    {c.city_name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.exportField}>
              <label className={styles.exportLabel}>Time Range</label>
              <select
                className={styles.exportSelect}
                value={exportTimeRange}
                onChange={(e) => setExportTimeRange(e.target.value as ExportTimeRange)}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last Week</option>
                <option value="month">Last Month</option>
                <option value="year">Last Year</option>
              </select>
            </div>

            <div className={styles.exportActions}>
              <button className={styles.secondaryBtn} onClick={() => setShowExport(false)}>
                Cancel
              </button>
              <button className={styles.primaryBtn} onClick={handleExport}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Session viewer modal ────────────────────────────────────────────── */}
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
