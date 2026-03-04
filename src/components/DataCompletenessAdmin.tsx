"use client";

import { useState, useMemo, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Building2, Globe, CheckCircle2, BarChart3 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import Loader from "@/components/Loader";
import {
  useCompletenessData,
  useCityDetail,
} from "@/lib/hooks/useDataCompleteness";
import type { CityListItem } from "@/lib/apiClient";
import styles from "./DataCompletenessAdmin.module.css";

// --- Colors ---
const STRUCTURE_COLORS: Record<string, string> = {
  complete: "#10b981",
  partial: "#f59e0b",
  not_started: "#ef4444",
};

const EXEC_COLORS: Record<string, string> = {
  completed: "#10b981",
  failed: "#ef4444",
  running: "#3b82f6",
  never_executed: "#9ca3af",
};

const FRESHNESS_COLORS = ["#10b981", "#ef4444", "#9ca3af"];
const CATEGORY_COLOR = "#8b5cf6";

// --- Helpers ---
type SortDir = "asc" | "desc";

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

// --- State table types ---
interface StateRow {
  state: string;
  total: number;
  withUrls: number;
  structured: number;
  withMetrics: number;
  completionPct: number;
}

// --- Component ---
export default function DataCompletenessAdmin() {
  const { cities, metricCities, metrics, summary, isLoading, isError } =
    useCompletenessData();

  // City table filters
  const [nameSearch, setNameSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  // Sort state for state table
  const [stateSortKey, setStateSortKey] = useState<keyof StateRow>("state");
  const [stateSortDir, setStateSortDir] = useState<SortDir>("asc");

  // Sort state for city table
  const [citySortKey, setCitySortKey] = useState<string>("city_name");
  const [citySortDir, setCitySortDir] = useState<SortDir>("asc");

  // Expanded city row
  const [expandedCityId, setExpandedCityId] = useState<number | null>(null);
  const cityDetailQuery = useCityDetail(expandedCityId);

  // --- Aggregations ---
  const metricCityMap = useMemo(() => {
    const m = new Map<number, number>();
    metricCities.forEach((mc) => m.set(mc.id, mc.metric_count));
    return m;
  }, [metricCities]);

  const agg = useMemo(() => {
    const totalCities = cities.length;
    const activeCities = cities.filter((c) => c.is_active).length;
    const withPortal = cities.filter((c) => c.main_portal_url).length;

    const structureBreakdown = { complete: 0, partial: 0, not_started: 0 };
    cities.forEach((c) => {
      const s = c.structure_status ?? "not_started";
      if (s in structureBreakdown) {
        structureBreakdown[s as keyof typeof structureBreakdown]++;
      } else {
        structureBreakdown.not_started++;
      }
    });

    const citiesWithMetrics = cities.filter(
      (c) => (metricCityMap.get(c.city_id) ?? 0) > 0
    ).length;

    // Metrics by execution status
    const execStatus: Record<string, number> = {};
    metrics.forEach((m) => {
      const s = m.last_execution_status ?? "never_executed";
      execStatus[s] = (execStatus[s] ?? 0) + 1;
    });

    // Metrics by category
    const categoryCount: Record<string, number> = {};
    metrics.forEach((m) => {
      const cat = m.category || "Uncategorized";
      categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
    });

    // Freshness
    let fresh = 0;
    let stale = 0;
    let noFreshness = 0;
    metrics.forEach((m) => {
      if (!m.freshness || m.freshness.is_stale === null || m.freshness.is_stale === undefined) {
        noFreshness++;
      } else if (m.freshness.is_stale) {
        stale++;
      } else {
        fresh++;
      }
    });

    // Per-state rollup
    const stateMap = new Map<string, { cities: CityListItem[] }>();
    cities.forEach((c) => {
      const st = c.state || "Unknown";
      if (!stateMap.has(st)) stateMap.set(st, { cities: [] });
      stateMap.get(st)!.cities.push(c);
    });

    const stateRows: StateRow[] = Array.from(stateMap.entries()).map(
      ([state, { cities: stateCities }]) => {
        const total = stateCities.length;
        const withUrls = stateCities.filter((c) => c.main_portal_url).length;
        const structured = stateCities.filter(
          (c) => c.structure_status === "complete"
        ).length;
        const withMet = stateCities.filter(
          (c) => (metricCityMap.get(c.city_id) ?? 0) > 0
        ).length;
        const score = total > 0 ? ((withUrls + structured + withMet) / (total * 3)) * 100 : 0;
        return {
          state,
          total,
          withUrls,
          structured,
          withMetrics: withMet,
          completionPct: Math.round(score),
        };
      }
    );

    // Overall readiness: cities with URL + complete structure + metrics
    const readyCities = cities.filter(
      (c) =>
        c.main_portal_url &&
        c.structure_status === "complete" &&
        (metricCityMap.get(c.city_id) ?? 0) > 0
    ).length;

    return {
      totalCities,
      activeCities,
      withPortal,
      structureBreakdown,
      citiesWithMetrics,
      execStatus,
      categoryCount,
      fresh,
      stale,
      noFreshness,
      stateRows,
      readyCities,
    };
  }, [cities, metrics, metricCityMap]);

  // Chart data
  const structureChartData = useMemo(
    () =>
      Object.entries(agg.structureBreakdown).map(([name, value]) => ({
        name: name.replace("_", " "),
        value,
      })),
    [agg.structureBreakdown]
  );

  const categoryChartData = useMemo(
    () =>
      Object.entries(agg.categoryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, value]) => ({ name, value })),
    [agg.categoryCount]
  );

  const execChartData = useMemo(
    () =>
      Object.entries(agg.execStatus).map(([name, value]) => ({
        name: name.replace("_", " "),
        value,
      })),
    [agg.execStatus]
  );

  const freshnessChartData = useMemo(
    () => [
      { name: "Fresh", value: agg.fresh },
      { name: "Stale", value: agg.stale },
      { name: "Unknown", value: agg.noFreshness },
    ],
    [agg.fresh, agg.stale, agg.noFreshness]
  );

  // State list for filter dropdown
  const stateList = useMemo(
    () =>
      Array.from(new Set(cities.map((c) => c.state || "Unknown"))).sort(),
    [cities]
  );

  // Sorted state rows
  const sortedStateRows = useMemo(() => {
    const rows = [...agg.stateRows];
    rows.sort((a, b) => {
      const av = a[stateSortKey];
      const bv = b[stateSortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return stateSortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      return stateSortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return rows;
  }, [agg.stateRows, stateSortKey, stateSortDir]);

  // Filtered and sorted city rows
  const filteredCities = useMemo(() => {
    let rows = [...cities];
    if (nameSearch) {
      const q = nameSearch.toLowerCase();
      rows = rows.filter((c) => c.city_name.toLowerCase().includes(q));
    }
    if (statusFilter) {
      rows = rows.filter((c) => (c.structure_status ?? "not_started") === statusFilter);
    }
    if (stateFilter) {
      rows = rows.filter((c) => (c.state || "Unknown") === stateFilter);
    }
    rows.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (citySortKey) {
        case "city_name":
          av = a.city_name;
          bv = b.city_name;
          break;
        case "state":
          av = a.state || "";
          bv = b.state || "";
          break;
        case "structure_status":
          av = a.structure_status || "not_started";
          bv = b.structure_status || "not_started";
          break;
        case "datasets_count":
          av = a.datasets_count ?? 0;
          bv = b.datasets_count ?? 0;
          break;
        case "metrics":
          av = metricCityMap.get(a.city_id) ?? 0;
          bv = metricCityMap.get(b.city_id) ?? 0;
          break;
        default:
          av = a.city_name;
          bv = b.city_name;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return citySortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      return citySortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return rows;
  }, [cities, nameSearch, statusFilter, stateFilter, citySortKey, citySortDir, metricCityMap]);

  const handleStateSort = useCallback(
    (key: keyof StateRow) => {
      if (stateSortKey === key) {
        setStateSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setStateSortKey(key);
        setStateSortDir("asc");
      }
    },
    [stateSortKey]
  );

  const handleCitySort = useCallback(
    (key: string) => {
      if (citySortKey === key) {
        setCitySortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setCitySortKey(key);
        setCitySortDir("asc");
      }
    },
    [citySortKey]
  );

  const sortIndicator = (active: boolean, dir: SortDir) =>
    active ? (
      <span className={styles.sortArrow}>{dir === "asc" ? "▲" : "▼"}</span>
    ) : null;

  const structureStatusBadge = (status?: string | null) => {
    const s = status ?? "not_started";
    const cls =
      s === "complete"
        ? styles.badgeGreen
        : s === "partial"
          ? styles.badgeYellow
          : styles.badgeRed;
    return (
      <span className={`${styles.badge} ${cls}`}>
        {s.replace("_", " ")}
      </span>
    );
  };

  // --- Render ---
  if (isLoading) {
    return (
      <div className={styles.loaderWrap}>
        <Loader size="md" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.errorMessage}>
        Failed to load data completeness information. Please try refreshing.
      </div>
    );
  }

  const totalMetrics = summary?.total_metrics ?? metrics.length;

  return (
    <div className={styles.container}>
      {/* Section 1: Stat Cards */}
      <div className={styles.statsGrid}>
        <StatCard
          title="Total Cities"
          value={agg.totalCities}
          description={`${agg.activeCities} active`}
          icon={Building2}
          variant="primary"
        />
        <StatCard
          title="Cities with Portal URLs"
          value={agg.withPortal}
          description={pct(agg.withPortal, agg.totalCities)}
          icon={Globe}
          variant={agg.withPortal / Math.max(agg.totalCities, 1) > 0.5 ? "success" : "warning"}
        />
        <StatCard
          title="Fully Structured"
          value={agg.structureBreakdown.complete}
          description={pct(agg.structureBreakdown.complete, agg.totalCities)}
          icon={CheckCircle2}
          variant={
            agg.structureBreakdown.complete / Math.max(agg.totalCities, 1) > 0.5
              ? "success"
              : "warning"
          }
        />
        <StatCard
          title="Active Metrics"
          value={totalMetrics}
          description={`across ${agg.citiesWithMetrics} cities`}
          icon={BarChart3}
          variant="default"
        />
      </div>

      {/* Section 2: Charts Row 1 */}
      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Structure Status</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={structureChartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {structureChartData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={
                      STRUCTURE_COLORS[entry.name.replace(" ", "_")] ?? "#9ca3af"
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--border-primary)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              />
              <Legend
                formatter={(value: string) => (
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Top Categories</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={categoryChartData}
              layout="vertical"
              margin={{ left: 80, right: 16, top: 0, bottom: 0 }}
            >
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--border-primary)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              />
              <Bar dataKey="value" fill={CATEGORY_COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 3: Charts Row 2 */}
      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Metric Execution Status</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={execChartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {execChartData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={
                      EXEC_COLORS[entry.name.replace(" ", "_")] ?? "#9ca3af"
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--border-primary)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              />
              <Legend
                formatter={(value: string) => (
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Data Freshness</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={freshnessChartData}
              margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
            >
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--border-primary)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {freshnessChartData.map((_, i) => (
                  <Cell key={i} fill={FRESHNESS_COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 4: Progress Bar */}
      <div className={styles.progressSection}>
        <div className={styles.progressLabel}>Overall City Readiness</div>
        <div className={styles.progressBarBg}>
          <div
            className={styles.progressBarFill}
            style={{
              width: `${agg.totalCities > 0 ? (agg.readyCities / agg.totalCities) * 100 : 0}%`,
            }}
          />
        </div>
        <div className={styles.progressText}>
          {agg.readyCities} of {agg.totalCities} cities ready (
          {pct(agg.readyCities, agg.totalCities)}) — has portal URL + complete
          structure + metrics
        </div>
      </div>

      {/* Section 5: Per-State Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitle}>Per-State Breakdown</div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                {(
                  [
                    ["state", "State"],
                    ["total", "Total Cities"],
                    ["withUrls", "With URLs"],
                    ["structured", "Structured"],
                    ["withMetrics", "With Metrics"],
                    ["completionPct", "Completion %"],
                  ] as [keyof StateRow, string][]
                ).map(([key, label]) => (
                  <th
                    key={key}
                    className={styles.th}
                    onClick={() => handleStateSort(key)}
                  >
                    {label}
                    {sortIndicator(stateSortKey === key, stateSortDir)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedStateRows.map((row) => (
                <tr key={row.state} className={styles.rowHover}>
                  <td className={styles.td}>{row.state}</td>
                  <td className={styles.td}>{row.total}</td>
                  <td className={styles.td}>{row.withUrls}</td>
                  <td className={styles.td}>{row.structured}</td>
                  <td className={styles.td}>{row.withMetrics}</td>
                  <td className={styles.td}>{row.completionPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 6: City Detail Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitle}>All Cities</div>
        </div>
        <div className={styles.filtersRow}>
          <input
            className={styles.searchInput}
            placeholder="Search city name..."
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
          />
          <select
            className={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="complete">Complete</option>
            <option value="partial">Partial</option>
            <option value="not_started">Not Started</option>
          </select>
          <select
            className={styles.select}
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="">All states</option>
            {stateList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                {(
                  [
                    ["city_name", "City"],
                    ["state", "State"],
                    ["portal", "Portal URL"],
                    ["structure_status", "Structure"],
                    ["datasets_count", "Datasets"],
                    ["metrics", "Metrics"],
                  ] as [string, string][]
                ).map(([key, label]) => (
                  <th
                    key={key}
                    className={`${styles.th} ${key === "portal" ? styles.hideNarrow : ""}`}
                    onClick={() => key !== "portal" && handleCitySort(key)}
                    style={key === "portal" ? { cursor: "default" } : undefined}
                  >
                    {label}
                    {key !== "portal" &&
                      sortIndicator(citySortKey === key, citySortDir)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCities.map((city) => (
                <>
                  <tr
                    key={city.city_id}
                    className={`${styles.rowHover} ${styles.rowClickable}`}
                    onClick={() =>
                      setExpandedCityId(
                        expandedCityId === city.city_id ? null : city.city_id
                      )
                    }
                  >
                    <td className={styles.td}>{city.city_name}</td>
                    <td className={styles.td}>{city.state || "—"}</td>
                    <td className={`${styles.td} ${styles.hideNarrow}`}>
                      {city.main_portal_url ? (
                        <a
                          href={city.main_portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: "var(--brand-primary)", fontSize: "inherit" }}
                        >
                          {new URL(city.main_portal_url).hostname}
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </td>
                    <td className={styles.td}>
                      {structureStatusBadge(city.structure_status)}
                    </td>
                    <td className={styles.td}>{city.datasets_count ?? 0}</td>
                    <td className={styles.td}>
                      {metricCityMap.get(city.city_id) ?? 0}
                    </td>
                  </tr>
                  {expandedCityId === city.city_id && (
                    <tr key={`${city.city_id}-detail`} className={styles.expandedRow}>
                      <td colSpan={6} className={styles.expandedContent}>
                        {cityDetailQuery.isLoading ? (
                          <Loader size="sm" />
                        ) : cityDetailQuery.data ? (
                          <div className={styles.expandedGrid}>
                            <div>
                              <div className={styles.expandedLabel}>Population</div>
                              <div className={styles.expandedValue}>
                                {cityDetailQuery.data.population || "—"}
                              </div>
                            </div>
                            <div>
                              <div className={styles.expandedLabel}>Domain</div>
                              <div className={styles.expandedValue}>
                                {city.main_domain || "—"}
                              </div>
                            </div>
                            <div>
                              <div className={styles.expandedLabel}>Active</div>
                              <div className={styles.expandedValue}>
                                {city.is_active ? "Yes" : "No"}
                              </div>
                            </div>
                            <div>
                              <div className={styles.expandedLabel}>
                                Geographic Structures
                              </div>
                              <div className={styles.expandedValue}>
                                {cityDetailQuery.data.geographic_structures?.length ?? 0}
                              </div>
                            </div>
                            <div>
                              <div className={styles.expandedLabel}>
                                Governance Structures
                              </div>
                              <div className={styles.expandedValue}>
                                {cityDetailQuery.data.governance_structures?.length ?? 0}
                              </div>
                            </div>
                            <div>
                              <div className={styles.expandedLabel}>Portal URLs</div>
                              <div className={styles.expandedValue}>
                                {cityDetailQuery.data.all_portal_urls?.length ?? 0}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span>Unable to load details</span>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {filteredCities.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className={styles.td}
                    style={{ textAlign: "center", color: "var(--text-secondary)" }}
                  >
                    No cities match filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
