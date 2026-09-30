"use client";

/**
 * OpsStoriesTab — the city story desk shared by the city dashboard and Feed admin.
 *
 * A time window chosen by the parent, sort and accuracy filters, and
 * prompt-driven story generation that runs as a feed_producer job.
 * ``cityId`` null means every city the viewer may see.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { ExternalLink } from "lucide-react";
import AdminStoryRow, {
  AdminStoryAction,
  AdminStoryList,
  StoryModerationActions,
} from "@/components/admin/AdminStoryRow";
import GenerateStoryModal from "@/components/GenerateStoryModal";
import SessionViewerModal from "@/components/eval/SessionViewerModal";
import StoryReviewModal, {
  publicStoryPath,
  type ReviewStory,
  type StoryReviewApi,
} from "@/components/StoryReviewModal";
import { fmt, StatCard } from "@/components/analytics/dashboardParts";
import {
  getJob,
  getAvailableModels,
  getOpsCityStories,
  getOpsStories,
  getOpsStoryReview,
  opsAutocorrectStory,
  opsBulkStoryAction,
  opsDeleteStory,
  opsJudgeStory,
  opsRejudgeStory,
  opsSetStoryOverride,
  opsSetStoryVisibility,
  type ModelInfo,
  type OpsCityStories,
  type OpsCityStory,
  type OpsStoryReview,
  type OpsStorySort,
} from "@/lib/apiClient";
import { toast } from "sonner";
import { revalidatePublicStory } from "@/app/actions/revalidateStory";
import { formatWorkbenchModelLabel } from "@/components/newsletter/NewsletterEvalResultDetailPane";
import {
  isCanonicalStoryPath,
  nextPublicVisibility,
  storyIsPubliclyListed,
  visibilitySuccessMessage,
} from "@/lib/stories/staffModeration";
import styles from "@/components/ProductAnalyticsDashboard.module.css";

export const SEVERE_ACCURACY = 2;

export const STORY_SORTS: { id: OpsStorySort; label: string }[] = [
  { id: "period_views", label: "Page views this period" },
  { id: "views", label: "All-time page views" },
  { id: "likes", label: "Likes" },
  { id: "clicks", label: "Clicks" },
  { id: "newest", label: "Newest" },
  { id: "accuracy", label: "Lowest accuracy" },
];

export function StorySortSelect({
  value,
  onChange,
}: {
  value: OpsStorySort;
  onChange: (sort: OpsStorySort) => void;
}) {
  return (
    <select
      className={styles.metricSelect}
      value={value}
      onChange={(e) => onChange(e.target.value as OpsStorySort)}
      aria-label="Sort stories"
    >
      {STORY_SORTS.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

/** Ops review payload → the fields StoryReviewModal reads. */
export function toReviewStory(story: OpsStoryReview["story"]): ReviewStory {
  return {
    id: story.id,
    headline: story.headline,
    story_type: story.story_type ?? undefined,
    story_date: story.story_date ?? undefined,
    city_emoji: story.city_emoji,
    city_name: story.city_name,
    user_place_id: story.user_place_id,
    metadata: story.metadata,
    article_html: story.article_html,
    summary: story.summary,
    description: story.description ?? undefined,
    job_session_id: story.job_session_id,
    short_hash: story.short_hash,
    status: story.status ?? undefined,
  };
}

interface StoryListProps {
  stories: OpsCityStory[];
  onViewSession?: (sessionId: string) => void;
  onOpenStory?: (story: OpsCityStory) => void;
  emptyText: string;
  /** City lead or admin for this story's city. */
  canManageStory?: (story: OpsCityStory) => boolean;
  /** Admins can delete. City leads cannot. */
  canDelete?: boolean;
  busyStoryId?: number | null;
  onToggleVisibility?: (story: OpsCityStory) => void;
  onDelete?: (story: OpsCityStory) => void;
  selectedIds?: ReadonlySet<number>;
  onToggleSelected?: (story: OpsCityStory) => void;
}

