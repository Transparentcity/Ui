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
  getOpsCityStories,
  getOpsStories,
  getOpsStoryReview,
  opsAutocorrectStory,
  opsJudgeStory,
  opsRejudgeStory,
  opsSetStoryOverride,
  type OpsCityStories,
  type OpsCityStory,
  type OpsStoryReview,
  type OpsStorySort,
} from "@/lib/apiClient";
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
  };
}

interface StoryListProps {
  stories: OpsCityStory[];
  onViewSession?: (sessionId: string) => void;
  onOpenStory?: (story: OpsCityStory) => void;
  emptyText: string;
}

/** Ops story list on the shared AdminStoryRow. */
export function StoryList({ stories, onViewSession, onOpenStory, emptyText }: StoryListProps) {
  if (stories.length === 0) return <p className={styles.note}>{emptyText}</p>;
  return (
    <AdminStoryList>
      {stories.map((s) => (
        <AdminStoryRow
          key={s.id}
          story={s}
          onViewSession={onViewSession}
          onOpen={onOpenStory ? () => onOpenStory(s) : undefined}
          actions={
            <AdminStoryAction label="Open story" href={publicStoryPath(s)}>
              <ExternalLink size={14} aria-hidden="true" />
            </AdminStoryAction>
          }
        />
      ))}
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

  const viewSession = isAdmin
    ? (id: string, label = "Creation session") => setViewingSession({ id, label })
    : undefined;

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
    };
  }, [reviewCityId]);

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
            <StoryList
              stories={stories.stories}
              onViewSession={viewSession}
              onOpenStory={openStory}
              emptyText="No stories in this window."
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
