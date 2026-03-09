"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth0 } from "@auth0/auth0-react";
import { useCityAnomalies, useAvailablePeriods, useAnomalyPlaceTypes, type AnomalyResult } from "@/lib/hooks/useAnomalies";
import { getPlaceAnomalies, type PlaceAnomaly } from "@/lib/apiClient";
import AnomalySparkline from "./AnomalySparkline";
import Loader from "./Loader";
import { MetricLink } from "./MetricLink";
import { slugify } from "@/lib/utils";
import { parseLocalDate } from "@/lib/dateRange";
import styles from "./AnomaliesTabPanel.module.css";

export interface AnomalyPanelMetric {
  id: number;
  metric_name: string;
}

interface AnomaliesTabPanelProps {
  cityId: number;
  cityName?: string;
  metrics?: AnomalyPanelMetric[];
  initialDistrict?: number | null;
  selectedPlaceId?: number | null;
  userPlaces?: Array<{ id: number; label: string; city_id: number }>;
  /** When true, hide the panel's own "Anomaly Alerts" heading (e.g. when used under city view section title). */
  hideSectionTitle?: boolean;
  onMetricClick?: (metricId: number, district?: number | null) => void;
}

// Helper to format period date range title
function formatPeriodTitle(periodType: string, dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  
  try {
    if (periodType === "month") {
      let year: string, month: string;
      if (/^\d{4}-\d{2}$/.test(dateStr)) {
        [year, month] = dateStr.split("-");
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        [year, month] = dateStr.split("-");
      } else {
        const date = parseLocalDate(dateStr);
        if (isNaN(date.getTime())) return "";
        year = date.getFullYear().toString();
        month = (date.getMonth() + 1).toString().padStart(2, "0");
      }
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthNum = parseInt(month);
      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return "";
      return `${monthNames[monthNum - 1]} ${year}`;
    } else if (periodType === "week") {
      if (dateStr.includes("-W")) {
        const [year, weekPart] = dateStr.split("-W");
        const weekNum = parseInt(weekPart);
        if (isNaN(weekNum)) return "";
        
        const jan4 = new Date(parseInt(year), 0, 4);
        const jan4Day = jan4.getDay() || 7;
        const daysToMonday = (8 - jan4Day) % 7;
        const week1Monday = new Date(parseInt(year), 0, 4 + daysToMonday);
        const weekStart = new Date(week1Monday);
        weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const startMonth = weekStart.toLocaleDateString("en-US", { month: "short" });
        const startDay = weekStart.getDate();
        const endMonth = weekEnd.toLocaleDateString("en-US", { month: "short" });
        const endDay = weekEnd.getDate();
        const yearStr = weekStart.getFullYear();
        
        if (startMonth === endMonth) {
          return `${startMonth} ${startDay}–${endDay}, ${yearStr}`;
        } else {
          return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${yearStr}`;
        }
      } else {
        const date = parseLocalDate(dateStr);
        if (isNaN(date.getTime())) return "";
        
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date);
        monday.setDate(diff);
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        
        const startMonth = monday.toLocaleDateString("en-US", { month: "short" });
        const startDay = monday.getDate();
        const endMonth = sunday.toLocaleDateString("en-US", { month: "short" });
        const endDay = sunday.getDate();
        const yearStr = monday.getFullYear();
        
        if (startMonth === endMonth) {
          return `${startMonth} ${startDay}–${endDay}, ${yearStr}`;
        } else {
          return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${yearStr}`;
        }
      }
    } else if (periodType === "day") {
      const date = parseLocalDate(dateStr);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } else if (periodType === "year") {
      if (/^\d{4}$/.test(dateStr)) {
        return dateStr;
      }
      const date = parseLocalDate(dateStr);
      if (isNaN(date.getTime())) return "";
      return date.getFullYear().toString();
    }
    return "";
  } catch {
    return "";
  }
}

// Human-readable period type for display
function formatPeriodTypeLabel(periodType: string): string {
  const labels: Record<string, string> = {
    day: "Daily",
    week: "Weekly",
    month: "Monthly",
    year: "Yearly",
  };
  return labels[periodType?.toLowerCase()] ?? periodType ?? "";
}