/** Ops story list on the shared AdminStoryRow. */
export function StoryList({
  stories,
  onViewSession,
  onOpenStory,
  emptyText,
  canManageStory,
  canDelete = false,
  busyStoryId = null,
  onToggleVisibility,
  onDelete,
  selectedIds,
  onToggleSelected,
}: StoryListProps) {
  if (stories.length === 0) return <p className={styles.note}>{emptyText}</p>;
  return (
    <AdminStoryList>
      {stories.map((s) => {
        const manage = canManageStory?.(s) ?? false;
        return (
          <AdminStoryRow
            key={s.id}
            story={s}
            selected={selectedIds?.has(s.id)}
            onToggleSelected={
              onToggleSelected && manage ? () => onToggleSelected(s) : undefined
            }
            onViewSession={onViewSession}
            onOpen={onOpenStory ? () => onOpenStory(s) : undefined}
            actions={
              <>
                {(manage || canDelete) && (
                  <StoryModerationActions
                    isPublic={storyIsPubliclyListed(s.status)}
                    canManage={manage}
                    canDelete={canDelete}
                    busy={busyStoryId === s.id}
                    onToggleVisibility={
                      onToggleVisibility ? () => onToggleVisibility(s) : undefined
                    }
                    onDelete={onDelete ? () => onDelete(s) : undefined}
                  />
                )}
                <AdminStoryAction label="Open story" href={publicStoryPath(s)}>
                  <ExternalLink size={14} aria-hidden="true" />
                </AdminStoryAction>
              </>
            }
          />
        );
      })}
    </AdminStoryList>
  );
}

export interface GenerateCityOption {
  city_id: number;
  name: string;
}

interface OpsStoriesTabProps {
  /** Null loads every city in the viewer's ops scope. */
  cityId: number | null;
  cityName: string;
  canManage: boolean;
  /** Per-story manage rights when the list spans more than one city. */
  canManageCity?: (cityId: number) => boolean;
  /** Cities the viewer may generate for, used when no city is selected. */
  generateCities?: GenerateCityOption[];
  isAdmin: boolean;
  days: number;
  /** Bump to reload from a parent Refresh button. */
  refreshToken?: number;
  onViewJob?: (jobId: string) => void;
}

