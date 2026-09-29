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
import MetricEditModal from "@/components/MetricEditModal";
import OpsStoriesTab, {
  StoryList,
  StorySortSelect,
  toReviewStory,
} from "@/components/admin/OpsStoriesTab";
import SessionViewerModal from "@/components/eval/SessionViewerModal";
import type { ReviewStory, StoryReviewApi } from "@/components/StoryReviewModal";
import {
  getOpsCities,
  getOpsCityHealth,
  getOpsCityLlmCost,
  getOpsStoryReview,
  opsAutocorrectStory,
  opsJudgeStory,
  opsRejudgeStory,
  opsSetStoryOverride,
  getOpsCityUsage,
  type OpsCity,
  type OpsStorySort,
  type OpsCityLlmCost,
  type OpsCityStory,
  type OpsCityUsage,
  type OpsStoryReview,
} from "@/lib/apiClient";
import { fmt, money, shortDate, StatCard } from "@/components/analytics/dashboardParts";
import { countCriticalAlerts, ensureCitiesAttention } from "@/lib/cityHealthAttention";
import StoryReviewModal from "@/components/StoryReviewModal";
import styles from "./ProductAnalyticsDashboard.module.css";

type TabId = "overview" | "health" | "metrics" | "stories" | "llm-costs";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "health", label: "City health" },
  { id: "metrics", label: "Metrics" },
  { id: "stories", label: "Stories" },
  { id: "llm-costs", label: "LLM costs" },
];

/** Tabs whose data is a time window (L7 / L30 / L90). */
function usesWindow(tab: TabId): boolean {
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
}: {
  usage: OpsCityUsage;
  storySort: OpsStorySort;
  onStorySortChange: (sort: OpsStorySort) => void;
  onViewSession?: (sessionId: string) => void;
  onOpenStory?: (story: OpsCityStory) => void;
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

interface CityOpsDashboardProps {
  isAdmin: boolean;
  onViewJob: (jobId: string) => void;
  /** Hide the page title when embedded as a tab in the admin dashboard. */
  embedded?: boolean;
}

export default function CityOpsDashboard({ isAdmin, onViewJob, embedded }: CityOpsDashboardProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [cities, setCities] = useState<OpsCity[] | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
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
    };
  }, [cityId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await getOpsCities(token);
        if (cancelled) return;
        setCities(res.cities);
        setCityId((prev) => prev ?? res.cities[0]?.city_id ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load cities");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessTokenSilently]);

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
    // The health tab loads this payload itself. Skip the badge request then.
    if (tab === "health") return;
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
  }, [cityId, tab, getAccessTokenSilently]);

  const selected = cities?.find((c) => c.city_id === cityId) ?? null;

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
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          {!embedded && <h2 className={styles.title}>{selected ? selected.name : "Dashboards"}</h2>}
          {selected && !selected.can_manage && (
            <div className={styles.subtitle}>View only</div>
          )}
        </div>
        <div className={styles.toolbar}>
          {cities && cities.length > 1 && (
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
      </div>

      <div className={styles.tabBar}>
        {TABS.map((t) => (
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
          onViewJob={onViewJob}
          scope={{ cityId, canManage: selected.can_manage, isAdmin }}
        />
      )}
      {cityId != null && tab === "metrics" && selected && (
        <CitySiteView
          key={`${cityId}-${metricsRefresh}`}
          scope={{ cityId, canManage: selected.can_manage, isAdmin }}
          onViewJob={onViewJob}
          onEditMetric={isAdmin ? setEditingMetricId : undefined}
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