// Get date range info from chart_payload
function getDateRangeInfo(
  chartPayload: Record<string, any> | null | undefined,
  periodType?: string
) {
  if (!chartPayload?.dates || !chartPayload?.periods) {
    return null;
  }

  const dates = chartPayload.dates as string[];
  const periods = chartPayload.periods as string[];
  
  const recentDates: string[] = [];
  const comparisonDates: string[] = [];
  
  dates.forEach((date, idx) => {
    const period = periods[idx];
    if (period === "recent") {
      recentDates.push(date);
    } else if (period === "comparison") {
      comparisonDates.push(date);
    }
  });

  // Recent period display
  let recentDisplay: string | null = null;
  if (recentDates.length > 0) {
    const lastRecent = recentDates[recentDates.length - 1];
    recentDisplay = formatPeriodTitle(periodType || "", lastRecent);
  }

  // Comparison period display (range)
  let comparisonDisplay: string | null = null;
  if (comparisonDates.length > 0) {
    const firstComp = formatPeriodTitle(periodType || "", comparisonDates[0]);
    const lastComp = formatPeriodTitle(periodType || "", comparisonDates[comparisonDates.length - 1]);
    if (firstComp && lastComp) {
      comparisonDisplay = firstComp === lastComp ? firstComp : `${firstComp} – ${lastComp}`;
    }
  }

  return {
    recentDisplay,
    comparisonDisplay,
    comparisonCount: comparisonDates.length,
  };
}

// Calculate sigma (z-score)
function getSigma(anomaly: AnomalyResult): number {
  const stddev = anomaly.stddev;
  if (stddev == null || stddev <= 0) return 0;
  return Math.abs(anomaly.difference ?? 0) / stddev;
}

// Helper to format anomaly display info
function getAnomalyDisplayInfo(anomaly: AnomalyResult) {
  const recentMean = anomaly.recent_mean ?? 0;
  const comparisonMean = anomaly.comparison_mean ?? 0;
  const diff = anomaly.difference ?? (recentMean - comparisonMean);
  const absDiff = Math.abs(diff);
  const isUp = diff > 0;
  const sigma = getSigma(anomaly);
  
  // Percentage change
  const pctChange = anomaly.pct_change ?? (comparisonMean !== 0 ? (diff / comparisonMean) * 100 : 0);

  const greendirection = anomaly.greendirection || "down";
  const isBad = greendirection === "up" ? !isUp : isUp;

  const itemNoun = anomaly.item_noun || "items";
  const displayNoun =
    Math.round(absDiff) === 1
      ? itemNoun
      : itemNoun.endsWith("s")
      ? itemNoun
      : `${itemNoun}s`;

  const groupField = anomaly.group_field || null;
  const groupValue = anomaly.group_value || null;

  // District/Citywide/Place - badge: show place name when anomaly is grouped by a location (e.g. neighborhood)
  let districtDisplay: string;
  if (anomaly.district != null && anomaly.district !== 0) {
    districtDisplay = `District ${anomaly.district}`;
  } else if (groupValue) {
    districtDisplay = groupValue;
  } else {
    districtDisplay = "Citywide";
  }

  const metricName = anomaly.metric_name || anomaly.object_name || `Metric ${anomaly.metric_id}`;
  const dateInfo = getDateRangeInfo(anomaly.chart_payload, anomaly.period_type);

  return {
    recentMean,
    comparisonMean,
    diff,
    absDiff,
    isUp,
    isBad,
    sigma,
    pctChange,
    displayNoun,
    districtDisplay,
    groupField,
    groupValue,
    metricName,
    recentDisplay: dateInfo?.recentDisplay,
    comparisonDisplay: dateInfo?.comparisonDisplay,
    comparisonCount: dateInfo?.comparisonCount ?? 0,
  };
}

const PERIOD_TYPE_OPTIONS = [
  { value: "", label: "All periods" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "day", label: "Daily" },
  { value: "year", label: "Yearly" },
];

const MIN_SIGMA_OPTIONS: ({ value: ""; label: string } | { value: number; label: string })[] = [
  { value: "", label: "All" },
  { value: 2, label: "≥ 2σ" },
  { value: 2.5, label: "≥ 2.5σ" },
  { value: 3, label: "≥ 3σ" },
  { value: 3.5, label: "≥ 3.5σ" },
  { value: 4, label: "≥ 4σ" },
];

