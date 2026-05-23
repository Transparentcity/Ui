"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useQueryClient } from "@tanstack/react-query";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type CreateAdminMetricRequest,
  type UpdateAdminMetricRequest,
  exportAdminMetrics,
  exportAdminPlatformMetadata,
  importAdminMetrics,
  importAdminPlatformMetadata,
  invalidateAdminMetricMapCache,
  getDefaultExecuteStartDateByPeriod,
} from "@/lib/apiClient";
import {
  ADMIN_API_ACCESS_TOKEN_QUERY_KEY,
  useMetrics,
  useMetric,
  useMetricsSummary,
  useMetricCategories,
  useMetricTypes,
  useMetricCities,
  useMetricCityStructure,
  useCreateMetric,
  useUpdateMetric,
  useDeleteMetric,
  useExecuteMetric,
  useValidateMetricFreshness,
  usePurgeMetricData,
  useClearCityMetricData,
} from "@/lib/hooks/useMetrics";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import TemplateOrderEditor from "./TemplateOrderEditor";
import CrossCityComparisonChart from "./CrossCityComparisonChart";
import MetricActions from "./MetricActions";
import MetricEditModal from "./MetricEditModal";
import MetricChartsModal from "./MetricChartsModal";
import MetricMapsModal from "./MetricMapsModal";
import styles from "./MetricsAdmin.module.css";

type StatusFilter = "" | "true" | "false";
type LastRunFilter = "" | "failed" | "completed" | "never";