export default function OpsStoriesTab({
  cityId,
  cityName,
  canManage,
  canManageCity,
  generateCities,
  isAdmin,
  days,
  refreshToken = 0,
  onViewJob,
}: OpsStoriesTabProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [stories, setStories] = useState<OpsCityStories | null>(null);
  const [sort, setSort] = useState<OpsStorySort>("newest");
  const [severeOnly, setSevereOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generatingJobId, setGeneratingJobId] = useState<string | null>(null);
  const [reviewCityId, setReviewCityId] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState<{
    story: ReviewStory;
    evals: OpsStoryReview["evals"];
  } | null>(null);
  const [viewingSession, setViewingSession] = useState<{ id: string; label: string } | null>(
    null
  );
  const [busyStoryId, setBusyStoryId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [judgeModels, setJudgeModels] = useState<ModelInfo[]>([]);
  const [judgeModelKey, setJudgeModelKey] = useState("");
  const [judgingJobId, setJudgingJobId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const viewSession = isAdmin
    ? (id: string, label = "Creation session") => setViewingSession({ id, label })
    : undefined;

  const canManageStory = useCallback(
    (story: OpsCityStory) => {
      const cid = story.city_id ?? cityId;
      if (cid == null) return false;
      return canManageCity ? canManageCity(cid) : canManage;
    },
    [canManage, canManageCity, cityId]
  );

  const markVisibility = useCallback((storyId: number, status: "active" | "hidden") => {
    setStories((prev) =>
      prev
        ? {
            ...prev,
            stories: prev.stories.map((s) => (s.id === storyId ? { ...s, status } : s)),
          }
        : prev
    );
    setReviewing((prev) =>
      prev && prev.story.id === storyId
        ? { ...prev, story: { ...prev.story, status } }
        : prev
    );
  }, []);

  const dropStory = useCallback((storyId: number) => {
    setStories((prev) =>
      prev ? { ...prev, stories: prev.stories.filter((s) => s.id !== storyId) } : prev
    );
    setReviewing((prev) => (prev && prev.story.id === storyId ? null : prev));
  }, []);

  const toggleVisibility = useCallback(
    async (story: OpsCityStory) => {
      const cid = story.city_id ?? cityId;
      if (cid == null) {
        toast.error("This story is not tied to a city.");
        return;
      }
      const next = nextPublicVisibility(story.status);
      setBusyStoryId(story.id);
      try {
        const token = await getAccessTokenSilently();
        await opsSetStoryVisibility(cid, story.id, next, token);
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
      const cid = story.city_id ?? cityId;
      if (cid == null) {
        toast.error("This story is not tied to a city.");
        return;
      }
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
        await opsDeleteStory(cid, story.id, token);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const options = {
        days,
        sort,
        maxAccuracy: severeOnly ? SEVERE_ACCURACY : undefined,
      };
      setStories(
        cityId == null
          ? await getOpsStories(token, options)
          : await getOpsCityStories(cityId, token, options)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stories");
    } finally {
      setLoading(false);
    }
  }, [cityId, days, sort, severeOnly, getAccessTokenSilently]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    setStories(null);
    setGeneratingJobId(null);
    setSelectedIds(new Set());
    setJudgingJobId(null);
  }, [cityId]);

  useEffect(() => {
    if (!generatingJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const token = await getAccessTokenSilently();
        const job = await getJob(generatingJobId, token);
        if (cancelled) return;
        if (job.status === "pending" || job.status === "running") return;
        setGeneratingJobId(null);
        if (job.status === "failed" || job.status === "cancelled") {
          setError(job.error_message || "Story generation failed.");
        }
        void load();
      } catch {
        // Keep polling; a single missed status check should not drop the job.
      }
    };
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [generatingJobId, getAccessTokenSilently, load]);

  const mayBulk = canManage || isAdmin || (generateCities?.length ?? 0) > 0;

  useEffect(() => {
    if (!mayBulk) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const groups = await getAvailableModels(token);
        if (cancelled) return;
        setJudgeModels(
          groups.flatMap((g) => g.models).filter((m) => m.is_available)
        );
      } catch {
        // The judge can still run on the platform default model.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mayBulk, getAccessTokenSilently]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [days, sort, severeOnly, refreshToken]);

  useEffect(() => {
    if (!judgingJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const token = await getAccessTokenSilently();
        const job = await getJob(judgingJobId, token);
        if (cancelled) return;
        if (job.status === "pending" || job.status === "running") return;
        setJudgingJobId(null);
        if (job.status === "failed" || job.status === "cancelled") {
          setError(job.error_message || "Story judging failed.");
        } else {
          toast.success("Judging finished.");
        }
        void load();
      } catch {
        // Keep polling; a single missed status check should not drop the job.
      }
    };
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [judgingJobId, getAccessTokenSilently, load]);

  const openStory = useCallback(
    async (story: OpsCityStory) => {
      const storyCityId = story.city_id ?? cityId;
      if (storyCityId == null) {
        setError("This story is not tied to a city.");
        return;
      }
      try {
        const token = await getAccessTokenSilently();
        const res = await getOpsStoryReview(storyCityId, story.id, token);
        setReviewCityId(storyCityId);
        setReviewing({ story: toReviewStory(res.story), evals: res.evals });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to open story");
      }
    },
    [cityId, getAccessTokenSilently]
  );

  const reviewApi = useMemo<StoryReviewApi | null>(() => {
    if (reviewCityId == null) return null;
    const cid = reviewCityId;
    return {
      loadEvals: async (storyId, token) =>
        (await getOpsStoryReview(cid, storyId, token)).evals,
      judge: (storyId, token) => opsJudgeStory(cid, storyId, token),
      rejudge: (evalId, storyId, token) => opsRejudgeStory(cid, storyId, evalId, token),
      autocorrect: (evalId, storyId, token) =>
        opsAutocorrectStory(cid, storyId, evalId, token),
      override: (storyId, token) => opsSetStoryOverride(cid, storyId, false, token),
      revokeOverride: (storyId, token) => opsSetStoryOverride(cid, storyId, true, token),
      setVisibility: (storyId, status, token) =>
        opsSetStoryVisibility(cid, storyId, status, token),
      deleteStory: isAdmin
        ? (storyId, token) => opsDeleteStory(cid, storyId, token)
        : undefined,
    };
  }, [reviewCityId, isAdmin]);

  const canGenerate =
    cityId != null ? canManage : (generateCities?.length ?? 0) > 0;
  const canActOnReview =
    reviewCityId != null &&
    (canManageCity ? canManageCity(reviewCityId) : canManage);
  const generateTarget =
    cityId != null
      ? { cityId, cityName }
      : generateCities && generateCities.length > 0
        ? { cityId: generateCities[0].city_id, cityName: generateCities[0].name }
        : null;

  const manageableStories = useMemo(
    () => (stories?.stories ?? []).filter((s) => canManageStory(s)),
    [stories, canManageStory]
  );

  const selectedStories = useMemo(
    () => manageableStories.filter((s) => selectedIds.has(s.id)),
    [manageableStories, selectedIds]
  );

  const judgePool = selectedStories.length > 0 ? selectedStories : manageableStories;
  const unjudgedTargets = judgePool.filter((s) => s.accuracy == null);

  const toggleSelected = useCallback((story: OpsCityStory) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(story.id)) next.delete(story.id);
      else next.add(story.id);
      return next;
    });
  }, []);

  const runBulk = useCallback(
    async (
      action: "judge" | "hide" | "show" | "delete",
      pool: OpsCityStory[],
      options?: { unjudgedOnly?: boolean }
    ) => {
      if (pool.length === 0 || bulkBusy || judgingJobId) return;
      if (action === "delete") {
        const ok = window.confirm(
          `Delete ${pool.length} ${pool.length === 1 ? "story" : "stories"}? This removes them from the public site and cannot be undone.`
        );
        if (!ok) return;
      }
      setBulkBusy(true);
      try {
        const token = await getAccessTokenSilently();
        const result = await opsBulkStoryAction(
          {
            story_ids: pool.map((s) => s.id),
            action,
            judge_model_key: action === "judge" ? judgeModelKey || null : undefined,
            unjudged_only: options?.unjudgedOnly,
          },
          token
        );
        if (action === "judge") {
          const skipped = result.skipped ?? 0;
          toast.success(
            skipped > 0
              ? `Judging ${result.affected} unjudged ${result.affected === 1 ? "story" : "stories"}. ${skipped} already judged left as they are.`
              : `Judging ${result.affected} ${result.affected === 1 ? "story" : "stories"}.`
          );
          if (result.job_id) setJudgingJobId(result.job_id);
        } else if (action === "delete") {
          toast.success(
            `Deleted ${result.affected} ${result.affected === 1 ? "story" : "stories"}.`
          );
          for (const story of pool) {
            const path = publicStoryPath(story);
            if (isCanonicalStoryPath(path)) void revalidatePublicStory(path);
          }
          setSelectedIds(new Set());
          void load();
        } else {
          const next = action === "hide" ? "hidden" : "active";
          const n = result.affected;
          const noun = n === 1 ? "story" : "stories";
          toast.success(
            next === "hidden"
              ? `Hidden ${n} ${noun} from the public site.`
              : `Made ${n} ${noun} public.`
          );
          for (const story of pool) {
            markVisibility(story.id, next);
            const path = publicStoryPath(story);
            if (isCanonicalStoryPath(path)) void revalidatePublicStory(path);
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Bulk action failed");
      } finally {
        setBulkBusy(false);
      }
    },
    [
      bulkBusy,
      judgingJobId,
      getAccessTokenSilently,
      judgeModelKey,
      load,
      markVisibility,
    ]
  );

  const counts = stories?.counts;

  return (
    <>
      {canGenerate && (
        <div className={styles.generateRow}>
          {generatingJobId && (
            <span className={styles.generatingNote}>
              Generating…{" "}
              {onViewJob && (
                <button
                  type="button"
                  className={styles.logsLink}
                  onClick={() => onViewJob(generatingJobId)}
                >
                  Logs
                </button>
              )}
            </span>
          )}
          <button type="button" className={styles.generateBtn} onClick={() => setShowGenerate(true)}>
            ✦ Generate story
          </button>
        </div>
      )}

      {error && <div className={styles.errorBanner}>{error}</div>}
      {loading && !stories && <div className={styles.loading}>Loading…</div>}

      {stories && counts && (
        <>
          <div className={styles.statGrid}>
            <StatCard label="Stories" value={fmt(counts.total)} sub={`${fmt(counts.judged)} judged`} />
            <StatCard
              label={`Passing (≥${stories.passing_accuracy})`}
              value={fmt(counts.passing)}
            />
            <StatCard label="Failing" value={fmt(counts.failing)} />
            <StatCard
              label={`Accuracy ≤ ${SEVERE_ACCURACY}`}
              value={fmt(counts.severe)}
              highlight={counts.severe > 0}
            />
          </div>
          <div className={styles.section}>
            <div className={styles.chartCardHeader}>
              <div className={styles.sectionTitle}>Feed stories</div>
              <div className={styles.toolbar}>
                <StorySortSelect value={sort} onChange={setSort} />
                <label className={styles.filterLabel}>
                  <input
                    type="checkbox"
                    checked={severeOnly}
                    onChange={(e) => setSevereOnly(e.target.checked)}
                  />
                  Only accuracy ≤ {SEVERE_ACCURACY}
                </label>
              </div>
            </div>
            {mayBulk && (
              <div className={styles.bulkBar}>
                <span className={styles.bulkCount}>
                  {selectedStories.length > 0
                    ? `${selectedStories.length} selected`
                    : "No stories selected"}
                </span>
                <button
                  type="button"
                  className={styles.presetBtn}
                  onClick={() =>
                    setSelectedIds(new Set(manageableStories.map((s) => s.id)))
                  }
                  disabled={manageableStories.length === 0 || bulkBusy}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className={styles.presetBtn}
                  onClick={() =>
                    setSelectedIds(
                      new Set(
                        manageableStories
                          .filter((s) => s.accuracy == null)
                          .map((s) => s.id)
                      )
                    )
                  }
                  disabled={bulkBusy}
                >
                  Select unjudged
                </button>
                <button
                  type="button"
                  className={styles.presetBtn}
                  onClick={() => setSelectedIds(new Set())}
                  disabled={selectedStories.length === 0 || bulkBusy}
                >
                  Clear
                </button>
                <select
                  className={styles.metricSelect}
                  value={judgeModelKey}
                  onChange={(e) => setJudgeModelKey(e.target.value)}
                  aria-label="Judge model"
                  disabled={bulkBusy || judgingJobId != null}
                >
                  <option value="">Default judge model</option>
                  {judgeModels.map((m) => (
                    <option key={m.key} value={m.key}>
                      {formatWorkbenchModelLabel(m.key)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.generateBtn}
                  disabled={unjudgedTargets.length === 0 || bulkBusy || judgingJobId != null}
                  onClick={() => void runBulk("judge", judgePool, { unjudgedOnly: true })}
                >
                  {judgingJobId
                    ? "Judging…"
                    : `Judge unjudged (${unjudgedTargets.length})`}
                </button>
                {judgingJobId && onViewJob && (
                  <button
                    type="button"
                    className={styles.logsLink}
                    onClick={() => onViewJob(judgingJobId)}
                  >
                    Logs
                  </button>
                )}
                <button
                  type="button"
                  className={styles.presetBtn}
                  disabled={selectedStories.length === 0 || bulkBusy || judgingJobId != null}
                  onClick={() => void runBulk("hide", selectedStories)}
                >
                  Hide from public
                </button>
                <button
                  type="button"
                  className={styles.presetBtn}
                  disabled={selectedStories.length === 0 || bulkBusy || judgingJobId != null}
                  onClick={() => void runBulk("show", selectedStories)}
                >
                  Make public
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    className={styles.presetBtn}
                    disabled={selectedStories.length === 0 || bulkBusy || judgingJobId != null}
                    onClick={() => void runBulk("delete", selectedStories)}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
            <StoryList
              stories={stories.stories}
              onViewSession={viewSession}
              onOpenStory={openStory}
              emptyText="No stories in this window."
              canManageStory={canManageStory}
              canDelete={isAdmin}
              busyStoryId={busyStoryId}
              onToggleVisibility={(story) => void toggleVisibility(story)}
              onDelete={(story) => void deleteStory(story)}
              selectedIds={mayBulk ? selectedIds : undefined}
              onToggleSelected={mayBulk ? toggleSelected : undefined}
            />
          </div>
        </>
      )}

      {reviewing && reviewApi && (
        <StoryReviewModal
          story={reviewing.story}
          initialEvals={reviewing.evals}
          api={reviewApi}
          canAct={canActOnReview}
          onClose={() => {
            setReviewing(null);
            setReviewCityId(null);
            void load();
          }}
          onViewSession={viewSession}
          onVisibilityChange={markVisibility}
          onDeleted={dropStory}
        />
      )}
      {viewingSession && (
        <SessionViewerModal
          sessionId={viewingSession.id}
          label={viewingSession.label}
          onClose={() => setViewingSession(null)}
        />
      )}
      {showGenerate && generateTarget && (
        <GenerateStoryModal
          cityId={generateTarget.cityId}
          cityName={generateTarget.cityName}
          cities={cityId == null ? generateCities : undefined}
          onClose={() => setShowGenerate(false)}
          onStarted={(jobId) => {
            if (jobId) setGeneratingJobId(jobId);
          }}
        />
      )}
    </>
  );
}