// districtFilter values: "all" | "citywide" | "any_district" | "<number>" | "place:<id>" | "group:<field>|<value>"
type DistrictFilterValue = string;

const GROUP_PREFIX = "group:";

/** Single anomaly card: links to full details page /a/[id]. Metric name click opens metric modal (stops propagation). */
function AnomalyCard({
  anomaly,
  cityName,
  initialDistrict,
  onMetricClick,
  slugify: slugifyFn,
  getAnomalyDisplayInfo: getInfo,
  formatPeriodTypeLabel: formatPeriodLabel,
}: {
  anomaly: AnomalyResult;
  cityName?: string;
  initialDistrict?: number | null;
  onMetricClick?: (metricId: number, district?: number | null) => void;
  slugify: (s: string) => string;
  getAnomalyDisplayInfo: (a: AnomalyResult) => ReturnType<typeof getAnomalyDisplayInfo>;
  formatPeriodTypeLabel: (s: string) => string;
}) {
  const info = getInfo(anomaly);
  const href = anomaly.id != null ? `/a/${anomaly.id}` : "#";

  return (
    <Link
      href={href}
      className={styles.anomalyCard}
      data-is-bad={info.isBad}
      aria-label={`View anomaly details: ${info.metricName}, ${info.districtDisplay}`}
    >
      {anomaly.chart_payload && (
        <div className={styles.sparklineContainer}>
          <AnomalySparkline
            chartData={{
              dates: anomaly.chart_payload.dates || [],
              values: anomaly.chart_payload.values || [],
              periods: anomaly.chart_payload.periods || [],
            }}
            periodType={anomaly.period_type}
            height={70}
            width={120}
            showAverage={true}
            showAnnotations={true}
          />
        </div>
      )}
      <div className={styles.anomalyInfo}>
        <div className={styles.headerRow}>
          <div className={styles.titleBlock} onClick={(e) => e.stopPropagation()} role="presentation">
            {info.groupValue ? (
              <>
                <span className={styles.metricNameSmall}>
                  {cityName ? (
                    <MetricLink
                      metricId={anomaly.metric_id}
                      citySlug={slugifyFn(cityName)}
                      mode="modal"
                      district={initialDistrict ?? undefined}
                      onModalOpen={onMetricClick}
                      className="metric-link-inline"
                    >
                      {info.metricName}
                    </MetricLink>
                  ) : (
                    info.metricName
                  )}
                </span>
                <span className={styles.groupValueLarge}>
                  {info.groupField && <span className={styles.groupFieldLabel}>{info.groupField}: </span>}
                  {info.groupValue}
                </span>
              </>
            ) : (
              <span className={styles.metricNameLarge}>
                {cityName ? (
                  <MetricLink
                    metricId={anomaly.metric_id}
                    citySlug={slugifyFn(cityName)}
                    mode="modal"
                    district={initialDistrict ?? undefined}
                    onModalOpen={onMetricClick}
                    className="metric-link-inline"
                  >
                    {info.metricName}
                  </MetricLink>
                ) : (
                  info.metricName
                )}
              </span>
            )}
          </div>
          <span className={styles.districtBadge}>{info.districtDisplay}</span>
        </div>
        <div className={styles.changeRow}>
          <span className={styles.changeAmount} data-is-bad={info.isBad}>
            <i className={`fas fa-arrow-${info.isUp ? "up" : "down"}`} />
            {info.isUp ? "+" : "−"}{Math.round(info.absDiff).toLocaleString()} {info.displayNoun}
          </span>
          <span className={styles.changeStats}>
            ({info.isUp ? "+" : ""}{info.pctChange.toFixed(0)}%, {info.sigma.toFixed(1)}σ)
          </span>
        </div>
        <div className={styles.dateRow}>
          <span className={styles.periodBadge}>{formatPeriodLabel(anomaly.period_type)}</span>
          <span className={styles.dateInfo}>
            <strong>Recent:</strong> {info.recentDisplay || "—"}
            {info.comparisonDisplay && (
              <> vs <strong>Avg of {info.comparisonCount}:</strong> {info.comparisonDisplay}</>
            )}
          </span>
        </div>
        <div className={styles.statsRow}>
          <span className={styles.statItem}>
            <span className={styles.statLabel}>Historic avg:</span>
            <span className={styles.statValue}>{Math.round(info.comparisonMean).toLocaleString()}</span>
          </span>
          <span className={styles.statArrow}>→</span>
          <span className={styles.statItem}>
            <span className={styles.statLabel}>Recent:</span>
            <span className={styles.statValue} data-is-bad={info.isBad}>
              {Math.round(info.recentMean).toLocaleString()}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function AnomaliesTabPanel({
  cityId,
  cityName,
  metrics = [],
  initialDistrict,
  selectedPlaceId = null,
  userPlaces = [],
  hideSectionTitle = false,
  onMetricClick,
}: AnomaliesTabPanelProps) {
  const [expandedMetricIds, setExpandedMetricIds] = useState<Set<number>>(new Set());
  // Tightened default filters for faster first load.
  const [periodType, setPeriodType] = useState("week");
  const [periodDate, setPeriodDate] = useState("");
  const [metricId, setMetricId] = useState<number | "">("");
  const [minSigma, setMinSigma] = useState<string | number>("");
  const [districtFilter, setDistrictFilter] = useState<DistrictFilterValue>(() => {
    if (selectedPlaceId != null) return `place:${selectedPlaceId}`;
    return initialDistrict == null || initialDistrict === 0
      ? "citywide"
      : String(initialDistrict);
  });
  // Group filter: "" = All, or "groupField|groupValue" when a single metric with groups is selected
  const [groupFilter, setGroupFilter] = useState("");

  const toggleMetricExpanded = useCallback((mid: number) => {
    setExpandedMetricIds((prev) => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
      return next;
    });
  }, []);

  // Available period dates for the selected period type (only when a type is selected)
  const { data: periodsData } = useAvailablePeriods(
    periodType,
    cityId,
    initialDistrict ?? undefined,
    30
  );
  const availablePeriods = periodType ? periodsData?.periods ?? [] : [];
  const { data: placeTypesData } = useAnomalyPlaceTypes(cityId);
  const anomalyPlaceTypes = placeTypesData?.place_types ?? [];
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  // Keep district filter in sync with the global selector defaults from parent.
  useEffect(() => {
    if (selectedPlaceId != null) {
      setDistrictFilter(`place:${selectedPlaceId}`);
      return;
    }
    setDistrictFilter(
      initialDistrict == null || initialDistrict === 0
        ? "citywide"
        : String(initialDistrict)
    );
  }, [initialDistrict, selectedPlaceId]);

  // Keep period date unchanged unless user explicitly picks one.

  // Determine district parameter to send to backend
  const apiDistrict: number | undefined = useMemo(() => {
    if (
      districtFilter === "all" ||
      districtFilter === "any_district" ||
      districtFilter.startsWith("place:") ||
      districtFilter.startsWith(GROUP_PREFIX)
    ) {
      return undefined;
    }
    if (districtFilter === "citywide") return 0;
    const n = parseInt(districtFilter, 10);
    return Number.isNaN(n) ? undefined : n;
  }, [districtFilter]);

  const selectedPlaceFilterId = useMemo(() => {
    if (!districtFilter.startsWith("place:")) return null;
    const id = parseInt(districtFilter.replace("place:", ""), 10);
    return Number.isNaN(id) ? null : id;
  }, [districtFilter]);

  // Group/place filter for API: from Location selector (group:field|value) or from metric Group dropdown
  const locationGroupParts = useMemo(() => {
    if (!districtFilter.startsWith(GROUP_PREFIX)) return null;
    const rest = districtFilter.slice(GROUP_PREFIX.length);
    const pipe = rest.indexOf("|");
    if (pipe === -1) return null;
    return { field: rest.slice(0, pipe), value: rest.slice(pipe + 1) };
  }, [districtFilter]);
  const groupFilterParts = groupFilter ? groupFilter.split("|") : [];
  const apiGroupField =
    locationGroupParts?.field ??
    (groupFilterParts.length === 2 ? groupFilterParts[0] : undefined);
  const apiGroupValue =
    locationGroupParts?.value ??
    (groupFilterParts.length === 2 ? groupFilterParts[1] : undefined);

  // Fetch anomalies with backend filters
  const { data: anomaliesData, isLoading, error } = useCityAnomalies(cityId, {
    is_anomaly: true,
    // In "any district" mode, fetch a larger window before client-side filtering
    // so district-only results are less likely to be filtered to empty.
    limit: districtFilter === "any_district" ? 150 : 50,
    period_type: periodType || undefined,
    period_date: periodDate || undefined,
    metric_id: metricId === "" ? undefined : (metricId as number),
    district: Number.isNaN(apiDistrict) ? undefined : apiDistrict,
    group_field: apiGroupField,
    group_value: apiGroupValue,
  });
  const [placeAnomaliesData, setPlaceAnomaliesData] = useState<PlaceAnomaly[]>([]);
  const [placeAnomaliesLoading, setPlaceAnomaliesLoading] = useState(false);
  const [placeAnomaliesError, setPlaceAnomaliesError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPlaceFilterId == null) {
      setPlaceAnomaliesData([]);
      setPlaceAnomaliesError(null);
      return;
    }
    if (!isAuthenticated) {
      setPlaceAnomaliesData([]);
      setPlaceAnomaliesError("Sign in required for place anomalies");
      return;
    }
    let cancelled = false;
    setPlaceAnomaliesLoading(true);
    setPlaceAnomaliesError(null);
    getAccessTokenSilently()
      .then((token) => getPlaceAnomalies(selectedPlaceFilterId, token))
      .then((res) => {
        if (!cancelled) setPlaceAnomaliesData(res?.anomalies ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setPlaceAnomaliesData([]);
          setPlaceAnomaliesError(err instanceof Error ? err.message : "Failed to load place anomalies");
        }
      })
      .finally(() => {
        if (!cancelled) setPlaceAnomaliesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPlaceFilterId, isAuthenticated, getAccessTokenSilently]);

  // Group options for the selected metric: only when one metric is selected and results have group_field/group_value.
  // Cache in a ref so when user filters by group we still show the full list in the dropdown.
  const groupOptionsCacheRef = useRef<{ value: string; label: string }[]>([]);
  const groupOptions = useMemo(() => {
    if (metricId === "" || !anomaliesData?.results) {
      if (metricId === "") groupOptionsCacheRef.current = [];
      return groupOptionsCacheRef.current;
    }
    const resultsForMetric = anomaliesData.results.filter(
      (r) => r.metric_id === metricId && r.group_field && r.group_value
    );
    const set = new Set<string>();
    for (const r of resultsForMetric) {
      set.add(`${r.group_field}|${r.group_value}`);
    }
    const list = Array.from(set).sort();
    const options = list.map((key) => {
      const [f, v] = key.split("|");
      return { value: key, label: `${f}: ${v}` };
    });
    // Only update cache when not filtering by group (so we have the full list)
    if (options.length > 0 && !groupFilter) {
      groupOptionsCacheRef.current = options;
    }
    return groupOptionsCacheRef.current.length > 0
      ? groupOptionsCacheRef.current
      : options;
  }, [metricId, groupFilter, anomaliesData?.results]);

  const showGroupFilter = metricId !== "" && groupOptions.length > 0;

  // When metric changes, clear group filter and cached options for the new metric
  useEffect(() => {
    setGroupFilter("");
    groupOptionsCacheRef.current = [];
  }, [metricId]);

  // Extract unique districts from data to populate the dropdown.
  // Cache them in a ref so they persist when the user selects a specific district
  // (which would otherwise narrow the data and lose the other options).
  const districtsCacheRef = useRef<number[]>([]);
  const rawDistricts = useMemo(() => {
    const results = anomaliesData?.results ?? [];
    const set = new Set<number>();
    for (const r of results) {
      if (r.district != null) set.add(r.district);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [anomaliesData?.results]);

  if (districtFilter === "all" && rawDistricts.length > 0) {
    districtsCacheRef.current = rawDistricts;
  }
  const knownDistricts =
    districtFilter === "all" ? rawDistricts : districtsCacheRef.current;
  const specificDistricts = knownDistricts.filter((d) => d !== 0);
  const metricNameById = useMemo(() => {
    const m = new Map<number, string>();
    metrics.forEach((metric) => m.set(metric.id, metric.metric_name));
    return m;
  }, [metrics]);
  const normalizedPlaceAnomalies = useMemo<AnomalyResult[]>(() => {
    return placeAnomaliesData.map((a) => ({
      id: a.id,
      run_id: 0,
      metric_id: a.metric_id,
      object_id: a.object_id,
      object_name: a.object_name,
      period_type: a.period_type,
      district: null,
      recent_mean: a.recent_mean,
      comparison_mean: a.comparison_mean,
      stddev: a.stddev,
      difference: a.difference,
      pct_change: a.pct_change,
      is_anomaly: a.is_anomaly,
      chart_payload: a.chart_payload as Record<string, any> | null,
      created_at: a.created_at,
      metric_name: metricNameById.get(a.metric_id) || `Metric ${a.metric_id}`,
      group_field: null,
      group_value: null,
      greendirection: "down",
      category: null,
      item_noun: "items",
    } as unknown as AnomalyResult));
  }, [placeAnomaliesData, metricNameById]);

  // Client-side filters: minimum sigma + "any district" (excludes citywide)
  const filteredAnomalies = useMemo(() => {
    let list =
      selectedPlaceFilterId != null ? normalizedPlaceAnomalies : (anomaliesData?.results ?? []);
    if (districtFilter === "any_district") {
      list = list.filter((a) => a.district != null && a.district !== 0);
    }
    if (metricId !== "") {
      list = list.filter((a) => a.metric_id === metricId);
    }
    if (minSigma !== "" && minSigma !== undefined) {
      const threshold = typeof minSigma === "string" ? parseFloat(minSigma) : minSigma;
      if (!Number.isNaN(threshold)) list = list.filter((a) => getSigma(a) >= threshold);
    }
    return list;
  }, [
    selectedPlaceFilterId,
    normalizedPlaceAnomalies,
    anomaliesData?.results,
    minSigma,
    districtFilter,
    metricId,
  ]);

  // Group by metric_id; each group keeps API order (first = top rated)
  const anomaliesByMetric = useMemo(() => {
    const map = new Map<number, AnomalyResult[]>();
    for (const a of filteredAnomalies) {
      const mid = a.metric_id;
      if (!map.has(mid)) map.set(mid, []);
      map.get(mid)!.push(a);
    }
    return Array.from(map.entries()).map(([metricId, list]) => ({ metricId, anomalies: list }));
  }, [filteredAnomalies]);

  // When period type changes, clear period date so we don't keep an invalid date
  const handlePeriodTypeChange = (value: string) => {
    setPeriodType(value);
    setPeriodDate("");
  };

  return (
    <div className={styles.container}>
      {!hideSectionTitle && (
        <div className={styles.header}>
          <h2 className={styles.title}>
            <i className="fas fa-bell" style={{ marginRight: "8px" }} />
            Anomaly Alerts
          </h2>
        </div>
      )}

      <div className={styles.filtersBar}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="anomaly-period-type">
            Period type
          </label>
          <select
            id="anomaly-period-type"
            className={styles.filterSelect}
            value={periodType}
            onChange={(e) => handlePeriodTypeChange(e.target.value)}
            aria-label="Filter by period type"
          >
            {PERIOD_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="anomaly-period-date">
            Period date
          </label>
          <select
            id="anomaly-period-date"
            className={styles.filterSelect}
            value={periodDate}
            onChange={(e) => setPeriodDate(e.target.value)}
            disabled={!periodType}
            aria-label="Filter by period date"
          >
            <option value="">All</option>
            {availablePeriods.map((p) => (
              <option key={p.period_date} value={p.period_date}>
                {p.period_label} ({p.anomaly_count})
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="anomaly-location">
            Location
          </label>
          <select
            id="anomaly-location"
            className={styles.filterSelect}
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            aria-label="Filter by location"
          >
            <option value="all">All</option>
            <option value="citywide">Citywide</option>
            {specificDistricts.length > 0 && (
              <option value="any_district">Any district</option>
            )}
            {specificDistricts.map((d) => (
              <option key={d} value={String(d)}>
                District {d}
              </option>
            ))}
            {anomalyPlaceTypes.map((pt, idx) => (
              <optgroup key={`${pt.group_field}-${idx}`} label={pt.label}>
                {pt.places.map((place) => (
                  <option
                    key={`${pt.group_field}-${idx}-${place}`}
                    value={`${GROUP_PREFIX}${pt.group_field}|${place}`}
                  >
                    {place}
                  </option>
                ))}
              </optgroup>
            ))}
            {userPlaces.map((p) => (
              <option key={`place-${p.id}`} value={`place:${p.id}`}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="anomaly-metric">
            Metric
          </label>
          <select
            id="anomaly-metric"
            className={styles.filterSelect}
            value={metricId === "" ? "" : metricId}
            onChange={(e) => setMetricId(e.target.value === "" ? "" : Number(e.target.value))}
            aria-label="Filter by metric"
          >
            <option value="">All metrics</option>
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.metric_name}
              </option>
            ))}
          </select>
        </div>
        {showGroupFilter && (
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="anomaly-group">
              Group
            </label>
            <select
              id="anomaly-group"
              className={styles.filterSelect}
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              aria-label="Filter by group"
            >
              <option value="">All</option>
              {groupOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="anomaly-min-sigma">
            Min sigma
          </label>
          <select
            id="anomaly-min-sigma"
            className={styles.filterSelect}
            value={minSigma === "" ? "" : String(minSigma)}
            onChange={(e) =>
              setMinSigma(e.target.value === "" ? "" : parseFloat(e.target.value))
            }
            aria-label="Filter by minimum sigma"
          >
            {MIN_SIGMA_OPTIONS.map((opt) => (
              <option key={opt.value === "" ? "all" : opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.content}>
        {(isLoading || placeAnomaliesLoading) && (
          <div className={styles.loadingContainer}>
            <Loader size="md" color="dark" />
            <span className="tc-loading-state">Loading anomalies…</span>
          </div>
        )}

        {(error || placeAnomaliesError) && !isLoading && !placeAnomaliesLoading && (
          <div className={styles.errorContainer}>
            <i className="fas fa-exclamation-triangle" />
            <span>
              Failed to load anomalies:{" "}
              {placeAnomaliesError || (error instanceof Error ? error.message : "Unknown error")}
            </span>
          </div>
        )}

        {!isLoading && !placeAnomaliesLoading && !error && !placeAnomaliesError && filteredAnomalies.length === 0 && (
          <div className={styles.emptyContainer}>
            <i className="fas fa-check-circle" />
            <span>No significant anomalies detected</span>
            <p className={styles.emptySubtext}>
              Anomalies are detected when data significantly deviates from historical patterns.
            </p>
          </div>
        )}

        {!isLoading && !placeAnomaliesLoading && !error && !placeAnomaliesError && anomaliesByMetric.length > 0 && (
          <div className={styles.anomaliesList}>
            {anomaliesByMetric.map(({ metricId: mid, anomalies: groupAnomalies }) => {
              const [top, ...rest] = groupAnomalies;
              const isExpanded = expandedMetricIds.has(mid);
              const hasMore = rest.length > 0;

              return (
                <div key={mid} className={styles.anomalyGroup}>
                  {/* Top (highest-rated) anomaly for this metric — links to full details */}
                  {top.id != null && (
                    <AnomalyCard
                      anomaly={top}
                      cityName={cityName}
                      initialDistrict={initialDistrict}
                      onMetricClick={onMetricClick}
                      slugify={slugify}
                      getAnomalyDisplayInfo={getAnomalyDisplayInfo}
                      formatPeriodTypeLabel={formatPeriodTypeLabel}
                    />
                  )}
                  {/* Expand/collapse toggle for more alerts in this metric */}
                  {hasMore && (
                    <button
                      type="button"
                      className={styles.expandToggle}
                      onClick={() => toggleMetricExpanded(mid)}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Collapse ${rest.length} more alerts` : `Show ${rest.length} more alerts`}
                    >
                      <i className={`fas fa-chevron-${isExpanded ? "up" : "down"}`} />
                      <span>
                        {isExpanded ? "Collapse" : "Show"} {rest.length} more alert{rest.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                  )}
                  {/* Rest of anomalies for this metric (when expanded) */}
                  {hasMore && isExpanded && (
                    <div className={styles.anomalyGroupMore}>
                      {rest.map((anomaly, idx) =>
                        anomaly.id != null ? (
                          <AnomalyCard
                            key={`${anomaly.id}-${idx}`}
                            anomaly={anomaly}
                            cityName={cityName}
                            initialDistrict={initialDistrict}
                            onMetricClick={onMetricClick}
                            slugify={slugify}
                            getAnomalyDisplayInfo={getAnomalyDisplayInfo}
                            formatPeriodTypeLabel={formatPeriodTypeLabel}
                          />
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
