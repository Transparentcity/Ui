"use client";

import React from "react";
import { useAuth0 } from "@auth0/auth0-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listCities,
  CityListItem,
  StructureMetricsLastRunSummary,
  loadCityData,
  determinePortalTypes,
  batchAnalyzeCities,
  startStructureMetricsBatch,
  getStructureMetricsLastRuns,
  getCityDataDashboardStats,
  getSavedCities,
  saveCity,
  unsaveCity,
  deleteCity,
  getCityStats,
  refreshAllAcs,
} from "@/lib/apiClient";
import { portalMatchStatusLabel, portalPlatformLabel } from "@/lib/portalPlatformLabel";
import { emitSavedCitiesChanged } from "@/lib/uiEvents";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import Loader from "./Loader";
import PortalReviewModal from "./PortalReviewModal";
import styles from "./CityDataTable.module.css";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const ScheduleHealthDashboard = dynamic(() => import("./ScheduleHealthDashboard"), {
  ssr: false,
  loading: () => (
    <div className={styles.loadingContainer}>
      <Loader size="sm" color="dark" />
      <span>Loading city health…</span>
    </div>
  ),
});

interface CityDataTableProps {
  onOpenCity?: (cityId: number) => void;
  /** When set (e.g. from dashboard shell), opens job logs view with the given job. */
  onViewJob?: (jobId: string) => void;
}

interface CityStats {
  totalCountriesCount: number;
  totalCitiesCount: number;
  totalPopulation: number;
  citiesWithPortalsCount: number;
  totalDatasetsCount: number;
  worldwidePopCoveredByData: number;
  usCountriesCount: number;
  usCitiesCount: number;
  usPopulation: number;
  usCitiesWithPortalsCount: number;
  usDatasetsCount: number;
  usPopCoveredByData: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  Socrata: "#3b82f6",
  ArcGIS: "#10b981",
  CKAN: "#8b5cf6",
  "Data.gov": "#f59e0b",
  "DCAT-AP": "#ec4899",
  Opendatasoft: "#06b6d4",
  Junar: "#f97316",
  Unknown: "#9ca3af",
  None: "#d4d4d8",
};
const FALLBACK_COLORS = [
  "#14b8a6", "#a855f7", "#eab308", "#ef4444", "#22d3ee", "#84cc16",
];

function classifyPlatform(city: CityListItem): string {
  const type = city.portal_type;
  if (type && type !== "unknown") {
    if (type === "socrata") return "Socrata";
    if (type === "arcgis" || type === "arcgis_hub_v3") return "ArcGIS";
    if (type === "ckan") return "CKAN";
    if (type === "data_json" || type === "data.gov") return "Data.gov";
    if (type === "dcat_ap") return "DCAT-AP";
    if (type === "opendatasoft") return "Opendatasoft";
    if (type === "junar") return "Junar";
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
  }
  if (
    type === "unknown" ||
    city.main_portal_url ||
    (city.all_portal_urls && city.all_portal_urls.length > 0)
  ) {
    return "Unknown";
  }
  return "None";
}

