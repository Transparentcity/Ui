"use client";

/**
 * ProductAnalyticsDashboard — modular admin analytics hub.
 *
 * Tabs: Overview · Marketing · LLM costs · Integrations
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import LandingSourcesMatrix from "@/components/LandingSourcesMatrix";
import RetentionLagTable from "@/components/RetentionLagTable";
import RetentionTriangle from "@/components/RetentionTriangle";
import NeedsAttentionPanel from "@/components/NeedsAttentionPanel";
import SignupFunnelDashboard from "@/components/SignupFunnelDashboard";
import {
  getProductAnalyticsOverview,
  getTokenUsageDailySeries,
  getUserStats,
  type ProductAnalyticsOverview,
  type TokenUsageDailySeries,
  type TokenUsageSourceRow,
  type UserStats,
} from "@/lib/apiClient";
import styles from "./ProductAnalyticsDashboard.module.css";

type TabId =
  | "overview"
  | "needs-attention"
  | "marketing"
  | "llm-costs"
  | "integrations";

type ActiveMetric = "dau" | "wau" | "mau";

type AudienceFilter = "logged_in" | "logged_out" | "both";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "needs-attention", label: "Needs attention" },
  { id: "marketing", label: "Marketing" },
  { id: "llm-costs", label: "LLM costs" },
  { id: "integrations", label: "Integrations QA" },
];

const METRIC_LABELS: Record<ActiveMetric, string> = {
  dau: "DAU (daily active)",
  wau: "WAU (7-day rolling)",
  mau: "MAU (30-day rolling)",
};

const AUDIENCE_LABELS: Record<AudienceFilter, string> = {
  logged_in: "Logged in",
  logged_out: "Logged out",
  both: "Logged in & logged out",
};

function metricSeries(
  au: ProductAnalyticsOverview["active_users"],
  metric: ActiveMetric,
  audience: "logged_in" | "logged_out"
): { date: string; count: number }[] {
  if (audience === "logged_out") {
    if (metric === "wau") return au.daily_visitor_wau ?? [];
    if (metric === "mau") return au.daily_visitor_mau ?? [];
    return au.daily_visitor_dau ?? [];
  }
  if (metric === "wau") return au.daily_wau;
  if (metric === "mau") return au.daily_mau;
  return au.daily_dau;
}

const CHART_MARGIN = { top: 4, right: 8, left: 0, bottom: 0 };

const GROWTH_LEGEND = [
  { label: "New", color: "#10b981", kind: "swatch" as const },
  { label: "Returning", color: "#ad35fa", kind: "swatch" as const },
  { label: "Resurrecting", color: "#5B8DEF", kind: "swatch" as const },
  { label: "Dormant", color: "#9ca3af", kind: "line" as const },
];

const DEFAULT_RANGE_DAYS = 7;

function ChartLegend({
  items,
}: {
  items: { label: string; color: string; kind: "swatch" | "line" }[];
}) {
  return (
    <div className={styles.chartLegendRow} aria-hidden>
      {items.map((item) => (
        <span key={item.label} className={styles.chartLegendItem}>
          {item.kind === "line" ? (
            <span
              className={styles.legendLine}
              style={{ borderColor: item.color }}
            />
          ) : (
            <span
              className={styles.legendSwatch}
              style={{ backgroundColor: item.color }}
            />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}

function BySourceTable({
  rows,
  fmt,
  money,
  styles,
}: {
  rows: TokenUsageSourceRow[];
  fmt: (n: number | null | undefined) => string;
  money: (n: number | null | undefined) => string;
  styles: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (source: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>By use / job</div>
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              {["Source", "Calls", "Tokens in", "Tokens out", "Cost"].map((h, i) => (
                <th key={h} className={i > 0 ? styles.thRight : styles.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasSubRows = (row.sub_rows?.length ?? 0) > 0;
              const isOpen = expanded.has(row.source);
              return (
                <>
                  <tr key={row.source}>
                    <td className={styles.td}>
                      {hasSubRows ? (
                        <button
                          className={styles.subRowToggle}
                          onClick={() => toggle(row.source)}
                          aria-expanded={isOpen}
                        >
                          <span className={`${styles.chevron}${isOpen ? ` ${styles.chevronOpen}` : ""}`}>▶</span>
                          {row.source}
                        </button>
                      ) : (
                        row.source
                      )}
                    </td>
                    <td className={styles.tdRight}>{fmt(row.calls)}</td>
                    <td className={styles.tdRight}>{fmt(row.input_tokens)}</td>
                    <td className={styles.tdRight}>{fmt(row.output_tokens)}</td>
                    <td className={styles.tdRight}>{money(row.cost_usd)}</td>
                  </tr>
                  {hasSubRows && isOpen && (
                    <tr key={`${row.source}__sub`}>
                      <td colSpan={5} className={styles.subRowsWrap}>
                        <table className={styles.subTable}>
                          <tbody>
                            {row.sub_rows!.map((sub) => (
                              <tr key={sub.user}>
                                <td className={styles.subTd}>{sub.user}</td>
                                <td className={styles.subTdRight}>{fmt(sub.calls)}</td>
                                <td className={styles.subTdRight}>{fmt(sub.input_tokens)}</td>
                                <td className={styles.subTdRight}>{fmt(sub.output_tokens)}</td>
                                <td className={styles.subTdRight}>{money(sub.cost_usd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PRESETS = [
  { label: "L7", days: 7 },
  { label: "L28", days: 28 },
  { label: "12w", days: 84 },
];

function pct(n: number | null | undefined, decimals = 1): string {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? styles.statCardHighlight : styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={highlight ? styles.statValueHighlight : styles.statValue}>
        {value}
      </div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

function StatusPill({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div className={styles.statusRow}>
      <span className={ok ? styles.statusDotOk : styles.statusDotWarn} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.statusLabel}>{label}</div>
        {detail && <div className={styles.statusDetail}>{detail}</div>}
      </div>
    </div>
  );
}

export default function ProductAnalyticsDashboard() {
  const { getAccessTokenSilently } = useAuth0();
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  const [tab, setTab] = useState<TabId>("overview");
  const [days, setDays] = useState(DEFAULT_RANGE_DAYS);
  const [activeMetric, setActiveMetric] = useState<ActiveMetric>("wau");
  const [audience, setAudience] = useState<AudienceFilter>("logged_in");
  const [overview, setOverview] = useState<ProductAnalyticsOverview | null>(null);
  const [tokenSeries, setTokenSeries] = useState<TokenUsageDailySeries | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (overrideDays?: number) => {
      setLoading(true);
      setError(null);
      const d = overrideDays ?? days;
      try {
        const token = await getAccessTokenSilently();
        const [ov, ts, us] = await Promise.all([
          getProductAnalyticsOverview(token, { days: d }),
          getTokenUsageDailySeries(token, { days: d }),
          getUserStats(token),
        ]);
        setOverview(ov);
        setTokenSeries(ts);
        setUserStats(us);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    },
    [getAccessTokenSilently, days]
  );

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeMetricChart = useMemo(() => {
    if (!overview) return [];
    const au = overview.active_users;
    const li = metricSeries(au, activeMetric, "logged_in");
    const lo = metricSeries(au, activeMetric, "logged_out");
    const dates = li.length > 0 ? li.map((r) => r.date) : lo.map((r) => r.date);
    const liMap = new Map(li.map((r) => [r.date, r.count]));
    const loMap = new Map(lo.map((r) => [r.date, r.count]));

    if (audience === "logged_in") {
      return li.map((row) => ({
        day: shortDate(row.date),
        [AUDIENCE_LABELS.logged_in]: row.count,
      }));
    }
    if (audience === "logged_out") {
      return lo.map((row) => ({
        day: shortDate(row.date),
        [AUDIENCE_LABELS.logged_out]: row.count,
      }));
    }
    return dates.map((date) => ({
      day: shortDate(date),
      [AUDIENCE_LABELS.logged_in]: liMap.get(date) ?? 0,
      [AUDIENCE_LABELS.logged_out]: loMap.get(date) ?? 0,
    }));
  }, [overview, activeMetric, audience]);

  const showLoggedInSections =
    audience === "logged_in" || audience === "both";

  const growthChart = useMemo(() => {
    if (!overview?.growth_accounting.length) return [];
    return overview.growth_accounting.map((row) => ({
      day: shortDate(row.date),
      New: row.new,
      Returning: row.returning,
      Resurrecting: row.resurrecting,
      Dormant: row.dormant,
    }));
  }, [overview]);

  const tokenChart = useMemo(() => {
    if (!tokenSeries) return [];
    return tokenSeries.daily.map((row) => ({
      day: shortDate(row.date),
      Cost: row.cost_usd,
      Calls: row.calls,
    }));
  }, [tokenSeries]);

  const health = overview?.integration_health;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Dashboards</h2>
          {tab !== "needs-attention" && overview && (
            <div className={styles.subtitle}>
              {overview.active_users.date_from} → {overview.active_users.date_to}
            </div>
          )}
        </div>
        {tab !== "needs-attention" && (
          <div className={styles.toolbar}>
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                className={days === p.days ? styles.presetBtnActive : styles.presetBtn}
                onClick={() => {
                  setDays(p.days);
                  void load(p.days);
                }}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>
        )}
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
          </button>
        ))}
      </div>

      {tab !== "needs-attention" && error && (
        <div className={styles.errorBanner}>{error}</div>
      )}

      {tab !== "needs-attention" && loading && !overview && (
        <div className={styles.loading}>Loading analytics…</div>
      )}

      {/* Needs attention tab */}
      {tab === "needs-attention" && <NeedsAttentionPanel />}

      {/* Overview tab */}
      {tab === "overview" && overview && (
        <>
          <div className={styles.section}>
            <div className={styles.chartCard}>
              <div className={styles.chartCardHeader}>
                <div className={styles.sectionTitle}>Active users</div>
                <div className={styles.filterGroup}>
                  <select
                    className={styles.metricSelect}
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as AudienceFilter)}
                    aria-label="Audience"
                  >
                    <option value="logged_in">Logged in</option>
                    <option value="logged_out">Logged out</option>
                    <option value="both">Both</option>
                  </select>
                  <select
                    className={styles.metricSelect}
                    value={activeMetric}
                    onChange={(e) => setActiveMetric(e.target.value as ActiveMetric)}
                    aria-label="Active user metric"
                  >
                    <option value="dau">DAU</option>
                    <option value="wau">WAU</option>
                    <option value="mau">MAU</option>
                  </select>
                </div>
              </div>
              {activeMetricChart.length > 0 ? (
                <>
                  {audience === "both" && (
                    <ChartLegend
                      items={[
                        {
                          label: `${METRIC_LABELS[activeMetric]} · logged in`,
                          color: "#ad35fa",
                          kind: "line",
                        },
                        {
                          label: `${METRIC_LABELS[activeMetric]} · logged out`,
                          color: "#888",
                          kind: "line",
                        },
                      ]}
                    />
                  )}
                  <div className={styles.chartPlot}>
                    <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={activeMetricChart}
                    margin={CHART_MARGIN}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary, #e5e5e5)" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-primary, #fff)",
                        border: "1px solid var(--border-primary, #e5e5e5)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    {(audience === "logged_in" || audience === "both") && (
                      <Line
                        type="monotone"
                        dataKey={AUDIENCE_LABELS.logged_in}
                        stroke="#ad35fa"
                        strokeWidth={2}
                        dot={false}
                        name={`${METRIC_LABELS[activeMetric]} · logged in`}
                      />
                    )}
                    {(audience === "logged_out" || audience === "both") && (
                      <Line
                        type="monotone"
                        dataKey={AUDIENCE_LABELS.logged_out}
                        stroke="#888"
                        strokeWidth={audience === "both" ? 1.5 : 2}
                        dot={false}
                        name={`${METRIC_LABELS[activeMetric]} · logged out (sessions)`}
                      />
                    )}
                  </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p className={styles.note}>No activity in this period for this audience.</p>
              )}
            </div>
          </div>

          {showLoggedInSections && growthChart.length > 0 && (
            <div className={styles.section}>
              <div className={styles.chartCard}>
                <div className={styles.chartCardHeader}>
                  <div className={styles.sectionTitle}>
                    Growth accounting (logged in, L{overview.growth_window_days})
                  </div>
                </div>
                <ChartLegend items={GROWTH_LEGEND} />
                <div className={styles.chartPlot}>
                  <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={growthChart}
                    margin={CHART_MARGIN}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary, #e5e5e5)" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                    <Tooltip contentStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="New" stackId="active" fill="#10b981" />
                    <Bar dataKey="Returning" stackId="active" fill="#ad35fa" />
                    <Bar dataKey="Resurrecting" stackId="active" fill="#5B8DEF" />
                    <Line type="monotone" dataKey="Dormant" stroke="#9ca3af" strokeWidth={2} dot={false} />
                  </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {showLoggedInSections && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Retention cohorts (logged in)</div>
              <div className={styles.cardPadded}>
                <RetentionTriangle matrix={overview.retention_matrix} />
              </div>
            </div>
          )}

          {showLoggedInSections && overview.retention_lag?.rows?.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Retention lag (last 7 days, logged in)</div>
              <div className={styles.cardPadded}>
                <RetentionLagTable table={overview.retention_lag} />
              </div>
            </div>
          )}

          {(audience === "logged_in" || audience === "both") &&
            overview.feature_usage_logged_in.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Top events (logged in)</div>
              <div className={styles.card}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {["Event", "Count", "Users", "Sessions"].map((h, i) => (
                        <th key={h} className={i > 0 ? styles.thRight : styles.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overview.feature_usage_logged_in.slice(0, 12).map((row) => (
                      <tr key={row.event_name}>
                        <td className={styles.td}>{row.event_name}</td>
                        <td className={styles.tdRight}>{fmt(row.count)}</td>
                        <td className={styles.tdRight}>{fmt(row.unique_users)}</td>
                        <td className={styles.tdRight}>{fmt(row.unique_sessions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(audience === "logged_out" || audience === "both") &&
            (overview.feature_usage_logged_out ?? []).length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Top events (logged out)</div>
              <div className={styles.card}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {["Event", "Count", "Sessions"].map((h, i) => (
                        <th key={h} className={i > 0 ? styles.thRight : styles.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.feature_usage_logged_out ?? []).slice(0, 12).map((row) => (
                      <tr key={row.event_name}>
                        <td className={styles.td}>{row.event_name}</td>
                        <td className={styles.tdRight}>{fmt(row.count)}</td>
                        <td className={styles.tdRight}>{fmt(row.unique_sessions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Marketing tab — landings matrix + signup funnel */}
      {tab === "marketing" && overview && (
        <>
          <div className={styles.statGrid}>
            <StatCard label="Landings" value={fmt(overview.total_page_views)} />
            <StatCard label="Signup starts" value={fmt(overview.total_signup_starts)} />
            <StatCard label="Completes" value={fmt(overview.total_signup_completes)} highlight />
            <StatCard
              label="GA4 sessions (7d)"
              value={health?.ga4_available ? fmt(health.ga4_sessions_7d) : "—"}
              sub={health?.ga4_available ? "server-side Data API" : "not connected"}
            />
          </div>
          <p className={styles.note}>
            First-party landings and signup funnel from <code>product_events</code>.
            Column buckets: daily (L7), weekly (L28 / 12w).
          </p>
          {overview.landing_matrix && overview.landing_matrix.rows.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Landing sources</div>
              <div className={styles.card}>
                <LandingSourcesMatrix matrix={overview.landing_matrix} />
              </div>
            </div>
          )}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Signup & onboarding funnel</div>
            <div className={styles.funnelTab}>
              <SignupFunnelDashboard
                embedded
                days={days}
                hideNewsletterCohort
                hideLandingSources
              />
            </div>
          </div>

          {/* Gift trials section */}
          {userStats && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Gift trials</div>
              <div className={styles.statGrid}>
                <StatCard
                  label="Trials sent"
                  value={fmt(userStats.gift_subscriptions_sent ?? 0)}
                  sub="gift emails dispatched"
                />
                <StatCard
                  label="Email opens"
                  value={fmt(userStats.gift_email_clicks ?? 0)}
                  sub="recipients clicked CTA"
                />
                <StatCard
                  label="Accounts activated"
                  value={fmt(userStats.gift_accounts_onboarded ?? 0)}
                  sub="completed sign-in"
                  highlight
                />
                <StatCard
                  label="Activation rate"
                  value={
                    (userStats.gift_subscriptions_sent ?? 0) > 0
                      ? `${Math.round(
                          ((userStats.gift_accounts_onboarded ?? 0) /
                            (userStats.gift_subscriptions_sent ?? 1)) *
                            100
                        )}%`
                      : "—"
                  }
                  sub="trials → active accounts"
                />
              </div>
              <p className={styles.note}>
                &ldquo;Accounts activated&rdquo; = gift recipients who completed Auth0 sign-in.
                Click-through tracked via <code>/api/gift/click/&#123;token&#125;</code>.
              </p>
            </div>
          )}
        </>
      )}

      {/* LLM costs tab */}
      {tab === "llm-costs" && tokenSeries && (
        <>
          <div className={styles.statGrid}>
            <StatCard label="Total cost" value={money(tokenSeries.total_cost_usd)} highlight />
            <StatCard label="LLM calls" value={fmt(tokenSeries.llm_call_count)} />
            <StatCard label="Total tokens" value={fmt(tokenSeries.total_tokens)} />
            {(tokenSeries.cache_savings_usd ?? 0) > 0 ? (
              <StatCard
                label="Prompt-cache savings"
                value={money(tokenSeries.cache_savings_usd ?? 0)}
                sub={`${fmt(tokenSeries.total_cache_read_tokens ?? 0)} cached read tokens`}
                highlight
              />
            ) : (
              <StatCard
                label="LangSmith"
                value={health?.langsmith_configured ? "On" : "Off"}
                sub={health?.langsmith_project ?? "not configured"}
              />
            )}
          </div>
          <p className={styles.note}>
            Costs from <code>token_usage_log</code> (first-party). Custom scheduled jobs are attributed by job name;
            newsletter, chat, and structuring runs use fixed labels.{" "}
            {(tokenSeries.total_cache_read_tokens ?? 0) > 0 && (
              <>
                Prompt caching served{" "}
                <strong>{fmt(tokenSeries.total_cache_read_tokens ?? 0)}</strong> input tokens from
                cache (billed 0.10×) and wrote{" "}
                <strong>{fmt(tokenSeries.total_cache_creation_tokens ?? 0)}</strong> (1.25×), saving{" "}
                <strong>{money(tokenSeries.cache_savings_usd ?? 0)}</strong> vs. full input price.
              </>
            )}
          </p>
          {tokenChart.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Daily LLM cost</div>
              <div className={styles.chartCard}>
                <div className={styles.chartPlot}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tokenChart} margin={CHART_MARGIN}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary, #e5e5e5)" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={36} />
                      <Tooltip formatter={(v: number) => money(v)} contentStyle={{ fontSize: "12px" }} />
                      <Bar dataKey="Cost" fill="#5B8DEF" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
          {Object.keys(tokenSeries.by_model).length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>By model</div>
              <div className={styles.card}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {["Model", "Calls", "Tokens in", "Cache read", "Tokens out", "Cost"].map(
                        (h, i) => (
                          <th key={h} className={i > 0 ? styles.thRight : styles.th}>
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(tokenSeries.by_model).map(([model, stats]) => (
                      <tr key={model}>
                        <td className={styles.td}>{model}</td>
                        <td className={styles.tdRight}>{fmt(stats.calls)}</td>
                        <td className={styles.tdRight}>{fmt(stats.input_tokens)}</td>
                        <td className={styles.tdRight}>{fmt(stats.cache_read_tokens ?? 0)}</td>
                        <td className={styles.tdRight}>{fmt(stats.output_tokens)}</td>
                        <td className={styles.tdRight}>{money(stats.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {(tokenSeries.by_source ?? []).length > 0 && (
            <BySourceTable rows={tokenSeries.by_source ?? []} fmt={fmt} money={money} styles={styles} />
          )}
        </>
      )}

      {/* Integrations QA tab */}
      {tab === "integrations" && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Integration health</div>
          <div className={styles.card}>
            <StatusPill
              ok={(health?.first_party_events_24h ?? 0) > 0}
              label="First-party product events"
              detail={`${fmt(health?.first_party_events_24h)} events in last 24h · Postgres product_events table`}
            />
            <StatusPill
              ok={(health?.signup_events_24h ?? 0) > 0}
              label="Signup funnel events"
              detail={`${fmt(health?.signup_events_24h)} events in last 24h · signup_funnel_events table`}
            />
            <StatusPill
              ok={(health?.token_usage_24h ?? 0) > 0}
              label="LLM token tracking"
              detail={`${fmt(health?.token_usage_24h)} LLM calls logged in last 24h · token_usage_log`}
            />
            <StatusPill
              ok={!!health?.ga4_available}
              label="Google Analytics 4 (server Data API)"
              detail={
                health?.ga4_configured
                  ? health.ga4_available
                    ? `${fmt(health.ga4_sessions_7d)} sessions in last 7d · numeric GA_PROPERTY_ID + service account`
                    : "Data API call failed — use numeric GA Property ID (not G- Measurement ID), GOOGLE_APPLICATION_CREDENTIALS, and Viewer access for the service account on that property"
                  : "Set numeric GA_PROPERTY_ID and GOOGLE_APPLICATION_CREDENTIALS on the API server"
              }
            />
            <StatusPill
              ok={!!gaId}
              label="Google Analytics 4 (browser tag)"
              detail={
                gaId
                  ? `NEXT_PUBLIC_GA_MEASUREMENT_ID=${gaId} · Low user counts vs Search Console are normal (clicks ≠ users; ad blockers)`
                  : "NEXT_PUBLIC_GA_MEASUREMENT_ID not set in UI env"
              }
            />
            <StatusPill
              ok={!!health?.analytics_note}
              label="Product analytics pipeline"
              detail={health?.analytics_note ?? "First-party events via POST /api/public/event"}
            />
            <StatusPill
              ok={!!health?.langsmith_configured}
              label="LangSmith tracing"
              detail={
                health?.langsmith_configured
                  ? `Project: ${health.langsmith_project} · filter traces by tag chat, user:ID, model:KEY`
                  : "Set LANGSMITH_TRACING=true and LANGSMITH_API_KEY on API server"
              }
            />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>External dashboards</div>
            <div className={styles.linkRow}>
              {[
                { label: "Google Analytics", href: "https://analytics.google.com" },
                { label: "Search Console", href: "https://search.google.com/search-console" },
                { label: "LangSmith", href: "https://smith.langchain.com" },
                { label: "Vercel Analytics", href: "https://vercel.com/dashboard" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.externalLink}
                >
                  {link.label} ↗
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