/** True when the failure is likely an expired/invalid session or Auth0 silent-auth failure. */
function isLikelySessionOrTokenAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; message?: unknown; error?: string };
  if (e.status === 401) return true;
  if (typeof e.error === "string") {
    const code = e.error.toLowerCase();
    if (
      code === "login_required" ||
      code === "consent_required" ||
      code === "missing_refresh_token"
    ) {
      return true;
    }
  }
  const msg = String(e.message ?? "").toLowerCase();
  return (
    msg.includes("login_required") ||
    msg.includes("consent_required") ||
    msg.includes("missing_refresh_token")
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Never";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString();
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function makeSparklinePoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padX = 12;
  const padY = 12;
  const w = Math.max(1, width - padX * 2);
  const h = Math.max(1, height - padY * 2);

  return values
    .map((v, i) => {
      const x = padX + (w * i) / Math.max(1, values.length - 1);
      const y = padY + h - (h * (v - min)) / span;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function FreshnessBadge({
  freshness,
}: {
  freshness?: { update_frequency?: string | null; lag_days?: number | null; is_stale?: boolean | null } | null;
}) {
  if (!freshness || !freshness.update_frequency) {
    return <span className={`${styles.badge} ${styles.muted}`}>Unknown</span>;
  }

  const lag = freshness.lag_days ?? 0;
  const frequency = freshness.update_frequency || 'unknown';
  const isStale = freshness.is_stale ?? false;

  let colorClass = styles.badgeSuccess;
  if (lag >= 7 || isStale) {
    colorClass = styles.badgeDanger;
  } else if (lag >= 3) {
    colorClass = styles.badgeWarning;
  }

  const displayText = `${frequency}${lag > 0 ? ` (${lag}d)` : ''}`;

  return (
    <span className={`${styles.badge} ${colorClass}`} title={`Updated ${frequency}, ${lag} days behind`}>
      {displayText}
    </span>
  );
}

function StatusBadge({
  isActive,
  lastExecutionStatus,
}: {
  isActive: boolean;
  lastExecutionStatus?: string | null;
}) {
  if (!isActive) {
    return <span className={`${styles.badge}`}>Inactive</span>;
  }
  const status = (lastExecutionStatus || "").toLowerCase();
  if (status === "completed") {
    return <span className={`${styles.badge} ${styles.badgeGreen}`}>Completed</span>;
  }
  if (status === "running") {
    return <span className={`${styles.badge} ${styles.badgeYellow}`}>Running</span>;
  }
  if (status === "failed") {
    return <span className={`${styles.badge} ${styles.badgeRed}`}>Failed</span>;
  }
  return <span className={`${styles.badge}`}>Not Run</span>;
}

export default function MetricsAdmin() {
  const { getAccessTokenSilently, loginWithRedirect } = useAuth0();
  const queryClient = useQueryClient();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("");
  const [selectedLastRunStatus, setSelectedLastRunStatus] = useState<LastRunFilter>("");
  const [selectedUpdateFrequency, setSelectedUpdateFrequency] = useState("");
  const [maxLagDays, setMaxLagDays] = useState<number | null>(null);
  /** List metrics whose `template_id` matches this platform template metric. */
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  /** Touch / coarse pointer: tap row to pin the action bar open. */
  const [pinnedActionsMetricId, setPinnedActionsMetricId] = useState<number | null>(null);

  // City dropdown filter
  const [citySearchQuery, setCitySearchQuery] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  
  // Debounced search query for React Query
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  
  // React Query hooks for data fetching
  const summaryQuery = useMetricsSummary();
  const categoriesQuery = useMetricCategories();
  const typesQuery = useMetricTypes();
  const citiesQuery = useMetricCities();
  
  // Metrics query with filters (include_record_counts=false for fast load; use for troubleshooting when needed)
  const metricsQuery = useMetrics({
    limit: selectedTemplateId != null ? 500 : 100,
    search: debouncedSearchQuery || undefined,
    category: selectedCategory || undefined,
    metric_type: selectedType || undefined,
    is_active: selectedStatus === "" ? undefined : selectedStatus === "true",
    city_id: selectedCityId || undefined,
    template_id: selectedTemplateId ?? undefined,
    last_execution_status: selectedLastRunStatus || undefined,
    include_record_counts: false,
  });

  // Template metrics: always fetch global templates (metric_type=template, no city filter)
  // so the Template Order Editor shows actual templates even when the main list is filtered by city.
  const templatesQuery = useMetrics({
    metric_type: "template",
    limit: 200,
    include_record_counts: false,
  });
  
  // Mutation hooks
  const createMetricMutation = useCreateMetric();
  const updateMetricMutation = useUpdateMetric();
  const deleteMetricMutation = useDeleteMetric();
  const executeMetricMutation = useExecuteMetric();
  const validateFreshnessMutation = useValidateMetricFreshness();
  const purgeMetricDataMutation = usePurgeMetricData();
  const clearCityMetricDataMutation = useClearCityMetricData();
  
  // Execute metric configuration modal state
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executeMetricId, setExecuteMetricId] = useState<number | null>(null);
  const [executePeriodType, setExecutePeriodType] = useState<string>("day");
  const [executeStartDate, setExecuteStartDate] = useState<string>("");
  const [executeEndDate, setExecuteEndDate] = useState<string>("");
  
  // Derived data
  const summary = summaryQuery.data ?? null;
  const categories = categoriesQuery.data ?? [];
  const types = typesQuery.data ?? [];
  const cities = citiesQuery.data ?? [];
  
  // Apply client-side filters, then sort by category → metric_name
  const metrics = useMemo(() => {
    let filtered = metricsQuery.data ?? [];
    
    if (selectedUpdateFrequency) {
      filtered = filtered.filter(
        (m) => m.freshness?.update_frequency === selectedUpdateFrequency
      );
    }
    
    if (maxLagDays !== null) {
      filtered = filtered.filter(
        (m) => (m.freshness?.lag_days ?? Infinity) <= maxLagDays
      );
    }

    return [...filtered].sort((a, b) => {
      const catCmp = (a.category ?? "").localeCompare(b.category ?? "", undefined, { sensitivity: "base" });
      if (catCmp !== 0) return catCmp;
      return (a.metric_name ?? "").localeCompare(b.metric_name ?? "", undefined, { sensitivity: "base" });
    });
  }, [metricsQuery.data, selectedUpdateFrequency, maxLagDays]);
  
  const loading = summaryQuery.isLoading || categoriesQuery.isLoading || 
                  typesQuery.isLoading || citiesQuery.isLoading || metricsQuery.isLoading;

  const firstError = summaryQuery.error || categoriesQuery.error ||
                     typesQuery.error || citiesQuery.error || metricsQuery.error || null;
  const isAuthError = isLikelySessionOrTokenAuthError(firstError);
  const error = firstError
    ? firstError.message || "Failed to load data"
    : null;

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalMetricId, setEditModalMetricId] = useState<number | null>(null);

  const [chartsOpen, setChartsOpen] = useState(false);
  const [chartsMetricId, setChartsMetricId] = useState<number | null>(null);

  const [mapsOpen, setMapsOpen] = useState(false);
  const [mapsMetricId, setMapsMetricId] = useState<number | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<"create" | "edit">("create");
  const [editMetricId, setEditMetricId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    metric_name: string;
    metric_key: string;
    category: string;
    subcategory: string;
    summary: string;
    definition: string;
    is_active: boolean;
    show_on_dash: boolean;
    // create-only
    date_field: string;
    endpoint: string;
    aggregation_type: string;
  }>({
    metric_name: "",
    metric_key: "",
    category: "",
    subcategory: "",
    summary: "",
    definition: "",
    is_active: true,
    show_on_dash: false,
    date_field: "",
    endpoint: "",
    aggregation_type: "COUNT",
  });
  const [editQueryConfig, setEditQueryConfig] = useState<Record<string, any> | null>(null);
  const [showQueryConfig, setShowQueryConfig] = useState(false);
  const [editMapFields, setEditMapFields] = useState<{
    map_query: string | null;
    map_filters: Record<string, any> | null;
    map_config: Record<string, any> | null;
    location_fields: any[] | null;
    category_fields: any[] | null;
  } | null>(null);
  const [showMapFields, setShowMapFields] = useState(false);
  const [mapCacheInvalidating, setMapCacheInvalidating] = useState(false);
  const [showAllGaps, setShowAllGaps] = useState(false);

  // Export / Import — full platform metadata bundle
  const [platformExporting, setPlatformExporting] = useState(false);
  const [platformImporting, setPlatformImporting] = useState(false);
  const [platformImportFile, setPlatformImportFile] = useState<File | null>(null);
  const [platformImportTargetCityId, setPlatformImportTargetCityId] = useState<
    number | null
  >(null);
  const [includeShapefileGeometry, setIncludeShapefileGeometry] = useState(false);

  // Export / Import — metrics definitions only
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTargetCityId, setImportTargetCityId] = useState<number | null>(null);

  // Debounce refs
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideDropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const selectedCityDisplayName = useMemo(() => {
    if (!selectedCityId) return "";
    const found = cities.find((c) => c.id === selectedCityId);
    return found?.display_name || "";
  }, [cities, selectedCityId]);

  const filteredCities = useMemo(() => {
    const q = citySearchQuery.toLowerCase().trim();
    if (!q) return cities.slice(0, 50);
    return cities
      .filter((c) => c.display_name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [cities, citySearchQuery]);

  const templateNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of templatesQuery.data ?? []) {
      map.set(t.id, t.metric_name);
    }
    return map;
  }, [templatesQuery.data]);

  const sortedTemplates = useMemo(() => {
    return [...(templatesQuery.data ?? [])].sort((a, b) =>
      a.metric_name.localeCompare(b.metric_name, undefined, { sensitivity: "base" })
    );
  }, [templatesQuery.data]);

  const selectedTemplateName =
    selectedTemplateId == null ? undefined : templateNameById.get(selectedTemplateId);

  const hasSelectedTemplateChildren = useMemo(
    () => selectedTemplateId != null && metrics.some((m) => m.city_id != null),
    [metrics, selectedTemplateId]
  );

  useEffect(() => {
    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => {
        if (!cancelled) setAdminToken(token);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("Unable to load admin token for cross-city chart", err);
          setAdminToken(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getAccessTokenSilently]);

  const handleMetricRowPointerToggle = useCallback(
    (e: ReactMouseEvent<HTMLTableRowElement>, metricId: number) => {
      if ((e.target as HTMLElement).closest("[data-metric-actions-wrap]")) return;
      const coarse =
        typeof window !== "undefined" &&
        (window.matchMedia("(pointer: coarse)").matches ||
          window.matchMedia("(hover: none)").matches);
      if (!coarse) return;
      setPinnedActionsMetricId((prev) => (prev === metricId ? null : metricId));
    },
    []
  );

  useEffect(() => {
    setPinnedActionsMetricId(null);
  }, [
    selectedTemplateId,
    selectedCityId,
    debouncedSearchQuery,
    selectedCategory,
    selectedType,
    selectedStatus,
    selectedLastRunStatus,
    selectedUpdateFrequency,
    maxLagDays,
  ]);

  // Debounce search query
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  // Keep city input synced when selection changes programmatically
  useEffect(() => {
    if (selectedCityId && selectedCityDisplayName) {
      setCitySearchQuery(selectedCityDisplayName);
    }
    // We intentionally do not clear citySearchQuery when selection clears
  }, [selectedCityId, selectedCityDisplayName]);


  const openEditModal = (metricId: number) => {
    setEditModalMetricId(metricId);
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditModalMetricId(null);
  };

  const openCharts = (metricId: number) => {
    setChartsMetricId(metricId);
    setChartsOpen(true);
  };

  const closeCharts = () => {
    setChartsOpen(false);
    setChartsMetricId(null);
  };

  const openMaps = (metricId: number) => {
    setMapsMetricId(metricId);
    setMapsOpen(true);
  };

  const closeMaps = () => {
    setMapsOpen(false);
    setMapsMetricId(null);
  };

  const openExecuteModal = (metricId: number) => {
    const today = new Date();
    const endDate = today.toISOString().split("T")[0];
    const periodType = "day";
    setExecuteMetricId(metricId);
    setExecutePeriodType(periodType);
    setExecuteStartDate(getDefaultExecuteStartDateByPeriod(periodType));
    setExecuteEndDate(endDate);
    setShowExecuteModal(true);
  };

  const onExecutePeriodTypeChange = (newPeriodType: string) => {
    setExecutePeriodType(newPeriodType);
    setExecuteStartDate(getDefaultExecuteStartDateByPeriod(newPeriodType));
  };

  const closeExecuteModal = () => {
    setShowExecuteModal(false);
    setExecuteMetricId(null);
  };

  const executeMetric = async () => {
    if (!executeMetricId) return;
    
    try {
      executeMetricMutation.mutate(
        { 
          metricId: executeMetricId, 
          payload: { 
            period_type: executePeriodType,
            start_date: executeStartDate || null,
            end_date: executeEndDate || null
          } 
        },
        {
          onSuccess: (res) => {
            notifyJobCreated(res.job_id);
            alert(`Metric execution started.\nJob ID: ${res.job_id}`);
            closeExecuteModal();
          },
          onError: (err) => {
            console.error("Error executing metric:", err);
            alert(err instanceof Error ? err.message : "Failed to execute metric");
          },
        }
      );
    } catch (err) {
      console.error("Error executing metric:", err);
    }
  };

  const deleteMetric = async (metricId: number) => {
    if (!confirm("Delete this metric? This cannot be undone.")) return;
    try {
      deleteMetricMutation.mutate(metricId, {
        onSuccess: (res) => {
          alert(res.message || `Deleted metric ${metricId}`);
        },
        onError: (err) => {
          console.error("Error deleting metric:", err);
          alert(err instanceof Error ? err.message : "Failed to delete metric");
        },
      });
    } catch (err) {
      console.error("Error deleting metric:", err);
    }
  };

  const purgeMetricData = async (metricId: number, metricName: string) => {
    if (
      !confirm(
        `Clear all data for "${metricName}"?\n\nThis removes time series, charts, maps, anomalies, and completeness data. The metric definition is kept. This cannot be undone.`
      )
    )
      return;
    try {
      purgeMetricDataMutation.mutate(
        { metricId },
        {
          onSuccess: (res) => {
            alert(res.message || `Cleared data for ${res.metric_name}`);
            metricsQuery.refetch();
            summaryQuery.refetch();
          },
          onError: (err) => {
            console.error("Error purging metric data:", err);
            alert(err instanceof Error ? err.message : "Failed to clear metric data");
          },
        }
      );
    } catch (err) {
      console.error("Error purging metric data:", err);
    }
  };

  const clearCityData = async (cityId: number | null) => {
    const scope = cityId ? `city "${cities.find((c) => c.id === cityId)?.display_name ?? cityId}"` : "all cities";
    if (
      !confirm(
        `Clear all metric data for ${scope}?\n\nThis removes time series, anomalies, maps, feed stories, research, and completeness data. Metrics and users are kept. This cannot be undone.`
      )
    )
      return;
    try {
      clearCityMetricDataMutation.mutate(
        { cityId },
        {
          onSuccess: (res) => {
            alert(res.message || `Cleared ${res.total_deleted} records for ${scope}`);
            metricsQuery.refetch();
            summaryQuery.refetch();
          },
          onError: (err) => {
            console.error("Error clearing city metric data:", err);
            alert(err instanceof Error ? err.message : "Failed to clear city data");
          },
        }
      );
    } catch (err) {
      console.error("Error clearing city metric data:", err);
    }
  };

  const openCreate = () => {
    setEditMode("create");
    setEditMetricId(null);
    setEditForm({
      metric_name: "",
      metric_key: "",
      category: "",
      subcategory: "",
      summary: "",
      definition: "",
      is_active: true,
      show_on_dash: false,
      date_field: "",
      endpoint: "",
      aggregation_type: "COUNT",
    });
    setEditQueryConfig(null);
    setShowQueryConfig(false);
    setEditMapFields(null);
    setShowMapFields(false);
    setEditOpen(true);
  };

  // Hook for edit metric (only active when editMetricId is set)
  const editMetricQuery = useMetric(editMetricId);
  
  // Update edit form when metric data loads
  useEffect(() => {
    if (editMode === "edit" && editMetricId && editMetricQuery.data) {
      const metric = editMetricQuery.data;
      setEditForm({
        metric_name: metric.metric_name || "",
        metric_key: metric.metric_key || "",
        category: metric.category || "",
        subcategory: metric.subcategory || "",
        summary: metric.summary || "",
        definition: metric.definition || "",
        is_active: metric.is_active !== false,
        show_on_dash: metric.show_on_dash === true,
        date_field: "",
        endpoint: "",
        aggregation_type: "COUNT",
      });
      setEditQueryConfig(metric.metadata?.query_config || null);
      setEditMapFields({
        map_query: metric.map_query || null,
        map_filters: metric.map_filters || null,
        map_config: metric.map_config || null,
        location_fields: metric.location_fields || null,
        category_fields: metric.category_fields || null,
      });
    }
    if (editMetricQuery.isError) {
      console.error("Error loading metric for edit:", editMetricQuery.error);
      alert(editMetricQuery.error instanceof Error ? editMetricQuery.error.message : "Failed to load metric for edit");
    }
  }, [editMode, editMetricId, editMetricQuery.data, editMetricQuery.isError]);

  const openEdit = (metricId: number) => {
    setEditMode("edit");
    setEditMetricId(metricId);
    setShowQueryConfig(false);
    setShowMapFields(false);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
  };

  const saveEdit = async () => {
    if (!editForm.metric_name.trim() || !editForm.category.trim()) {
      alert("Please fill in Metric Name and Category.");
      return;
    }
    
    if (editMode === "create") {
      if (!editForm.metric_key.trim() || !editForm.date_field.trim() || !editForm.endpoint.trim()) {
        alert("For create, please fill Metric Key, Date Field, and Endpoint.");
        return;
      }
      const payload: CreateAdminMetricRequest = {
        metric_name: editForm.metric_name.trim(),
        metric_key: editForm.metric_key.trim(),
        category: editForm.category.trim(),
        subcategory: editForm.subcategory.trim() || null,
        summary: editForm.summary.trim() || null,
        definition: editForm.definition.trim() || null,
        date_field: editForm.date_field.trim(),
        endpoint: editForm.endpoint.trim(),
        aggregation_type: editForm.aggregation_type,
        is_active: editForm.is_active,
        show_on_dash: editForm.show_on_dash,
      };
      createMetricMutation.mutate(payload, {
        onSuccess: (res) => {
          alert(res.message || `Created metric ${res.metric_id}`);
          closeEdit();
        },
        onError: (err) => {
          console.error("Error saving metric:", err);
          alert(err instanceof Error ? err.message : "Failed to save metric");
        },
      });
    } else {
      if (!editMetricId) return;
      const payload: UpdateAdminMetricRequest = {
        metric_name: editForm.metric_name.trim(),
        category: editForm.category.trim(),
        subcategory: editForm.subcategory.trim() || null,
        summary: editForm.summary.trim() || null,
        definition: editForm.definition.trim() || null,
        is_active: editForm.is_active,
        show_on_dash: editForm.show_on_dash,
      };
      updateMetricMutation.mutate(
        { metricId: editMetricId, payload },
        {
          onSuccess: (res) => {
            alert(res.message || `Updated metric ${editMetricId}`);
            closeEdit();
          },
          onError: (err) => {
            console.error("Error saving metric:", err);
            alert(err instanceof Error ? err.message : "Failed to save metric");
          },
        }
      );
    }
  };

  const handleInvalidateMapCache = async () => {
    if (!editMetricId) return;
    const confirmed = window.confirm(
      "Invalidate cached maps for this metric? This will force map regeneration on next request."
    );
    if (!confirmed) return;

    try {
      setMapCacheInvalidating(true);
      const token = await getAccessTokenSilently();
      const result = await invalidateAdminMetricMapCache(editMetricId, undefined, token);
      alert(
        `Invalidated ${result.deleted_count} cached map(s) for metric ${editMetricId}.`
      );
    } catch (err) {
      console.error("Error invalidating map cache:", err);
      alert(err instanceof Error ? err.message : "Failed to invalidate map cache");
    } finally {
      setMapCacheInvalidating(false);
    }
  };

  const setCityFromDropdown = (cityId: number, displayName: string) => {
    setSelectedCityId(cityId);
    setCitySearchQuery(displayName);
    setShowCityDropdown(false);
  };

  const clearCity = () => {
    setSelectedCityId(null);
    setCitySearchQuery("");
    setShowCityDropdown(false);
  };

  const scheduleHideDropdown = () => {
    if (hideDropdownTimeoutRef.current) clearTimeout(hideDropdownTimeoutRef.current);
    hideDropdownTimeoutRef.current = setTimeout(() => setShowCityDropdown(false), 150);
  };

  const cancelHideDropdown = () => {
    if (hideDropdownTimeoutRef.current) clearTimeout(hideDropdownTimeoutRef.current);
  };

  const tableEmpty = !loading && metrics.length === 0;

  return (
    <div className={styles.metricsAdmin}>
      {error && (
        <div className={styles.errorMessage}>
          {isAuthError ? (
            <>
              <span>Your session has expired or authentication failed.</span>
              <button
                type="button"
                onClick={() => loginWithRedirect()}
                style={{ marginLeft: 12, textDecoration: "underline", cursor: "pointer", background: "none", border: "none", color: "inherit", font: "inherit" }}
              >
                Sign in again
              </button>
              <button
                type="button"
                onClick={() => {
                  void queryClient.invalidateQueries({
                    queryKey: [...ADMIN_API_ACCESS_TOKEN_QUERY_KEY],
                  });
                  metricsQuery.refetch();
                  summaryQuery.refetch();
                  categoriesQuery.refetch();
                  typesQuery.refetch();
                  citiesQuery.refetch();
                }}
                style={{ marginLeft: 8, textDecoration: "underline", cursor: "pointer", background: "none", border: "none", color: "inherit", font: "inherit" }}
              >
                Retry
              </button>
            </>
          ) : (
            String(error)
          )}
        </div>
      )}

      {/* Backup: full platform + metrics-only export/import */}
      <div className={styles.backupPanel}>
        <div className={styles.backupPanelTitle}>Export / import</div>
        <p className={styles.backupPanelIntro}>
          Use the same city filter as the list below (optional). Full platform JSON includes
          cities, structure configs, leaders, scheduled jobs, and metrics—no time series or
          anomalies.
        </p>

        <div className={styles.backupRow}>
          <div className={styles.backupRowHead}>
            <span className={styles.backupRowLabel}>Full platform metadata</span>
            <span className={styles.backupRowHint}>
              <code>platform_metadata.json</code> or legacy <code>metrics_export.json</code>
            </span>
          </div>
          <div className={styles.backupRowActions}>
            <label className={styles.backupCheckbox}>
              <input
                type="checkbox"
                checked={includeShapefileGeometry}
                onChange={(e) => setIncludeShapefileGeometry(e.target.checked)}
              />
              Include map geometry (large)
            </label>
            <button
              className={styles.secondaryBtn}
              type="button"
              disabled={platformExporting}
              title="Download full metadata JSON for the current DB (optionally scoped to selected city)"
              onClick={async () => {
                if (platformExporting) return;
                setPlatformExporting(true);
                try {
                  const token = await getAccessTokenSilently();
                  const blob = await exportAdminPlatformMetadata(token, {
                    city_id: selectedCityId ?? undefined,
                    include_shapefile_geometry: includeShapefileGeometry,
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "platform_metadata.json";
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (err) {
                  console.error("Platform export failed:", err);
                  alert(err instanceof Error ? err.message : "Export failed");
                } finally {
                  setPlatformExporting(false);
                }
              }}
            >
              <i className="fas fa-download" />{" "}
              {platformExporting ? "Exporting…" : "Export"}
            </button>
            <span className={styles.exportImportDivider}>/</span>
            <label className={styles.importLabel}>
              <input
                type="file"
                accept=".json"
                className={styles.importFileInput}
                onChange={(e) => setPlatformImportFile(e.target.files?.[0] ?? null)}
              />
              <span className={styles.secondaryBtn}>
                <i className="fas fa-upload" /> Choose file…
              </span>
            </label>
            {platformImportFile && (
              <>
                <select
                  className={styles.select}
                  value={platformImportTargetCityId ?? ""}
                  onChange={(e) =>
                    setPlatformImportTargetCityId(
                      e.target.value === "" ? null : parseInt(e.target.value, 10)
                    )
                  }
                  title="Single-city exports only: remap to this dev city id"
                >
                  <option value="">No remap</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}
                    </option>
                  ))}
                </select>
                <button
                  className={styles.primaryBtn}
                  type="button"
                  disabled={platformImporting}
                  onClick={async () => {
                    if (!platformImportFile) return;
                    setPlatformImporting(true);
                    try {
                      const token = await getAccessTokenSilently();
                      const res = await importAdminPlatformMetadata(
                        token,
                        platformImportFile,
                        {
                          target_city_id: platformImportTargetCityId ?? undefined,
                        }
                      );
                      alert(
                        `${res.message}\n\n${JSON.stringify(res.counts, null, 2)}`
                      );
                      setPlatformImportFile(null);
                      setPlatformImportTargetCityId(null);
                      metricsQuery.refetch();
                      summaryQuery.refetch();
                    } catch (err) {
                      console.error("Platform import failed:", err);
                      alert(err instanceof Error ? err.message : "Import failed");
                    } finally {
                      setPlatformImporting(false);
                    }
                  }}
                >
                  {platformImporting ? "Importing…" : "Import"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className={styles.backupRow}>
          <div className={styles.backupRowHead}>
            <span className={styles.backupRowLabel}>Metric definitions only</span>
            <span className={styles.backupRowHint}>
              <code>metrics_export.json</code> — definitions + category order
            </span>
          </div>
          <div className={styles.backupRowActions}>
            <div className={styles.exportImportGroup}>
              <button
                className={styles.secondaryBtn}
                type="button"
                onClick={async () => {
                  if (exporting) return;
                  setExporting(true);
                  try {
                    const token = await getAccessTokenSilently();
                    const blob = await exportAdminMetrics(token, {
                      city_id: selectedCityId ?? undefined,
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "metrics_export.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error("Export failed:", err);
                    alert(err instanceof Error ? err.message : "Export failed");
                  } finally {
                    setExporting(false);
                  }
                }}
                disabled={exporting}
                title="Download metric definitions and category ordering only"
              >
                <i className="fas fa-download" /> {exporting ? "Exporting…" : "Export"}
              </button>
              <span className={styles.exportImportDivider}>/</span>
              <label className={styles.importLabel}>
                <input
                  type="file"
                  accept=".json"
                  className={styles.importFileInput}
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                />
                <span className={styles.secondaryBtn}>
                  <i className="fas fa-upload" /> Choose file…
                </span>
              </label>
              {importFile && (
                <>
                  <select
                    className={styles.select}
                    value={importTargetCityId ?? ""}
                    onChange={(e) =>
                      setImportTargetCityId(
                        e.target.value === "" ? null : parseInt(e.target.value, 10)
                      )
                    }
                    title="Remap all metrics to this city (e.g. dev city 1)"
                  >
                    <option value="">No remap</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display_name}
                      </option>
                    ))}
                  </select>
                  <button
                    className={styles.primaryBtn}
                    type="button"
                    disabled={importing}
                    onClick={async () => {
                      if (!importFile) return;
                      setImporting(true);
                      try {
                        const token = await getAccessTokenSilently();
                        const res = await importAdminMetrics(token, importFile, {
                          target_city_id: importTargetCityId ?? undefined,
                        });
                        alert(res.message);
                        setImportFile(null);
                        setImportTargetCityId(null);
                        metricsQuery.refetch();
                        summaryQuery.refetch();
                      } catch (err) {
                        console.error("Import failed:", err);
                        alert(err instanceof Error ? err.message : "Import failed");
                      } finally {
                        setImporting(false);
                      }
                    }}
                  >
                    {importing ? "Importing…" : "Import"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <div className={styles.statIcon}>
                <i className="fas fa-chart-bar" style={{ color: "var(--brand-primary)", fontSize: 20 }} />
              </div>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Total Metrics</div>
                <div className={styles.statValue}>{summary?.total_metrics ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <div className={styles.statIcon}>
                <i className="fas fa-check-circle" style={{ color: "var(--success)", fontSize: 20 }} />
              </div>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Active Metrics</div>
                <div className={styles.statValue}>{summary?.active_metrics ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <div className={styles.statIcon}>
                <i className="fas fa-play-circle" style={{ color: "var(--brand-primary)", fontSize: 20 }} />
              </div>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Completed</div>
                <div className={styles.statValue}>{summary?.completed_metrics ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <div className={styles.statIcon}>
                <i className="fas fa-exclamation-triangle" style={{ color: "var(--error)", fontSize: 20 }} />
              </div>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Failed</div>
                <div className={styles.statValue}>{summary?.failed_metrics ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Template Ordering: use dedicated templates query so real templates show even when list is filtered by city */}
      <TemplateOrderEditor
        templates={templatesQuery.data ?? []}
      />

      {/* Filters */}
      <div className={styles.filtersContainer}>
        <div className={styles.filtersRow}>
          <input
            className={styles.searchInput}
            placeholder="Search metrics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className={styles.cityFilterWrapper}>
            <input
              className={styles.cityInput}
              placeholder="Filter by city..."
              value={citySearchQuery}
              onChange={(e) => {
                setCitySearchQuery(e.target.value);
                setShowCityDropdown(true);
                if (selectedCityId) setSelectedCityId(null);
              }}
              onFocus={() => {
                cancelHideDropdown();
                setShowCityDropdown(true);
              }}
              onBlur={() => scheduleHideDropdown()}
            />
            {(selectedCityId || citySearchQuery) && (
              <button className={styles.clearCityBtn} onMouseDown={(e) => e.preventDefault()} onClick={clearCity} title="Clear city filter" aria-label="Clear city filter">
                <i className="fas fa-times" />
              </button>
            )}
            {showCityDropdown && (
              <div
                className={styles.cityDropdown}
                onMouseDown={() => cancelHideDropdown()}
                onMouseLeave={() => scheduleHideDropdown()}
              >
                {filteredCities.length === 0 ? (
                  <div className={styles.cityDropdownEmpty}>No cities found</div>
                ) : (
                  filteredCities.map((c) => (
                    <div
                      key={c.id}
                      className={styles.cityDropdownItem}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setCityFromDropdown(c.id, c.display_name)}
                    >
                      <span>{c.display_name}</span>
                      <span className={styles.muted}>{c.metric_count}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <select className={styles.select} value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>

          <select className={styles.select} value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
            <option value="">All Types</option>
            {types.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.count})
              </option>
            ))}
          </select>

          <select
            className={styles.select}
            value={selectedTemplateId === null ? "" : String(selectedTemplateId)}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedTemplateId(v === "" ? null : parseInt(v, 10));
            }}
            title="Metrics created from this template (template_id). Uses platform template metrics from the list above."
            aria-label="Filter by source template"
          >
            <option value="">All templates</option>
            {sortedTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.metric_name} (#{t.id})
              </option>
            ))}
          </select>

          <select
            className={styles.select}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as StatusFilter)}
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>

          <select
            className={styles.select}
            value={selectedLastRunStatus}
            onChange={(e) => setSelectedLastRunStatus(e.target.value as LastRunFilter)}
            title="Filter by last execution result (use Failed to troubleshoot and re-run)"
          >
            <option value="">Last run: All</option>
            <option value="failed">Last run: Failed</option>
            <option value="completed">Last run: Completed</option>
            <option value="never">Last run: Never run</option>
          </select>

          <select
            className={styles.select}
            value={selectedUpdateFrequency}
            onChange={(e) => setSelectedUpdateFrequency(e.target.value)}
          >
            <option value="">All Frequencies</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>

          <select
            className={styles.select}
            value={maxLagDays === null ? "" : maxLagDays.toString()}
            onChange={(e) => setMaxLagDays(e.target.value === "" ? null : parseInt(e.target.value))}
          >
            <option value="">All Lag Times</option>
            <option value="3">≤ 3 days</option>
            <option value="7">≤ 7 days</option>
            <option value="14">≤ 14 days</option>
            <option value="30">≤ 30 days</option>
          </select>

          {summary && Number(summary.failed_metrics) > 0 && (
            <button
              className={styles.primaryBtn}
              onClick={() => setSelectedLastRunStatus("failed")}
              title="Show only metrics that failed on last run (troubleshoot and re-run)"
            >
              <i className="fas fa-exclamation-triangle" /> Failed ({summary.failed_metrics})
            </button>
          )}

          <button 
            className={styles.primaryBtn} 
            onClick={() => {
              metricsQuery.refetch();
              summaryQuery.refetch();
            }} 
            disabled={loading}
          >
            <i className="fas fa-sync-alt" /> Refresh
          </button>

          <button className={styles.primaryBtn} onClick={openCreate}>
            <i className="fas fa-plus" /> Create Metric
          </button>

          <div className={styles.clearDataGroup}>
            <span className={styles.clearDataLabel}>Clear data:</span>
            {selectedCityId ? (
              <button
                className={styles.dangerBtn}
                onClick={() => clearCityData(selectedCityId)}
                disabled={clearCityMetricDataMutation.isPending}
                title={`Remove all time series, anomalies, maps, feed stories, and research for ${selectedCityDisplayName}`}
              >
                <i className="fas fa-eraser" /> {selectedCityDisplayName}
              </button>
            ) : (
              <span className={styles.muted} style={{ fontSize: 12 }}>Select a city to clear</span>
            )}
            <button
              className={styles.dangerBtn}
              onClick={() => clearCityData(null)}
              disabled={clearCityMetricDataMutation.isPending}
              title="Remove all metric data for every city (metrics and users kept)"
            >
              <i className="fas fa-eraser" /> All cities
            </button>
          </div>
        </div>
      </div>

      {selectedTemplateId != null && adminToken && hasSelectedTemplateChildren && (
        <CrossCityComparisonChart
          templateId={selectedTemplateId}
          token={adminToken}
          metricName={selectedTemplateName}
          fullPageHref={`/admin/metrics/cross-city/${selectedTemplateId}`}
        />
      )}

      {/* Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitle}>Metrics List</div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={`${styles.table} ${styles.metricsListTable}`}>
            <thead>
              <tr>
                <th className={`${styles.th} ${styles.metricIdTh}`}>ID</th>
                <th className={styles.th}>Metric</th>
                <th className={`${styles.th} ${styles.hideNarrow}`}>City</th>
                <th className={`${styles.th} ${styles.hideNarrow}`}>Category</th>
                <th className={`${styles.th} ${styles.hideNarrow}`}>Template</th>
                <th className={styles.th}>Last data date</th>
                <th className={styles.th}>Changed since last run</th>
                <th className={styles.th}>Time series</th>
                <th className={`${styles.th} ${styles.hideNarrow}`} title="Location, category, map, districts">
                  Setup
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className={styles.td} colSpan={9}>
                    <span className={styles.muted}>Loading…</span>
                  </td>
                </tr>
              )}

              {tableEmpty && (
                <tr>
                  <td className={styles.td} colSpan={9}>
                    <span className={styles.muted}>No metrics found matching the current filters.</span>
                  </td>
                </tr>
              )}

              {!loading &&
                metrics.map((m) => (
                  <tr
                    key={m.id}
                    className={`${styles.rowHover} ${styles.metricRow} ${
                      pinnedActionsMetricId === m.id ? styles.metricRowActionsPinned : ""
                    }`}
                    onClick={(e) => handleMetricRowPointerToggle(e, m.id)}
                  >
                    <td className={`${styles.td} ${styles.metricsListTd} ${styles.metricIdTd}`}>
                      <span className={styles.metricIdCell} title={`Metric ID ${m.id}`}>
                        {m.id}
                      </span>
                    </td>
                    <td className={`${styles.td} ${styles.metricsListTd}`}>
                      <div className={styles.metricNameContent}>
                        <div>
                          <div className={styles.metricNameTitle}>{m.metric_name}</div>
                          <div className={`${styles.muted} ${styles.metricNameKey}`}>{m.metric_key}</div>
                          {!m.is_active && (
                            <span className={`${styles.badge} ${styles.badgeRed} ${styles.metricInactiveBadge}`}>
                              Inactive
                            </span>
                          )}
                        </div>
                        <div
                          className={styles.metricActionsRow}
                          data-metric-actions-wrap
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MetricActions
                            metricId={m.id}
                            compact
                            onEdit={() => openEditModal(m.id)}
                            onViewCharts={() => openCharts(m.id)}
                            onViewMaps={() => openMaps(m.id)}
                            onExecute={() => openExecuteModal(m.id)}
                            onPurgeData={() => purgeMetricData(m.id, m.metric_name)}
                            onDelete={() => deleteMetric(m.id)}
                          />
                        </div>
                      </div>
                    </td>
                    <td className={`${styles.td} ${styles.metricsListTd} ${styles.hideNarrow}`}>
                      <span className={styles.muted}>{m.city_name || "—"}</span>
                    </td>
                    <td className={`${styles.td} ${styles.metricsListTd} ${styles.hideNarrow}`}>
                      <span className={`${styles.badge} ${styles.badgePrimary}`}>{m.category}</span>
                    </td>
                    <td className={`${styles.td} ${styles.metricsListTd} ${styles.hideNarrow}`}>
                      {m.template_id != null ? (
                        <span
                          className={styles.templateCell}
                          title={`Template #${m.template_id}${templateNameById.get(m.template_id) ? `: ${templateNameById.get(m.template_id)}` : ""}`}
                        >
                          {templateNameById.get(m.template_id) ?? `ID ${m.template_id}`}
                        </span>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td className={`${styles.td} ${styles.metricsListTd}`}>
                      {m.most_recent_data_date ? formatDate(m.most_recent_data_date) : "—"}
                    </td>
                    <td className={`${styles.td} ${styles.metricsListTd}`}>
                      {m.changed_since_last_run === true && <span className={styles.badgeYellow}>Yes</span>}
                      {m.changed_since_last_run === false && <span className={styles.muted}>No</span>}
                      {m.changed_since_last_run == null && <span className={styles.muted}>—</span>}
                    </td>
                    <td className={`${styles.td} ${styles.metricsListTd}`}>
                      <span title="Time series metadata (chart) count from last run">{m.time_series_count ?? 0}</span>
                    </td>
                    <td className={`${styles.td} ${styles.metricsListTd} ${styles.hideNarrow}`}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span
                          title={m.has_location_fields ? "Location fields configured" : "No location fields"}
                          style={{ color: m.has_location_fields ? "var(--color-success, #22c55e)" : "var(--text-tertiary)" }}
                        >
                          <i className="fas fa-map-marker-alt" style={{ opacity: m.has_location_fields ? 1 : 0.35 }} />
                        </span>
                        <span
                          title={m.has_category_fields ? "Category fields configured" : "No category fields"}
                          style={{ color: m.has_category_fields ? "var(--color-success, #22c55e)" : "var(--text-tertiary)" }}
                        >
                          <i className="fas fa-tags" style={{ opacity: m.has_category_fields ? 1 : 0.35 }} />
                        </span>
                        <span
                          title={m.has_map_fields ? "Map query configured" : "No map query"}
                          style={{ color: m.has_map_fields ? "var(--color-success, #22c55e)" : "var(--text-tertiary)" }}
                        >
                          <i className="fas fa-map" style={{ opacity: m.has_map_fields ? 1 : 0.35 }} />
                        </span>
                        <span
                          title={m.supports_districts ? "Supports districts" : "No district support"}
                          style={{ color: m.supports_districts ? "var(--color-success, #22c55e)" : "var(--text-tertiary)" }}
                        >
                          <i className="fas fa-border-all" style={{ opacity: m.supports_districts ? 1 : 0.35 }} />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      <MetricEditModal
        metricId={editModalMetricId ?? 0}
        isOpen={editModalOpen}
        onClose={closeEditModal}
        onExecute={(metricId) => {
          closeEditModal();
          openExecuteModal(metricId);
        }}
        onSave={() => {
          metricsQuery.refetch();
        }}
      />

      {/* Old Detail Modal - REMOVED - Dead code removed to fix TypeScript errors */}

      {/* Charts Modal */}
      <MetricChartsModal
        metricId={chartsMetricId}
        isOpen={chartsOpen}
        onClose={closeCharts}
        metricKey={chartsMetricId ? metrics.find((m) => m.id === chartsMetricId)?.metric_key : null}
        citySlug={(() => {
          if (!chartsMetricId) return null;
          const metric = metrics.find((m) => m.id === chartsMetricId);
          if (!metric?.city_id) return null;
          const city = cities.find((c) => c.id === metric.city_id);
          if (!city?.name) return null;
          return city.name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/[\s_-]+/g, "-")
            .replace(/^-|-$/g, "");
        })()}
      />

      {/* Maps Modal */}
      <MetricMapsModal
        metricId={mapsMetricId}
        metricName={metrics.find((m) => m.id === mapsMetricId)?.metric_name}
        isOpen={mapsOpen}
        onClose={closeMaps}
      />

      {/* Create/Edit Modal */}
      {editOpen && (
        <div className={styles.modalOverlay} onMouseDown={closeEdit}>
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                {editMode === "create" ? "Create New Metric" : `Edit Metric ${editMetricId}`}
              </div>
              <button className={styles.iconBtn} onClick={closeEdit} title="Close" aria-label="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.grid2}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className={styles.fieldLabel}>Metric Name *</div>
                  <input
                    className={styles.input}
                    value={editForm.metric_name}
                    onChange={(e) => setEditForm((p) => ({ ...p, metric_name: e.target.value }))}
                  />
                </div>

                <div>
                  <div className={styles.fieldLabel}>
                    Metric Key {editMode === "create" ? "*" : "(read-only)"}
                  </div>
                  <input
                    className={styles.input}
                    value={editForm.metric_key}
                    disabled={editMode !== "create"}
                    onChange={(e) => setEditForm((p) => ({ ...p, metric_key: e.target.value }))}
                  />
                </div>

                {editMode === "edit" && editMetricQuery.data && (
                  <>
                    <div>
                      <div className={styles.fieldLabel}>Metric ID (read-only)</div>
                      <input
                        className={styles.input}
                        value={editMetricQuery.data.id || ""}
                        disabled
                        style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                      />
                    </div>
                    <div>
                      <div className={styles.fieldLabel}>Item Noun (read-only)</div>
                      <input
                        className={styles.input}
                        value={editMetricQuery.data.item_noun || ""}
                        disabled
                        style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                      />
                    </div>
                  </>
                )}

                <div>
                  <div className={styles.fieldLabel}>Category *</div>
                  <input
                    className={styles.input}
                    value={editForm.category}
                    onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
                  />
                </div>

                <div>
                  <div className={styles.fieldLabel}>Subcategory</div>
                  <input
                    className={styles.input}
                    value={editForm.subcategory}
                    onChange={(e) => setEditForm((p) => ({ ...p, subcategory: e.target.value }))}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div className={styles.fieldLabel}>Summary</div>
                  <textarea
                    className={styles.textarea}
                    value={editForm.summary}
                    onChange={(e) => setEditForm((p) => ({ ...p, summary: e.target.value }))}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div className={styles.fieldLabel}>Definition</div>
                  <textarea
                    className={styles.textarea}
                    value={editForm.definition}
                    onChange={(e) => setEditForm((p) => ({ ...p, definition: e.target.value }))}
                  />
                </div>

                {editMode === "create" && (
                  <>
                    <div>
                      <div className={styles.fieldLabel}>Date Field *</div>
                      <input
                        className={styles.input}
                        value={editForm.date_field}
                        onChange={(e) => setEditForm((p) => ({ ...p, date_field: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className={styles.fieldLabel}>Endpoint *</div>
                      <input
                        className={styles.input}
                        value={editForm.endpoint}
                        onChange={(e) => setEditForm((p) => ({ ...p, endpoint: e.target.value }))}
                      />
                    </div>
                    <div>
                      <div className={styles.fieldLabel}>Aggregation Type</div>
                      <select
                        className={styles.select}
                        value={editForm.aggregation_type}
                        onChange={(e) => setEditForm((p) => ({ ...p, aggregation_type: e.target.value }))}
                      >
                        <option value="COUNT">COUNT</option>
                        <option value="SUM">SUM</option>
                        <option value="AVG">AVG</option>
                        <option value="MAX">MAX</option>
                        <option value="MIN">MIN</option>
                      </select>
                    </div>
                  </>
                )}

                <div className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.checked }))}
                    aria-label="Active"
                  />
                  <span className={styles.muted}>Active</span>
                </div>
                <div className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={editForm.show_on_dash}
                    onChange={(e) => setEditForm((p) => ({ ...p, show_on_dash: e.target.checked }))}
                    aria-label="Show on dashboard"
                  />
                  <span className={styles.muted}>Show on Dashboard</span>
                </div>

                {editMode === "edit" && editQueryConfig && (
                  <div style={{ gridColumn: "1 / -1", marginTop: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div className={styles.fieldLabel}>Structured Query Configuration</div>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => setShowQueryConfig(!showQueryConfig)}
                        style={{ padding: "4px 12px", fontSize: 12 }}
                      >
                        <i className={`fas fa-${showQueryConfig ? "chevron-up" : "chevron-down"}`} />{" "}
                        {showQueryConfig ? "Hide" : "Show"}
                      </button>
                    </div>
                    {showQueryConfig && (
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          className={styles.textarea}
                          value={JSON.stringify(editQueryConfig, null, 2)}
                          readOnly
                          style={{
                            fontFamily: "monospace",
                            fontSize: 12,
                            minHeight: 300,
                            backgroundColor: "var(--bg-secondary)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                          <div style={{ marginBottom: 4 }}>
                            <strong>Version:</strong> {editQueryConfig.version || "1.0"}
                          </div>
                          {editQueryConfig.description && (
                            <div style={{ marginBottom: 4 }}>
                              <strong>Description:</strong> {editQueryConfig.description}
                            </div>
                          )}
                          <div style={{ marginBottom: 4 }}>
                            <strong>Use Same Config:</strong> {editQueryConfig.use_same_config ? "Yes" : "No"}
                          </div>
                          {editQueryConfig.ytd_config && (
                            <div style={{ marginTop: 8 }}>
                              <strong>YTD Config:</strong>
                              <div style={{ marginLeft: 16, marginTop: 4 }}>
                                <div>
                                  <strong>Date Field:</strong> {editQueryConfig.ytd_config.date_field?.field_name || "—"}
                                  {editQueryConfig.ytd_config.date_field?.trunc_type && (
                                    <span> (trunc: {editQueryConfig.ytd_config.date_field.trunc_type})</span>
                                  )}
                                </div>
                                <div>
                                  <strong>Aggregation:</strong> {editQueryConfig.ytd_config.aggregation?.type || "—"}
                                  {editQueryConfig.ytd_config.aggregation?.field && (
                                    <span> on {editQueryConfig.ytd_config.aggregation.field}</span>
                                  )}
                                </div>
                                <div>
                                  <strong>Supports Districts:</strong> {editQueryConfig.ytd_config.supports_districts ? "Yes" : "No"}
                                </div>
                                {editQueryConfig.ytd_config.custom_where_conditions?.length > 0 && (
                                  <div>
                                    <strong>Custom WHERE Conditions:</strong> {editQueryConfig.ytd_config.custom_where_conditions.length} condition(s)
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {editQueryConfig.metric_config && !editQueryConfig.use_same_config && (
                            <div style={{ marginTop: 8 }}>
                              <strong>Metric Config:</strong>
                              <div style={{ marginLeft: 16, marginTop: 4 }}>
                                <div>
                                  <strong>Date Field:</strong> {editQueryConfig.metric_config.date_field?.field_name || "—"}
                                  {editQueryConfig.metric_config.date_field?.trunc_type && (
                                    <span> (trunc: {editQueryConfig.metric_config.date_field.trunc_type})</span>
                                  )}
                                </div>
                                <div>
                                  <strong>Aggregation:</strong> {editQueryConfig.metric_config.aggregation?.type || "—"}
                                  {editQueryConfig.metric_config.aggregation?.field && (
                                    <span> on {editQueryConfig.metric_config.aggregation.field}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {editMode === "edit" && editMapFields && (
                  <div style={{ gridColumn: "1 / -1", marginTop: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div className={styles.fieldLabel}>Map Configuration</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={handleInvalidateMapCache}
                          disabled={mapCacheInvalidating}
                          style={{ padding: "4px 12px", fontSize: 12 }}
                        >
                          {mapCacheInvalidating ? "Invalidating..." : "Invalidate Map Cache"}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() => setShowMapFields(!showMapFields)}
                          style={{ padding: "4px 12px", fontSize: 12 }}
                        >
                          <i className={`fas fa-${showMapFields ? "chevron-up" : "chevron-down"}`} />{" "}
                          {showMapFields ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                    {showMapFields && (
                      <div style={{ marginTop: 8 }}>
                        {editMapFields.map_query && (
                          <div style={{ marginBottom: 12 }}>
                            <div className={styles.fieldLabel} style={{ marginBottom: 4 }}>Map Query</div>
                            <textarea
                              className={styles.textarea}
                              value={editMapFields.map_query}
                              readOnly
                              style={{
                                fontFamily: "monospace",
                                fontSize: 12,
                                minHeight: 80,
                                backgroundColor: "var(--bg-secondary)",
                                color: "var(--text-primary)",
                              }}
                            />
                          </div>
                        )}
                        {editMapFields.map_filters && Object.keys(editMapFields.map_filters).length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div className={styles.fieldLabel} style={{ marginBottom: 4 }}>Map Filters</div>
                            <textarea
                              className={styles.textarea}
                              value={JSON.stringify(editMapFields.map_filters, null, 2)}
                              readOnly
                              style={{
                                fontFamily: "monospace",
                                fontSize: 12,
                                minHeight: 150,
                                backgroundColor: "var(--bg-secondary)",
                                color: "var(--text-primary)",
                              }}
                            />
                            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                              {editMapFields.map_filters.geometry && (
                                <div style={{ marginBottom: 4 }}>
                                  <strong>Geometry Filter:</strong> {editMapFields.map_filters.geometry.type || "—"}
                                </div>
                              )}
                              {editMapFields.map_filters.date_range && (
                                <div style={{ marginBottom: 4 }}>
                                  <strong>Date Range Filter:</strong> {editMapFields.map_filters.date_range.field || "—"}
                                </div>
                              )}
                              {editMapFields.map_filters.static_filters && Array.isArray(editMapFields.map_filters.static_filters) && (
                                <div style={{ marginBottom: 4 }}>
                                  <strong>Static Filters:</strong> {editMapFields.map_filters.static_filters.length} condition(s)
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {editMapFields.map_config && Object.keys(editMapFields.map_config).length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div className={styles.fieldLabel} style={{ marginBottom: 4 }}>Map Config</div>
                            <textarea
                              className={styles.textarea}
                              value={JSON.stringify(editMapFields.map_config, null, 2)}
                              readOnly
                              style={{
                                fontFamily: "monospace",
                                fontSize: 12,
                                minHeight: 150,
                                backgroundColor: "var(--bg-secondary)",
                                color: "var(--text-primary)",
                              }}
                            />
                            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                              {editMapFields.map_config.date_field && (
                                <div style={{ marginBottom: 4 }}>
                                  <strong>Date Field:</strong> {editMapFields.map_config.date_field}
                                </div>
                              )}
                              {editMapFields.map_config.location_field && (
                                <div style={{ marginBottom: 4 }}>
                                  <strong>Location Field:</strong> {editMapFields.map_config.location_field}
                                </div>
                              )}
                              {editMapFields.map_config.chart_type_preference && (
                                <div style={{ marginBottom: 4 }}>
                                  <strong>Chart Type Preference:</strong> {editMapFields.map_config.chart_type_preference}
                                </div>
                              )}
                              {editMapFields.map_config.supports_districts !== undefined && (
                                <div style={{ marginBottom: 4 }}>
                                  <strong>Supports Districts:</strong> {editMapFields.map_config.supports_districts ? "Yes" : "No"}
                                </div>
                              )}
                              {editMapFields.map_config.data_point_threshold && (
                                <div style={{ marginBottom: 4 }}>
                                  <strong>Data Point Threshold:</strong> {editMapFields.map_config.data_point_threshold}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {editMapFields.location_fields && editMapFields.location_fields.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div className={styles.fieldLabel} style={{ marginBottom: 4 }}>Location Fields ({editMapFields.location_fields.length})</div>
                            <textarea
                              className={styles.textarea}
                              value={JSON.stringify(editMapFields.location_fields, null, 2)}
                              readOnly
                              style={{
                                fontFamily: "monospace",
                                fontSize: 12,
                                minHeight: 100,
                                backgroundColor: "var(--bg-secondary)",
                                color: "var(--text-primary)",
                              }}
                            />
                          </div>
                        )}
                        {editMapFields.category_fields && editMapFields.category_fields.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div className={styles.fieldLabel} style={{ marginBottom: 4 }}>Category Fields ({editMapFields.category_fields.length})</div>
                            <textarea
                              className={styles.textarea}
                              value={JSON.stringify(editMapFields.category_fields, null, 2)}
                              readOnly
                              style={{
                                fontFamily: "monospace",
                                fontSize: 12,
                                minHeight: 100,
                                backgroundColor: "var(--bg-secondary)",
                                color: "var(--text-primary)",
                              }}
                            />
                          </div>
                        )}
                        {!editMapFields.map_query && 
                         (!editMapFields.map_filters || Object.keys(editMapFields.map_filters).length === 0) &&
                         (!editMapFields.map_config || Object.keys(editMapFields.map_config).length === 0) &&
                         (!editMapFields.location_fields || editMapFields.location_fields.length === 0) &&
                         (!editMapFields.category_fields || editMapFields.category_fields.length === 0) && (
                          <div style={{ padding: 12, backgroundColor: "var(--bg-secondary)", borderRadius: 4, color: "var(--text-secondary)" }}>
                            No map configuration available for this metric.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.secondaryBtn} onClick={closeEdit}>
                Cancel
              </button>
              <button className={styles.primaryBtn} onClick={saveEdit}>
                <i className="fas fa-save" /> Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execute Metric Configuration Modal */}
      {showExecuteModal && (
        <div className={styles.modalOverlay} onClick={closeExecuteModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Execute Metric {executeMetricId}</h2>
              <button className={styles.modalClose} onClick={closeExecuteModal}>
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                  Period Type
                </label>
                <select
                  value={executePeriodType}
                  onChange={(e) => onExecutePeriodTypeChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 4,
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="day">Daily</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                  <option value="ytd">Year-to-Date</option>
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={executeStartDate}
                  onChange={(e) => setExecuteStartDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 4,
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                  End Date
                </label>
                <input
                  type="date"
                  value={executeEndDate}
                  onChange={(e) => setExecuteEndDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 4,
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.secondaryBtn} onClick={closeExecuteModal}>
                Cancel
              </button>
              <button
                className={styles.primaryBtn}
                onClick={executeMetric}
                disabled={executeMetricMutation.isPending}
              >
                <i className="fas fa-play" /> Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