function getPlatformColor(name: string, idx: number): string {
  return PLATFORM_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

function PlatformPie({
  title,
  subtitle,
  data,
  formatValue,
}: {
  title: string;
  subtitle: string;
  data: Array<{ name: string; value: number }>;
  formatValue: (v: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "8px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600 }}>{title}</div>
        <div style={{ marginTop: "4px", fontSize: "11px" }}>No data</div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: "2px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{subtitle}</div>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={52}
            innerRadius={20}
            paddingAngle={1}
          >
            {data.map((entry, idx) => (
              <Cell key={entry.name} fill={getPlatformColor(entry.name, idx)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => {
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
              return [`${formatValue(value)} (${pct}%)`, name];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "3px 8px",
          fontSize: "10px",
          marginTop: "2px",
        }}
      >
        {data.map((entry, idx) => {
          const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0";
          return (
            <span
              key={entry.name}
              style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: getPlatformColor(entry.name, idx),
                  flexShrink: 0,
                }}
              />
              <span>
                {entry.name}: {formatValue(entry.value)} ({pct}%)
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function CityDataTable({ onOpenCity, onViewJob }: CityDataTableProps) {
  const { getAccessTokenSilently } = useAuth0();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cities, setCities] = useState<CityListItem[]>([]);
  const [savedCityIds, setSavedCityIds] = useState<Set<number>>(
    () => new Set()
  );
  const [savingCityIds, setSavingCityIds] = useState<Set<number>>(
    () => new Set()
  );
  const [selectedCityIds, setSelectedCityIds] = useState<number[]>([]);
  const [citySearchQuery, setCitySearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("United States");
  const [showOnlyPortals, setShowOnlyPortals] = useState(false);
  const [showOnlyInstantiated, setShowOnlyInstantiated] = useState(false);
  const [showAddCityForm, setShowAddCityForm] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [determiningPortalTypes, setDeterminingPortalTypes] = useState(false);
  const [structuringCities, setStructuringCities] = useState(false);
  const [portalReviewCity, setPortalReviewCity] = useState<CityListItem | null>(null);
  const [vectorStatsLoadingCityIds, setVectorStatsLoadingCityIds] = useState<
    Set<number>
  >(() => new Set());
  const [vectorStatsErrorCityIds, setVectorStatsErrorCityIds] = useState<
    Set<number>
  >(() => new Set());
  const [refreshAcsLoading, setRefreshAcsLoading] = useState(false);
  const [showStructureMetricsModal, setShowStructureMetricsModal] = useState(false);
  const [structuringMetrics, setStructuringMetrics] = useState(false);
  const [lastRunsByCityId, setLastRunsByCityId] = useState<Record<string, StructureMetricsLastRunSummary>>({});
  const [activeTab, setActiveTab] = useState<"city-list" | "city-health">("city-list");
  const [platformChartsOpen, setPlatformChartsOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"state" | "population">("state");
  const [dashboardStats, setDashboardStats] = useState<{
    total_metrics: number;
    cities_with_metrics_count: number;
  } | null>(null);
  const [dashboardStatsLoading, setDashboardStatsLoading] = useState(false);
  const [refreshAcsResult, setRefreshAcsResult] = useState<{
    refreshed_count: number;
    error_count: number;
    refreshed?: Array<{ city_name?: string; rows_written?: number }>;
    errors?: Array<{ city_name?: string; city_id?: number; error: string }>;
  } | null>(null);
  const [cityToDelete, setCityToDelete] = useState<CityListItem | null>(null);
  const [deletingCityId, setDeletingCityId] = useState<number | null>(null);

  useEffect(() => {
    loadCities();
  }, []);

  const cityIdsForLastRuns = useMemo(() => cities.map((c) => c.city_id), [cities]);
  useEffect(() => {
    if (cityIdsForLastRuns.length === 0) {
      setLastRunsByCityId({});
      return;
    }
    getAccessTokenSilently()
      .then((token) => getStructureMetricsLastRuns(cityIdsForLastRuns, token))
      .then(setLastRunsByCityId)
      .catch(() => setLastRunsByCityId({}));
  }, [cityIdsForLastRuns.join(",")]);

  useEffect(() => {
    if (activeTab !== "city-health") return;
    setDashboardStatsLoading(true);
    getAccessTokenSilently()
      .then((token) => getCityDataDashboardStats(token))
      .then(setDashboardStats)
      .catch(() => setDashboardStats(null))
      .finally(() => setDashboardStatsLoading(false));
  }, [activeTab, getAccessTokenSilently]);

  const handleViewJob = useCallback(
    (jobId: string) => {
      if (onViewJob) {
        onViewJob(jobId);
        return;
      }
      const base = pathname || "/home";
      const q = new URLSearchParams({ tab: "logs", job_id: jobId });
      router.push(`${base}?${q.toString()}`);
    },
    [onViewJob, pathname, router]
  );

  const loadCities = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();
      const [cityList, saved] = await Promise.all([
        listCities(token, undefined, undefined, true),
        getSavedCities(token).catch(() => []),
      ]);
      setCities(cityList);
      setSavedCityIds(new Set(saved.map((c) => c.id)));
    } catch (err: any) {
      setError(err.message || "Failed to load cities");
      console.error("Error loading cities:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSavedCity = async (cityId: number) => {
    if (savingCityIds.has(cityId)) return;

    const wasSaved = savedCityIds.has(cityId);

    // Optimistic UI update
    setSavingCityIds((prev) => {
      const next = new Set(prev);
      next.add(cityId);
      return next;
    });
    setSavedCityIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) {
        next.delete(cityId);
      } else {
        next.add(cityId);
      }
      return next;
    });

    try {
      const token = await getAccessTokenSilently();
      if (wasSaved) {
        await unsaveCity(cityId, token);
      } else {
        await saveCity(cityId, token);
      }
      emitSavedCitiesChanged();
    } catch (err: any) {
      console.error("Error toggling saved city:", err);
      // Revert optimistic update
      setSavedCityIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) {
          next.add(cityId);
        } else {
          next.delete(cityId);
        }
        return next;
      });
      alert("Failed to update saved status. Please try again.");
    } finally {
      setSavingCityIds((prev) => {
        const next = new Set(prev);
        next.delete(cityId);
        return next;
      });
    }
  };

  const handleConfirmDeleteCity = async () => {
    if (!cityToDelete) return;
    const id = cityToDelete.city_id;
    setDeletingCityId(id);
    try {
      const token = await getAccessTokenSilently();
      await deleteCity(id, token);
      setCityToDelete(null);
      setSavedCityIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      emitSavedCitiesChanged();
      await loadCities();
    } catch (err) {
      console.error("Error deleting city:", err);
      alert(err instanceof Error ? err.message : "Failed to delete city. Please try again.");
    } finally {
      setDeletingCityId(null);
    }
  };

  const stats = useMemo<CityStats>(() => {
    const usCities = cities.filter((c) => c.country === "United States");
    const citiesWithPortals = cities.filter((c) => hasPortal(c));

    return {
      totalCountriesCount: new Set(cities.map((c) => c.country).filter(Boolean)).size,
      totalCitiesCount: cities.length,
      totalPopulation: cities.reduce((sum, c) => sum + parsePopulation(c.population || 0), 0),
      citiesWithPortalsCount: citiesWithPortals.length,
      totalDatasetsCount: cities.reduce((sum, c) => sum + (c.datasets_count || 0), 0),
      worldwidePopCoveredByData: citiesWithPortals.reduce(
        (sum, c) => sum + parsePopulation(c.population || 0),
        0
      ),
      usCountriesCount: 1,
      usCitiesCount: usCities.length,
      usPopulation: usCities.reduce((sum, c) => sum + parsePopulation(c.population || 0), 0),
      usCitiesWithPortalsCount: usCities.filter((c) => hasPortal(c)).length,
      usDatasetsCount: usCities.reduce((sum, c) => sum + (c.datasets_count || 0), 0),
      usPopCoveredByData: usCities
        .filter((c) => hasPortal(c))
        .reduce((sum, c) => sum + parsePopulation(c.population || 0), 0),
    };
  }, [cities]);

  const platformCharts = useMemo(() => {
    const usCities = cities.filter((c) => c.country === "United States");
    function aggregate(list: CityListItem[]) {
      const countMap: Record<string, number> = {};
      const popMap: Record<string, number> = {};
      for (const c of list) {
        const p = classifyPlatform(c);
        countMap[p] = (countMap[p] || 0) + 1;
        popMap[p] = (popMap[p] || 0) + parsePopulation(c.population || 0);
      }
      const toArr = (m: Record<string, number>) =>
        Object.entries(m)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);
      return { count: toArr(countMap), population: toArr(popMap) };
    }
    return { us: aggregate(usCities), worldwide: aggregate(cities) };
  }, [cities]);

  const filteredCities = useMemo(() => {
    let filtered = [...cities];

    if (showOnlyPortals) {
      filtered = filtered.filter((c) => hasPortal(c));
    }

    if (showOnlyInstantiated) {
      filtered = filtered.filter((c) => (c.template_metrics_instantiated ?? 0) > 0);
    }

    if (countryFilter) {
      filtered = filtered.filter((c) => c.country === countryFilter);
    }

    if (citySearchQuery) {
      const query = citySearchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.city_name?.toLowerCase().includes(query) ||
          c.state?.toLowerCase().includes(query) ||
          c.country?.toLowerCase().includes(query)
      );
    }

    if (sortBy === "population") {
      filtered.sort((a, b) => {
        const popA = parsePopulation(a.population || 0);
        const popB = parsePopulation(b.population || 0);
        if (popB > popA) return 1;
        if (popB < popA) return -1;
        return (a.city_name || "").localeCompare(b.city_name || "");
      });
    } else {
      // Sort by state, then population
      filtered.sort((a, b) => {
        const stateA = (a.state || "").toLowerCase();
        const stateB = (b.state || "").toLowerCase();
        if (stateA < stateB) return -1;
        if (stateA > stateB) return 1;

        const popA = parsePopulation(a.population || 0);
        const popB = parsePopulation(b.population || 0);
        if (popA > popB) return -1;
        if (popA < popB) return 1;

        return (a.city_name || "").localeCompare(b.city_name || "");
      });
    }

    return filtered;
  }, [cities, showOnlyPortals, showOnlyInstantiated, countryFilter, citySearchQuery, sortBy]);

  const citiesByState = useMemo(() => {
    const groups: Record<string, CityListItem[]> = {};
    filteredCities.forEach((city) => {
      const state = city.state || "Unknown State";
      if (!groups[state]) {
        groups[state] = [];
      }
      groups[state].push(city);
    });

    return Object.keys(groups)
      .sort((a, b) => {
        if (a === "Unknown State") return 1;
        if (b === "Unknown State") return -1;
        return a.localeCompare(b);
      })
      .map((state) => ({
        state,
        cities: groups[state],
      }));
  }, [filteredCities]);

  const allCitiesSelected = useMemo(() => {
    return filteredCities.length > 0 && selectedCityIds.length === filteredCities.length;
  }, [filteredCities, selectedCityIds]);

  const toggleAllCities = () => {
    if (allCitiesSelected) {
      setSelectedCityIds([]);
    } else {
      setSelectedCityIds(filteredCities.map((c) => c.city_id));
    }
  };

  const toggleCitySelection = (cityId: number, checked: boolean) => {
    if (checked) {
      setSelectedCityIds([...selectedCityIds, cityId]);
    } else {
      setSelectedCityIds(selectedCityIds.filter((id) => id !== cityId));
    }
  };

  const selectAllCities = () => {
    setSelectedCityIds(filteredCities.map((c) => c.city_id));
  };

  const selectAllCitiesWithPortals = () => {
    setSelectedCityIds(filteredCities.filter((c) => hasPortal(c)).map((c) => c.city_id));
  };

  const clearSelectedCities = () => {
    setSelectedCityIds([]);
  };

  const handleLoadMetadata = async () => {
    if (selectedCityIds.length === 0) return;

    if (
      !confirm(
        `Re-load URLs, metadata, and search index for ${selectedCityIds.length} selected cities?\n\n` +
          "This removes existing dataset rows and Qdrant vectors for those cities, then re-fetches and re-indexes."
      )
    ) {
      return;
    }

    try {
      setLoadingData(true);
      const token = await getAccessTokenSilently();
      const result = await loadCityData(
        {
          city_ids: selectedCityIds,
          fetch_urls: true,
          fetch_metadata: true,
          refresh: true,
        },
        token
      );
      notifyJobCreated(result.job_id);
      alert(`Metadata loading started! Job ID: ${result.job_id}\n\nYou can monitor progress in the jobs badge at the top of the page.`);
      clearSelectedCities();
      setTimeout(() => loadCities(), 2000);
    } catch (err: any) {
      alert("Failed to load metadata: " + err.message);
    } finally {
      setLoadingData(false);
    }
  };

  const handleDeterminePortalTypes = async () => {
    if (selectedCityIds.length === 0) return;

    try {
      setDeterminingPortalTypes(true);
      const token = await getAccessTokenSilently();
      const result = await determinePortalTypes(selectedCityIds, token);
      notifyJobCreated(result.job_id);
      alert(
        `Portal type job started for ${selectedCityIds.length} cities (job ${result.job_id}).\n\n` +
          `Open the Jobs panel to watch progress. When it completes, Status will summarize how many ` +
          `cities got a portal type; the Result section lists counts and any errors.\n\n` +
          `This does not load or save catalog datasets—only platform detection.`
      );
      clearSelectedCities();
      setTimeout(() => loadCities(), 2000);
    } catch (err: any) {
      alert("Failed to determine portal types: " + (err as Error).message);
    } finally {
      setDeterminingPortalTypes(false);
    }
  };

  const handleStructureCities = async () => {
    if (selectedCityIds.length === 0) return;

    try {
      setStructuringCities(true);
      const token = await getAccessTokenSilently();
      const result = await batchAnalyzeCities(
        {
          city_ids: selectedCityIds,
        },
        token
      );
      notifyJobCreated(result.job_id);
      alert(`City structuring started! Job ID: ${result.job_id}\n\nYou can monitor progress in the jobs badge at the top of the page.`);
      clearSelectedCities();
      setTimeout(() => loadCities(), 2000);
    } catch (err: any) {
      alert("Failed to structure cities: " + err.message);
    } finally {
      setStructuringCities(false);
    }
  };

  const handleStructureMetrics = async (onlyMissing: boolean) => {
    if (selectedCityIds.length === 0) return;
    setShowStructureMetricsModal(false);
    try {
      setStructuringMetrics(true);
      const token = await getAccessTokenSilently();
      const result = await startStructureMetricsBatch(
        { city_ids: selectedCityIds, only_missing: onlyMissing },
        token
      );
      notifyJobCreated(result.job_id);
      alert(`Structure metrics job started. Track progress in the Jobs panel.`);
      clearSelectedCities();
      setTimeout(() => loadCities(), 2000);
    } catch (err: any) {
      alert("Failed to start structure metrics: " + err.message);
    } finally {
      setStructuringMetrics(false);
    }
  };

  const handleRefreshAcs = async () => {
    const cityIds = selectedCityIds.length > 0 ? selectedCityIds : undefined;
    const message = cityIds
      ? `Refresh population from Census ACS for ${cityIds.length} selected city(ies)? Cities without GEOID will be looked up automatically.`
      : "Refresh population from Census ACS for all cities? Cities without GEOID will be looked up automatically. This may take a few minutes.";
    if (!confirm(message)) return;
    setRefreshAcsResult(null);
    setRefreshAcsLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const result = await refreshAllAcs(token, {
        sync_to_metric_after: true,
        city_ids: cityIds,
      });
      setRefreshAcsResult({
        refreshed_count: result.refreshed_count,
        error_count: result.error_count,
        refreshed: result.refreshed,
        errors: result.errors,
      });
      // Always reload cities so population and source info reflect latest state
      loadCities();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRefreshAcsResult({
        refreshed_count: 0,
        error_count: 1,
        errors: [{ city_id: 0, error: msg }],
      });
    } finally {
      setRefreshAcsLoading(false);
    }
  };

  const loadVectorDbStats = async (cityId: number) => {
    const city = cities.find((c) => c.city_id === cityId);
    if (!city) return;

    // Match the legacy template behavior: only fetch if stats are unknown.
    if (city.vector_db_points !== null && city.vector_db_points !== undefined) {
      return;
    }

    if (vectorStatsLoadingCityIds.has(cityId)) return;

    setVectorStatsErrorCityIds((prev) => {
      const next = new Set(prev);
      next.delete(cityId);
      return next;
    });
    setVectorStatsLoadingCityIds((prev) => {
      const next = new Set(prev);
      next.add(cityId);
      return next;
    });

    try {
      const token = await getAccessTokenSilently();
      const stats = await getCityStats(cityId, token);

      const hasVectorError = !!stats.vector_db?.error;
      const pointCount = hasVectorError
        ? 0
        : (stats.vector_db?.point_count ?? 0);
      const sizeMb = hasVectorError ? 0 : (stats.vector_db?.size_mb ?? 0);

      setCities((prev) =>
        prev.map((c) =>
          c.city_id === cityId
            ? {
                ...c,
                vector_db_points: pointCount,
                vector_db_size_mb: sizeMb,
              }
            : c
        )
      );
    } catch (err) {
      console.error("Error loading vector DB stats:", err);
      setVectorStatsErrorCityIds((prev) => {
        const next = new Set(prev);
        next.add(cityId);
        return next;
      });
    } finally {
      setVectorStatsLoadingCityIds((prev) => {
        const next = new Set(prev);
        next.delete(cityId);
        return next;
      });
    }
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatTotalPopulation = (pop: number) => {
    if (pop >= 1000000000) {
      return (pop / 1000000000).toFixed(2).replace(/\.?0+$/, "") + "B";
    }
    if (pop >= 1000000) {
      return (pop / 1000000).toFixed(2).replace(/\.?0+$/, "") + "M";
    }
    if (pop >= 1000) {
      return (pop / 1000).toFixed(1).replace(/\.?0+$/, "") + "K";
    }
    return pop.toLocaleString();
  };

  const formatPopulation = (pop: number | string | null | undefined) => {
    if (!pop) return "—";
    const num = parsePopulation(pop);
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(2).replace(/\.?0+$/, "") + "B";
    }
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2).replace(/\.?0+$/, "") + "M";
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.?0+$/, "") + "K";
    }
    return num.toLocaleString();
  };

  const formatLastRunAt = (date: string | null | undefined) => {
    if (!date) return "Unknown";
    try {
      return new Date(date).toLocaleString();
    } catch {
      return "Invalid";
    }
  };

  const getStructRunStatusLabel = (
    run: StructureMetricsLastRunSummary | undefined
  ) => {
    if (!run) return "No recent run";
    if (run.success === true) return "Success";
    if (run.success === false) return "Failed";
    return "Unknown";
  };

  const getStructRunTooltip = (
    run: StructureMetricsLastRunSummary | undefined
  ) => {
    if (!run) return "No recent metrics structuring run";
    return `Last metrics run: ${getStructRunStatusLabel(run)}${
      run.last_run_at ? ` on ${formatLastRunAt(run.last_run_at)}` : ""
    }`;
  };

  const getStructIssueTooltip = (
    run: StructureMetricsLastRunSummary | undefined
  ) => {
    const issue = run?.errors?.[0] ?? run?.opportunities?.[0];
    return issue || "No recent structuring issue";
  };

  const getStateAbbreviation = (state: string | null | undefined) => {
    if (!state) return "—";
    if (state.length === 2 && state === state.toUpperCase()) return state;

    const stateMap: Record<string, string> = {
      Alabama: "AL",
      Alaska: "AK",
      Arizona: "AZ",
      Arkansas: "AR",
      California: "CA",
      Colorado: "CO",
      Connecticut: "CT",
      Delaware: "DE",
      "District of Columbia": "DC",
      Florida: "FL",
      Georgia: "GA",
      Hawaii: "HI",
      Idaho: "ID",
      Illinois: "IL",
      Indiana: "IN",
      Iowa: "IA",
      Kansas: "KS",
      Kentucky: "KY",
      Louisiana: "LA",
      Maine: "ME",
      Maryland: "MD",
      Massachusetts: "MA",
      Michigan: "MI",
      Minnesota: "MN",
      Mississippi: "MS",
      Missouri: "MO",
      Montana: "MT",
      Nebraska: "NE",
      Nevada: "NV",
      "New Hampshire": "NH",
      "New Jersey": "NJ",
      "New Mexico": "NM",
      "New York": "NY",
      "North Carolina": "NC",
      "North Dakota": "ND",
      Ohio: "OH",
      Oklahoma: "OK",
      Oregon: "OR",
      Pennsylvania: "PA",
      "Rhode Island": "RI",
      "South Carolina": "SC",
      "South Dakota": "SD",
      Tennessee: "TN",
      Texas: "TX",
      Utah: "UT",
      Vermont: "VT",
      Virginia: "VA",
      Washington: "WA",
      "West Virginia": "WV",
      Wisconsin: "WI",
      Wyoming: "WY",
    };

    return stateMap[state] || state;
  };

  const getCityAvatar = (city: CityListItem) => {
    const emoji = city.emoji?.trim();
    if (emoji) return emoji;

    const initial = city.city_name?.trim()?.charAt(0)?.toUpperCase();
    return initial || "🏙️";
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader size="sm" color="dark" />
        <span>Loading cities...</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Tabs: City list | City Health */}
      <div
        className={styles.tabBar}
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "16px",
          borderBottom: "1px solid var(--border-color, #e5e7eb)",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("city-list")}
          style={{
            padding: "10px 20px",
            border: "none",
            borderBottom: activeTab === "city-list" ? "2px solid var(--brand-primary)" : "2px solid transparent",
            background: "none",
            cursor: "pointer",
            fontWeight: activeTab === "city-list" ? 600 : 400,
            color: activeTab === "city-list" ? "var(--brand-primary)" : "var(--text-secondary)",
          }}
        >
          City list
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("city-health")}
          style={{
            padding: "10px 20px",
            border: "none",
            borderBottom: activeTab === "city-health" ? "2px solid var(--brand-primary)" : "2px solid transparent",
            background: "none",
            cursor: "pointer",
            fontWeight: activeTab === "city-health" ? 600 : 400,
            color: activeTab === "city-health" ? "var(--brand-primary)" : "var(--text-secondary)",
          }}
        >
          City Health
        </button>
      </div>

      {activeTab === "city-list" && (
        <>
      {/* Action Buttons */}
      <div className={styles.card}>
        <div className="city-actions-header" style={{ marginBottom: "12px" }}>
          <h3 className="city-actions-title" style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
            City Data Actions
          </h3>
          <p
            style={{
              margin: "10px 0 0 0",
              fontSize: "13px",
              color: "var(--text-secondary, #6b7280)",
              maxWidth: "52rem",
              lineHeight: 1.5,
            }}
          >
            <strong>Determine Portal Type</strong> runs a background job: optional portal discovery when
            the URL is missing, then a catalog API probe to set{" "}
            <code style={{ fontSize: "12px" }}>extra_metadata.portal_type</code>. The job stops after
            detecting the platform; it does <strong>not</strong> merge catalog rows into the database—use{" "}
            <strong>Load Metadata</strong> for that (full refresh: clears existing datasets and Qdrant for
            selected cities, then re-fetches and re-indexes). <strong>Refresh all from ACS</strong> is{" "}
            <em>not</em> a background job: it finishes in this page and shows counts below when done.
          </p>
        </div>
        <div
          className="city-actions-buttons"
          style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}
        >
          <button
            onClick={handleLoadMetadata}
            disabled={selectedCityIds.length === 0 || loadingData}
            className="btn btn-primary"
            style={{
              padding: "10px 20px",
              background: "var(--brand-primary)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: selectedCityIds.length === 0 || loadingData ? "not-allowed" : "pointer",
              opacity: selectedCityIds.length === 0 || loadingData ? 0.6 : 1,
            }}
          >
            {loadingData ? "Loading..." : `📥 Load Metadata (${selectedCityIds.length} cities)`}
          </button>
          <button
            onClick={handleDeterminePortalTypes}
            disabled={selectedCityIds.length === 0 || determiningPortalTypes}
            title="Background job: optional portal discovery if URL missing, then API probe for platform type only (no catalog merge into DB)."
            style={{
              padding: "10px 20px",
              background: "#7c3aed",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: selectedCityIds.length === 0 || determiningPortalTypes ? "not-allowed" : "pointer",
              opacity: selectedCityIds.length === 0 || determiningPortalTypes ? 0.6 : 1,
            }}
          >
            {determiningPortalTypes
              ? "Determining…"
              : `🏷️ Determine Portal Type (${selectedCityIds.length} cities)`}
          </button>
          <button
            onClick={handleStructureCities}
            disabled={selectedCityIds.length === 0 || structuringCities}
            className="btn btn-primary"
            style={{
              padding: "10px 20px",
              background: "var(--brand-primary)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: selectedCityIds.length === 0 || structuringCities ? "not-allowed" : "pointer",
              opacity: selectedCityIds.length === 0 || structuringCities ? 0.6 : 1,
            }}
          >
            {structuringCities
              ? "Structuring..."
              : `🏗️ Structure Selected Cities (${selectedCityIds.length} cities)`}
          </button>
          <button
            onClick={() => setShowStructureMetricsModal(true)}
            disabled={selectedCityIds.length === 0 || structuringMetrics}
            style={{
              padding: "10px 20px",
              background: "#6366f1",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: selectedCityIds.length === 0 || structuringMetrics ? "not-allowed" : "pointer",
              opacity: selectedCityIds.length === 0 || structuringMetrics ? 0.6 : 1,
            }}
          >
            {structuringMetrics ? "Starting…" : `📊 Structure metrics (${selectedCityIds.length} cities)`}
          </button>
          {showStructureMetricsModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
              onClick={() => setShowStructureMetricsModal(false)}
            >
              <div
                style={{
                  background: "var(--bg-primary, #fff)",
                  padding: "24px",
                  borderRadius: "8px",
                  maxWidth: "420px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <p style={{ margin: "0 0 16px", fontSize: "14px" }}>
                  Structure metrics for selected cities. Existing metrics will be kept; only missing templates will be instantiated.
                </p>
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setShowStructureMetricsModal(false)}
                    style={{ padding: "8px 16px", border: "1px solid #ccc", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStructureMetrics(false)}
                    style={{ padding: "8px 16px", background: "#eab308", color: "#000", border: "none", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Override: structure all templates
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStructureMetrics(true)}
                    style={{ padding: "8px 16px", background: "var(--brand-primary)", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}
          <button
            onClick={handleRefreshAcs}
            disabled={refreshAcsLoading}
            style={{
              padding: "10px 20px",
              background: "#059669",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: refreshAcsLoading ? "not-allowed" : "pointer",
              opacity: refreshAcsLoading ? 0.6 : 1,
            }}
          >
            {refreshAcsLoading
              ? "Refreshing…"
              : selectedCityIds.length > 0
                ? `📊 Refresh ACS (${selectedCityIds.length} selected)`
                : "📊 Refresh all from ACS"}
          </button>
          {refreshAcsResult && (
            <div
              style={{
                width: "100%",
                padding: "12px",
                marginTop: "8px",
                background: refreshAcsResult.error_count > 0 ? "#fef3c7" : "#d1fae5",
                color: refreshAcsResult.error_count > 0 ? "#92400e" : "#065f46",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            >
              <strong>ACS refresh finished</strong> (this request runs to completion here—not a background job).{" "}
              {refreshAcsResult.refreshed_count} city population value(s) updated from Census ACS;{" "}
              {refreshAcsResult.error_count} error(s).
              {refreshAcsResult.errors?.length
                ? ` Details: ${refreshAcsResult.errors.map((e) => `${e.city_name ?? e.city_id}: ${e.error}`).join("; ")}`
                : ""}
            </div>
          )}
          <button
            onClick={() => setShowAddCityForm(!showAddCityForm)}
            className="btn btn-success"
            style={{
              padding: "10px 20px",
              background: "var(--success)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            ➕ Add New City
          </button>
        </div>
      </div>

      {/* City List Card */}
      <div className={styles.card}>
        <div className="city-list-header" style={{ marginBottom: "16px" }}>
          <h3 className="city-list-title" style={{ margin: "0 0 16px 0", fontSize: "18px", fontWeight: 600 }}>
            Cities
          </h3>
          <div
            className="city-list-filters"
            style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}
          >
            <input
              type="text"
              value={citySearchQuery}
              onChange={(e) => setCitySearchQuery(e.target.value)}
              placeholder="Search cities..."
              className={styles.searchInput}
              style={{
                padding: "8px 12px",
                border: "1px solid var(--border-primary)",
                borderRadius: "6px",
                fontSize: "14px",
                flex: "1",
                minWidth: "200px",
              }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={countryFilter === "United States"}
                onChange={(e) => setCountryFilter(e.target.checked ? "United States" : "")}
              />
              <span>US Only</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={showOnlyPortals}
                onChange={(e) => setShowOnlyPortals(e.target.checked)}
              />
              <span>Has Portal</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={showOnlyInstantiated}
                onChange={(e) => setShowOnlyInstantiated(e.target.checked)}
              />
              <span>Has Instantiated Metrics</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "state" | "population")}
                style={{
                  padding: "6px 10px",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "6px",
                  fontSize: "13px",
                  background: "var(--bg-primary)",
                  cursor: "pointer",
                }}
              >
                <option value="state">State</option>
                <option value="population">Population</option>
              </select>
            </label>
          </div>
          <div
            className="city-list-actions"
            style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}
          >
            <button
              onClick={selectAllCities}
              className={styles.linkBtn}
              style={{
                background: "none",
                border: "none",
                color: "var(--brand-primary)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Select All
            </button>
            <button
              onClick={selectAllCitiesWithPortals}
              className={styles.linkBtn}
              style={{
                background: "none",
                border: "none",
                color: "var(--brand-primary)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Select All with Portals
            </button>
            <button
              onClick={clearSelectedCities}
              className={`${styles.linkBtn} ${styles.linkBtnDanger}` }
              style={{
                background: "none",
                border: "none",
                color: "var(--error)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Clear Selection
            </button>
            <button
              onClick={loadCities}
              className={styles.linkBtn}
              disabled={loading}
              style={{
                background: "none",
                border: "none",
                color: "var(--brand-primary)",
                cursor: loading ? "not-allowed" : "pointer",
                textDecoration: "underline",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "⏳ Loading..." : "🔄 Refresh Table"}
            </button>
          </div>
        </div>

        <div className={styles.tableContainer} style={{ overflowX: "auto" }}>
          <table className={styles.cityTable} style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className={styles.checkboxCol}
                  style={{ padding: "12px", textAlign: "left", width: "40px" }}
                >
                  <input
                    type="checkbox"
                    checked={allCitiesSelected}
                    onChange={toggleAllCities}
                  />
                </th>
                <th
                  rowSpan={2}
                  className={styles.nameCol}
                  style={{ padding: "12px", textAlign: "left" }}
                >
                  City Name
                </th>
                <th
                  colSpan={3}
                  style={{ padding: "12px 8px 6px", textAlign: "center" }}
                >
                  Metrics
                </th>
                <th
                  rowSpan={2}
                  className={styles.stateCol}
                  style={{ padding: "12px", textAlign: "left" }}
                >
                  State
                </th>
                <th
                  rowSpan={2}
                  className={styles.populationCol}
                  style={{ padding: "12px", textAlign: "left" }}
                >
                  Population
                </th>
                <th
                  rowSpan={2}
                  className={styles.popSourceCol}
                  style={{ padding: "12px", textAlign: "left" }}
                >
                  Pop source
                </th>
                <th
                  rowSpan={2}
                  className={styles.platformCol}
                  style={{ padding: "12px", textAlign: "left" }}
                >
                  Platform
                </th>
                <th
                  rowSpan={2}
                  style={{ padding: "12px", textAlign: "left", whiteSpace: "nowrap" }}
                  title="City structure analysis status: complete / partial / not started"
                >
                  Structure
                </th>
                <th
                  rowSpan={2}
                  className={styles.datasetsCol}
                  style={{ padding: "12px", textAlign: "left" }}
                >
                  Datasets
                </th>
                <th
                  rowSpan={2}
                  className={styles.vectorDbCol}
                  style={{ padding: "12px", textAlign: "left" }}
                >
                  Vector DB
                </th>
                <th
                  rowSpan={2}
                  className={styles.actionsCol}
                  style={{ padding: "12px", textAlign: "left", width: "56px" }}
                >
                  Actions
                </th>
              </tr>
              <tr>
                <th
                  style={{ padding: "6px 8px 12px", textAlign: "center", width: "52px" }}
                  title="Template metrics attempted"
                >
                  Att
                </th>
                <th
                  style={{ padding: "6px 8px 12px", textAlign: "center", width: "56px" }}
                  title="Template metrics instantiated"
                >
                  Inst
                </th>
                <th
                  style={{ padding: "6px 8px 12px", textAlign: "center", width: "56px" }}
                  title="Template metrics missing"
                >
                  Miss
                </th>
              </tr>
            </thead>
            <tbody>
              {sortBy === "population" ? (
                filteredCities.map((city) => {
                  const hasPortalUrl = hasPortal(city);
                  const portalUrl = city.main_portal_url || "";
                  const isSelected = selectedCityIds.includes(city.city_id);
                  const isSaved = savedCityIds.has(city.city_id);
                  const isSaving = savingCityIds.has(city.city_id);
                  const lastRun = lastRunsByCityId[String(city.city_id)];
                  const structIssue =
                    lastRun?.errors?.[0] ?? lastRun?.opportunities?.[0];

                  return (
                    <tr
                      key={city.city_id}
                      className={city.is_launched ? styles.launchedRow : undefined}
                      style={{ borderBottom: "1px solid var(--border-primary)" }}
                    >
                      <td className={styles.checkboxCol} style={{ padding: "12px" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleCitySelection(city.city_id, e.target.checked)}
                        />
                      </td>
                      <td className={styles.nameCol} style={{ padding: "12px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                          <button
                            type="button"
                            onClick={() => handleToggleSavedCity(city.city_id)}
                            disabled={isSaving}
                            title={isSaved ? "Remove from My Places" : "Save to My Places"}
                            aria-label={isSaved ? "Remove from My Places" : "Save to My Places"}
                            style={{
                              background: "transparent",
                              border: "none",
                              padding: "4px",
                              borderRadius: "6px",
                              cursor: isSaving ? "not-allowed" : "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              transition: "all 0.2s ease",
                              color: isSaved ? "#9333ea" : "var(--text-secondary, #6b7280)",
                              opacity: isSaving ? 0.6 : 1,
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                            </svg>
                          </button>
                          <div aria-hidden="true" style={{ width: "32px", height: "32px", borderRadius: "999px", background: "var(--bg-secondary, #f3f4f6)", border: "1px solid var(--border-primary, #e5e7eb)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: city.emoji ? "18px" : "13px", fontWeight: 700, flexShrink: 0 }} title={city.city_name || "City"}>
                            {getCityAvatar(city)}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <button
                              type="button"
                              className={`city-name${city.is_launched ? ` ${styles.launchedCityName}` : ""}`}
                              onClick={() => onOpenCity && onOpenCity(city.city_id)}
                              style={{ cursor: onOpenCity ? "pointer" : "default", background: "transparent", border: "none", padding: 0, margin: 0, textAlign: "left", ...(city.is_launched ? {} : { color: "var(--text-primary)" }), fontSize: "13px", fontWeight: 600 }}
                              title={city.is_launched ? "Launched — open city view" : "Open city view"}
                            >
                              {city.city_name || "—"}
                            </button>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "center", fontSize: "12px", fontWeight: 600 }} title="Template metrics attempted">{city.template_metrics_attempted ?? 0}</td>
                      <td style={{ padding: "12px 8px", textAlign: "center", fontSize: "12px", fontWeight: 600 }} title="Template metrics instantiated">
                        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                          <span>{city.template_metrics_instantiated ?? 0}</span>
                          {lastRun ? (<span aria-label={getStructRunTooltip(lastRun)} title={getStructRunTooltip(lastRun)} style={{ color: lastRun.success === false ? "var(--error, #dc2626)" : "var(--text-secondary, #6b7280)", fontSize: "11px", lineHeight: 1, cursor: "help" }}>i</span>) : null}
                        </div>
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "center", fontSize: "12px", fontWeight: 600 }} title="Template metrics missing">
                        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                          <span>{city.template_metrics_missing ?? 0}</span>
                          {structIssue ? (<span aria-label={getStructIssueTooltip(lastRun)} title={getStructIssueTooltip(lastRun)} style={{ color: "var(--error, #dc2626)", fontSize: "12px", lineHeight: 1, cursor: "help" }}>!</span>) : null}
                        </div>
                      </td>
                      <td className={styles.stateCol} style={{ padding: "12px" }}>{getStateAbbreviation(city.state)}</td>
                      <td className={styles.populationCol} style={{ padding: "12px" }}>{formatPopulation(city.population)}</td>
                      <td className={styles.popSourceCol} style={{ padding: "12px", fontSize: "12px", color: "var(--text-secondary)" }}>
                        {city.population_source_name ? `${city.population_source_name}${city.population_data_year != null ? ` ${city.population_data_year}` : ""}` : "—"}
                      </td>
                      <td className={styles.platformCol} style={{ padding: "12px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                          <span className={styles.platformBadge} style={{ padding: "4px 8px", background: "var(--bg-secondary)", borderRadius: "4px", fontSize: "11px" }}>{portalPlatformLabel(city.portal_type, city.main_portal_url)}</span>
                          {(() => {
                            const badge = portalMatchStatusLabel(city.portal_match_status, city.portal_match_confidence);
                            if (!badge) return null;
                            const isReviewable = city.portal_match_status === "review_needed" && (city.portal_match_candidates?.length ?? 0) > 0;
                            return (
                              <span title={isReviewable ? `Click to review ${city.portal_match_candidates?.length} candidate(s)` : `Portal match: ${city.portal_match_status} (${city.portal_match_confidence ?? "?"})`} onClick={isReviewable ? () => setPortalReviewCity(city) : undefined} role={isReviewable ? "button" : undefined} style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 600, color: badge.color, background: `${badge.color}18`, border: `1px solid ${badge.color}40`, whiteSpace: "nowrap", cursor: isReviewable ? "pointer" : "default", textDecoration: isReviewable ? "underline dotted" : "none" }}>
                                {badge.label}{isReviewable && " →"}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td style={{ padding: "12px", whiteSpace: "nowrap" }}>
                        {(() => {
                          const s = city.structure_status;
                          const fields = city.district_fields ?? [];
                          const color = s === "complete" ? "#16a34a" : s === "partial" ? "#d97706" : "#6b7280";
                          const label = s === "complete" ? "Complete" : s === "partial" ? "Partial" : "Not started";
                          const tooltip = fields.length ? `District fields: ${fields.join(", ")}` : label;
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                              <span title={tooltip} style={{ display: "inline-block", padding: "2px 7px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, color, background: `${color}18`, border: `1px solid ${color}40`, cursor: fields.length ? "help" : "default" }}>{label}</span>
                              {fields.length > 0 && (<span title={`District field aliases: ${fields.join(", ")}`} style={{ fontSize: "10px", color: "var(--text-secondary)", fontFamily: "monospace" }}>{fields[0]}{fields.length > 1 ? ` +${fields.length - 1}` : ""}</span>)}
                            </div>
                          );
                        })()}
                      </td>
                      <td className={styles.datasetsCol} style={{ padding: "12px" }}>
                        {hasPortalUrl && portalUrl ? (
                          <a href={portalUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-primary)", textDecoration: "none", fontWeight: 600 }} title="Open portal">{city.datasets_count || 0}</a>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{city.datasets_count || 0}</span>
                        )}
                      </td>
                      <td className={styles.vectorDbCol} style={{ padding: "12px" }}>
                        {vectorStatsLoadingCityIds.has(city.city_id) ? (
                          <button type="button" className={styles.vectorDbBtn} disabled title="Loading Vector DB stats..."><span className={styles.loadingSpinner} aria-hidden="true" /></button>
                        ) : city.vector_db_points !== null && city.vector_db_points !== undefined ? (
                          <button type="button" className={`${styles.vectorDbBtn} ${styles.vectorDbBtnStatsLoaded}`} title={`Vector DB: ${city.vector_db_points} points, ${(city.vector_db_size_mb || 0).toFixed(2)} MB`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                            <span className="vector-db-stats-display">{city.vector_db_points > 0 ? `✓ ${city.vector_db_points}` : "—"}</span>
                          </button>
                        ) : (
                          <button type="button" className={styles.vectorDbBtn} title={vectorStatsErrorCityIds.has(city.city_id) ? "Failed to load Vector DB stats — click to retry" : "Click to load Vector DB stats"} onClick={(e) => { e.preventDefault(); e.stopPropagation(); loadVectorDbStats(city.city_id); }}>
                            {vectorStatsErrorCityIds.has(city.city_id) ? (<span style={{ color: "var(--error, #dc2626)", fontWeight: 700 }}>⚠</span>) : (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>)}
                          </button>
                        )}
                      </td>
                      <td className={styles.actionsCol} style={{ padding: "12px" }}>
                        <button type="button" onClick={() => setCityToDelete(city)} disabled={!!deletingCityId} title="Delete city" aria-label={`Delete ${city.city_name || "city"}`} style={{ background: "transparent", border: "none", padding: "6px", borderRadius: "6px", cursor: deletingCityId ? "not-allowed" : "pointer", color: "var(--text-secondary)", opacity: deletingCityId ? 0.5 : 1 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : citiesByState.map((stateGroup) => (
                <React.Fragment key={`state-${stateGroup.state}`}>
                  <tr className={styles.stateHeaderRow}>
                    <td
                      colSpan={12}
                      className={styles.stateHeaderCell}
                      style={{
                        padding: "12px",
                        background: "var(--bg-secondary)",
                        fontWeight: 600,
                        borderTop: "2px solid var(--border-primary)",
                      }}
                    >
                      <strong>{stateGroup.state}</strong>
                      <span style={{ marginLeft: "8px", color: "var(--text-secondary)", fontWeight: 400 }}>
                        ({stateGroup.cities.length} cities)
                      </span>
                    </td>
                  </tr>
                  {stateGroup.cities.map((city) => {
                    const hasPortalUrl = hasPortal(city);
                    const portalUrl = city.main_portal_url || "";
                    const isSelected = selectedCityIds.includes(city.city_id);
                    const isSaved = savedCityIds.has(city.city_id);
                    const isSaving = savingCityIds.has(city.city_id);
                    const lastRun = lastRunsByCityId[String(city.city_id)];
                    const structIssue =
                      lastRun?.errors?.[0] ?? lastRun?.opportunities?.[0];

                    return (
                      <tr
                        key={city.city_id}
                        className={city.is_launched ? styles.launchedRow : undefined}
                        style={{
                          borderBottom: "1px solid var(--border-primary)",
                        }}
                      >
                        <td className={styles.checkboxCol} style={{ padding: "12px" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleCitySelection(city.city_id, e.target.checked)}
                          />
                        </td>
                        <td className={styles.nameCol} style={{ padding: "12px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                            <button
                              type="button"
                              onClick={() => handleToggleSavedCity(city.city_id)}
                              disabled={isSaving}
                              title={
                                isSaved
                                  ? "Remove from My Places"
                                  : "Save to My Places"
                              }
                              aria-label={
                                isSaved
                                  ? "Remove from My Places"
                                  : "Save to My Places"
                              }
                              style={{
                                background: "transparent",
                                border: "none",
                                padding: "4px",
                                borderRadius: "6px",
                                cursor: isSaving ? "not-allowed" : "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.2s ease",
                                color: isSaved
                                  ? "#9333ea"
                                  : "var(--text-secondary, #6b7280)",
                                opacity: isSaving ? 0.6 : 1,
                              }}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill={isSaved ? "currentColor" : "none"}
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                              </svg>
                            </button>
                            <div
                              aria-hidden="true"
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "999px",
                                background: "var(--bg-secondary, #f3f4f6)",
                                border: "1px solid var(--border-primary, #e5e7eb)",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: city.emoji ? "18px" : "13px",
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                              title={city.city_name || "City"}
                            >
                              {getCityAvatar(city)}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                minWidth: 0,
                              }}
                            >
                              <button
                                type="button"
                                className={`city-name${city.is_launched ? ` ${styles.launchedCityName}` : ""}`}
                                onClick={() => onOpenCity && onOpenCity(city.city_id)}
                                style={{
                                  cursor: onOpenCity ? "pointer" : "default",
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  margin: 0,
                                  textAlign: "left",
                                  ...(city.is_launched
                                    ? {}
                                    : { color: "var(--text-primary)" }),
                                  fontSize: "13px",
                                  fontWeight: 600,
                                }}
                                title={
                                  city.is_launched
                                    ? "Launched — open city view"
                                    : "Open city view"
                                }
                              >
                                {city.city_name || "—"}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "12px 8px",
                            textAlign: "center",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                          title="Template metrics attempted"
                        >
                          {city.template_metrics_attempted ?? 0}
                        </td>
                        <td
                          style={{
                            padding: "12px 8px",
                            textAlign: "center",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                          title="Template metrics instantiated"
                        >
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "4px",
                            }}
                          >
                            <span>{city.template_metrics_instantiated ?? 0}</span>
                            {lastRun ? (
                              <span
                                aria-label={getStructRunTooltip(lastRun)}
                                title={getStructRunTooltip(lastRun)}
                                style={{
                                  color:
                                    lastRun.success === false
                                      ? "var(--error, #dc2626)"
                                      : "var(--text-secondary, #6b7280)",
                                  fontSize: "11px",
                                  lineHeight: 1,
                                  cursor: "help",
                                }}
                              >
                                i
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "12px 8px",
                            textAlign: "center",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                          title="Template metrics missing"
                        >
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "4px",
                            }}
                          >
                            <span>{city.template_metrics_missing ?? 0}</span>
                            {structIssue ? (
                              <span
                                aria-label={getStructIssueTooltip(lastRun)}
                                title={getStructIssueTooltip(lastRun)}
                                style={{
                                  color: "var(--error, #dc2626)",
                                  fontSize: "12px",
                                  lineHeight: 1,
                                  cursor: "help",
                                }}
                              >
                                !
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className={styles.stateCol} style={{ padding: "12px" }}>
                          {getStateAbbreviation(city.state)}
                        </td>
                        <td className={styles.populationCol} style={{ padding: "12px" }}>
                          {formatPopulation(city.population)}
                        </td>
                        <td className={styles.popSourceCol} style={{ padding: "12px", fontSize: "12px", color: "var(--text-secondary)" }}>
                          {city.population_source_name
                            ? `${city.population_source_name}${city.population_data_year != null ? ` ${city.population_data_year}` : ""}`
                            : "—"}
                        </td>
                        <td className={styles.platformCol} style={{ padding: "12px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                            <span
                              className={styles.platformBadge}
                              style={{
                                padding: "4px 8px",
                                background: "var(--bg-secondary)",
                                borderRadius: "4px",
                                fontSize: "11px",
                              }}
                            >
                              {portalPlatformLabel(city.portal_type, city.main_portal_url)}
                            </span>
                            {(() => {
                              const badge = portalMatchStatusLabel(
                                city.portal_match_status,
                                city.portal_match_confidence
                              );
                              if (!badge) return null;
                              const isReviewable =
                                city.portal_match_status === "review_needed" &&
                                (city.portal_match_candidates?.length ?? 0) > 0;
                              return (
                                <span
                                  title={
                                    isReviewable
                                      ? `Click to review ${city.portal_match_candidates?.length} candidate(s)`
                                      : `Portal match: ${city.portal_match_status} (${city.portal_match_confidence ?? "?"})`
                                  }
                                  onClick={isReviewable ? () => setPortalReviewCity(city) : undefined}
                                  role={isReviewable ? "button" : undefined}
                                  style={{
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    color: badge.color,
                                    background: `${badge.color}18`,
                                    border: `1px solid ${badge.color}40`,
                                    whiteSpace: "nowrap",
                                    cursor: isReviewable ? "pointer" : "default",
                                    textDecoration: isReviewable ? "underline dotted" : "none",
                                  }}
                                >
                                  {badge.label}
                                  {isReviewable && " →"}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td style={{ padding: "12px", whiteSpace: "nowrap" }}>
                          {(() => {
                            const s = city.structure_status;
                            const fields = city.district_fields ?? [];
                            const color =
                              s === "complete"
                                ? "#16a34a"
                                : s === "partial"
                                ? "#d97706"
                                : "#6b7280";
                            const label =
                              s === "complete"
                                ? "Complete"
                                : s === "partial"
                                ? "Partial"
                                : "Not started";
                            const tooltip = fields.length
                              ? `District fields: ${fields.join(", ")}`
                              : label;
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                <span
                                  title={tooltip}
                                  style={{
                                    display: "inline-block",
                                    padding: "2px 7px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    color,
                                    background: `${color}18`,
                                    border: `1px solid ${color}40`,
                                    cursor: fields.length ? "help" : "default",
                                  }}
                                >
                                  {label}
                                </span>
                                {fields.length > 0 && (
                                  <span
                                    title={`District field aliases: ${fields.join(", ")}`}
                                    style={{
                                      fontSize: "10px",
                                      color: "var(--text-secondary)",
                                      fontFamily: "monospace",
                                    }}
                                  >
                                    {fields[0]}
                                    {fields.length > 1 ? ` +${fields.length - 1}` : ""}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className={styles.datasetsCol} style={{ padding: "12px" }}>
                          {hasPortalUrl && portalUrl ? (
                            <a
                              href={portalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: "var(--brand-primary)",
                                textDecoration: "none",
                                fontWeight: 600,
                              }}
                              title="Open portal"
                            >
                              {city.datasets_count || 0}
                            </a>
                          ) : (
                            <span style={{ fontWeight: 600 }}>{city.datasets_count || 0}</span>
                          )}
                        </td>
                        <td className={styles.vectorDbCol} style={{ padding: "12px" }}>
                          {vectorStatsLoadingCityIds.has(city.city_id) ? (
                            <button
                              type="button"
                              className={styles.vectorDbBtn}
                              disabled
                              title="Loading Vector DB stats..."
                            >
                              <span className={styles.loadingSpinner} aria-hidden="true" />
                            </button>
                          ) : city.vector_db_points !== null &&
                            city.vector_db_points !== undefined ? (
                            <button
                              type="button"
                              className={`${styles.vectorDbBtn} ${styles.vectorDbBtnStatsLoaded}` }
                              title={`Vector DB: ${city.vector_db_points} points, ${(
                                city.vector_db_size_mb || 0
                              ).toFixed(2)} MB`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <span className="vector-db-stats-display">
                                {city.vector_db_points > 0
                                  ? `✓ ${city.vector_db_points}`
                                  : "—"}
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.vectorDbBtn}
                              title={
                                vectorStatsErrorCityIds.has(city.city_id)
                                  ? "Failed to load Vector DB stats — click to retry"
                                  : "Click to load Vector DB stats"
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                loadVectorDbStats(city.city_id);
                              }}
                            >
                              {vectorStatsErrorCityIds.has(city.city_id) ? (
                                <span
                                  style={{
                                    color: "var(--error, #dc2626)",
                                    fontWeight: 700,
                                  }}
                                >
                                  ⚠
                                </span>
                              ) : (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  aria-hidden="true"
                                >
                                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                                </svg>
                              )}
                            </button>
                          )}
                        </td>
                        <td className={styles.actionsCol} style={{ padding: "12px" }}>
                          <button
                            type="button"
                            onClick={() => setCityToDelete(city)}
                            disabled={!!deletingCityId}
                            title="Delete city"
                            aria-label={`Delete ${city.city_name || "city"}`}
                            style={{
                              background: "transparent",
                              border: "none",
                              padding: "6px",
                              borderRadius: "6px",
                              cursor: deletingCityId ? "not-allowed" : "pointer",
                              color: "var(--text-secondary)",
                              opacity: deletingCityId ? 0.5 : 1,
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {filteredCities.length === 0 && (
            <div className={styles.emptyState}>
              No cities found matching filters.
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {/* Delete city confirm modal */}
      {cityToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-city-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !deletingCityId && setCityToDelete(null)}
        >
          <div
            style={{
              background: "var(--bg-primary)",
              padding: "24px",
              borderRadius: "8px",
              maxWidth: "420px",
              width: "90%",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-city-title" style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: 600 }}>
              Delete city?
            </h3>
            <p style={{ margin: "0 0 20px", color: "var(--text-secondary)", fontSize: "14px" }}>
              This will permanently remove <strong>{cityToDelete.city_name || "this city"}</strong> and all its data
              (metrics, datasets, structure, cache). This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => !deletingCityId && setCityToDelete(null)}
                disabled={!!deletingCityId}
                style={{
                  padding: "8px 16px",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "6px",
                  background: "var(--bg-primary)",
                  cursor: deletingCityId ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCity}
                disabled={!!deletingCityId}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: "6px",
                  background: "var(--error, #dc2626)",
                  color: "white",
                  cursor: deletingCityId ? "not-allowed" : "pointer",
                }}
              >
                {deletingCityId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "city-health" && (
        <>
          <div className={styles.card} style={{ padding: "12px 16px" }}>
            <button
              type="button"
              onClick={() => setPlatformChartsOpen((o) => !o)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                width: "100%",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  fontSize: "10px",
                  transition: "transform 0.15s",
                  transform: platformChartsOpen ? "rotate(90deg)" : "rotate(0deg)",
                }}
                aria-hidden
              >
                ▶
              </span>
              <span style={{ fontSize: "14px", fontWeight: 600 }}>Platform Distribution</span>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)", marginLeft: "4px" }}>
                {stats.totalCitiesCount} cities · {formatTotalPopulation(stats.totalPopulation)} pop
              </span>
            </button>
            {platformChartsOpen && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px 12px",
                  marginTop: "12px",
                }}
              >
                <PlatformPie
                  title="US — by City Count"
                  subtitle={`${platformCharts.us.count.reduce((s, d) => s + d.value, 0).toLocaleString()} cities`}
                  data={platformCharts.us.count}
                  formatValue={(v) => `${v.toLocaleString()} cities`}
                />
                <PlatformPie
                  title="US — by Population"
                  subtitle={`${formatTotalPopulation(platformCharts.us.population.reduce((s, d) => s + d.value, 0))} total pop`}
                  data={platformCharts.us.population}
                  formatValue={(v) => formatTotalPopulation(v)}
                />
                <PlatformPie
                  title="Worldwide — by City Count"
                  subtitle={`${platformCharts.worldwide.count.reduce((s, d) => s + d.value, 0).toLocaleString()} cities`}
                  data={platformCharts.worldwide.count}
                  formatValue={(v) => `${v.toLocaleString()} cities`}
                />
                <PlatformPie
                  title="Worldwide — by Population"
                  subtitle={`${formatTotalPopulation(platformCharts.worldwide.population.reduce((s, d) => s + d.value, 0))} total pop`}
                  data={platformCharts.worldwide.population}
                  formatValue={(v) => formatTotalPopulation(v)}
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: "16px" }}>
            <ScheduleHealthDashboard
              token={null}
              getAccessTokenSilently={getAccessTokenSilently}
              onViewJob={handleViewJob}
            />
          </div>
        </>
      )}

      {portalReviewCity && (
        <PortalReviewModal
          city={portalReviewCity}
          onClose={() => setPortalReviewCity(null)}
          onAccepted={(cityId, acceptedUrl) => {
            // Optimistically update the city row so the badge clears immediately
            setCities((prev) =>
              prev.map((c) =>
                c.city_id === cityId
                  ? {
                      ...c,
                      main_portal_url: acceptedUrl,
                      portal_match_status: "matched",
                      portal_match_confidence: "high",
                      portal_match_candidates: null,
                    }
                  : c
              )
            );
          }}
        />
      )}
    </div>
  );
}

// Helper functions
function hasPortal(city: CityListItem): boolean {
  return !!(city.main_portal_url || (city.all_portal_urls && city.all_portal_urls.length > 0));
}

function parsePopulation(pop: number | string | null | undefined): number {
  if (!pop) return 0;
  if (typeof pop === "number") return pop;
  if (typeof pop === "string") {
    const cleaned = pop.replace(/,/g, "").trim();
    if (cleaned.endsWith("B") || cleaned.endsWith("b")) {
      return parseFloat(cleaned.slice(0, -1)) * 1000000000;
    }
    if (cleaned.endsWith("M") || cleaned.endsWith("m")) {
      return parseFloat(cleaned.slice(0, -1)) * 1000000;
    }
    if (cleaned.endsWith("K") || cleaned.endsWith("k")) {
      return parseFloat(cleaned.slice(0, -1)) * 1000;
    }
    return parseFloat(cleaned) || 0;
  }
  return 0;
}

