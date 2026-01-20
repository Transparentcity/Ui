"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type CreateAdminMetricRequest,
  type UpdateAdminMetricRequest,
  invalidateAdminMetricMapCache,
} from "@/lib/apiClient";
import {
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
} from "@/lib/hooks/useMetrics";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import TemplateOrderEditor from "./TemplateOrderEditor";
import MetricActions from "./MetricActions";
import MetricEditModal from "./MetricEditModal";
import MetricChartsModal from "./MetricChartsModal";
import styles from "./MetricsAdmin.module.css";

type StatusFilter = "" | "true" | "false";

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
  const { getAccessTokenSilently } = useAuth0();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("");
  const [selectedUpdateFrequency, setSelectedUpdateFrequency] = useState("");
  const [maxLagDays, setMaxLagDays] = useState<number | null>(null);
  
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
  
  // Metrics query with filters
  const metricsQuery = useMetrics({
    limit: 100,
    search: debouncedSearchQuery || undefined,
    category: selectedCategory || undefined,
    metric_type: selectedType || undefined,
    is_active: selectedStatus === "" ? undefined : selectedStatus === "true",
    city_id: selectedCityId || undefined,
  });
  
  // Mutation hooks
  const createMetricMutation = useCreateMetric();
  const updateMetricMutation = useUpdateMetric();
  const deleteMetricMutation = useDeleteMetric();
  const executeMetricMutation = useExecuteMetric();
  const validateFreshnessMutation = useValidateMetricFreshness();
  
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
  
  // Apply client-side freshness filters
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
    
    return filtered;
  }, [metricsQuery.data, selectedUpdateFrequency, maxLagDays]);
  
  const loading = summaryQuery.isLoading || categoriesQuery.isLoading || 
                  typesQuery.isLoading || citiesQuery.isLoading || metricsQuery.isLoading;
  const error = summaryQuery.error || categoriesQuery.error || 
                typesQuery.error || citiesQuery.error || metricsQuery.error
                ? (summaryQuery.error || categoriesQuery.error || 
                   typesQuery.error || citiesQuery.error || metricsQuery.error)?.message || "Failed to load data"
                : null;

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalMetricId, setEditModalMetricId] = useState<number | null>(null);

  const [chartsOpen, setChartsOpen] = useState(false);
  const [chartsMetricId, setChartsMetricId] = useState<number | null>(null);

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

  const openExecuteModal = (metricId: number) => {
    // Set default values: Daily period from Jan 1, 2023 to today
    const today = new Date();
    const startDate = new Date(2023, 0, 1); // Jan 1, 2023
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    setExecuteMetricId(metricId);
    setExecutePeriodType("day");
    setExecuteStartDate(startDate.toISOString().split('T')[0]);
    setExecuteEndDate(endDate.toISOString().split('T')[0]);
    setShowExecuteModal(true);
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
      {error && <div className={styles.errorMessage}>{String(error)}</div>}

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

      {/* Template Ordering */}
      <TemplateOrderEditor
        templates={metrics.filter((m) => m.metric_type === "template")}
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
              <button className={styles.clearCityBtn} onMouseDown={(e) => e.preventDefault()} onClick={clearCity} title="Clear city filter">
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
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as StatusFilter)}
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
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
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitle}>Metrics List</div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Metric</th>
                <th className={`${styles.th} ${styles.hideNarrow}`}>City</th>
                <th className={`${styles.th} ${styles.hideNarrow}`}>Category</th>
                <th className={styles.th}>Data Range</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className={styles.td} colSpan={5}>
                    <span className={styles.muted}>Loading…</span>
                  </td>
                </tr>
              )}

              {tableEmpty && (
                <tr>
                  <td className={styles.td} colSpan={5}>
                    <span className={styles.muted}>No metrics found matching the current filters.</span>
                  </td>
                </tr>
              )}

              {!loading &&
                metrics.map((m) => (
                  <tr key={m.id} className={styles.rowHover}>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{m.metric_name}</div>
                      <div className={styles.muted} style={{ fontSize: 11 }}>
                        {m.metric_key}
                      </div>
                      {!m.is_active && (
                        <span className={`${styles.badge} ${styles.badgeRed}`} style={{ marginTop: 4, fontSize: 10 }}>Inactive</span>
                      )}
                    </td>
                    <td className={`${styles.td} ${styles.hideNarrow}`}>
                      <span className={styles.muted}>{m.city_name || "—"}</span>
                    </td>
                    <td className={`${styles.td} ${styles.hideNarrow}`}>
                      <span className={`${styles.badge} ${styles.badgePrimary}`}>{m.category}</span>
                    </td>
                    <td className={styles.td}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {(m.earliest_data_date || m.most_recent_data_date) && (
                          <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>
                            {m.earliest_data_date && new Date(m.earliest_data_date).getFullYear()}
                            {m.earliest_data_date && m.most_recent_data_date && " → "}
                            {m.most_recent_data_date && new Date(m.most_recent_data_date).getFullYear()}
                          </div>
                        )}
                        <FreshnessBadge freshness={m.freshness} />
                        {m.record_counts && (m.record_counts.total_active > 0 || m.record_counts.total_inactive > 0) && (
                          <div 
                            style={{ fontSize: 10, cursor: "help", display: "flex", gap: 6 }}
                            title={`Active:\n  Charts: ${m.record_counts.active_charts}\n  Data points: ${m.record_counts.active_data_points.toLocaleString()}\n  Anomaly runs: ${m.record_counts.anomaly_runs}\n  Anomaly results: ${m.record_counts.anomaly_results}\n  Maps: ${m.record_counts.saved_maps}\n\nInactive:\n  Charts: ${m.record_counts.inactive_charts}\n  Data points: ${m.record_counts.inactive_data_points.toLocaleString()}`}
                          >
                            {m.record_counts.total_active > 0 && (
                              <span style={{ color: "var(--color-success, #22c55e)" }}>
                                {m.record_counts.total_active.toLocaleString()} active
                              </span>
                            )}
                            {m.record_counts.total_inactive > 0 && (
                              <span style={{ color: "var(--text-tertiary)" }}>
                                {m.record_counts.total_inactive.toLocaleString()} inactive
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <MetricActions
                        metricId={m.id}
                        onEdit={() => openEditModal(m.id)}
                        onViewCharts={() => openCharts(m.id)}
                        onExecute={() => openExecuteModal(m.id)}
                        onDelete={() => deleteMetric(m.id)}
                      />
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
      />

      {/* Create/Edit Modal */}
      {editOpen && (
        <div className={styles.modalOverlay} onMouseDown={closeEdit}>
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                {editMode === "create" ? "Create New Metric" : `Edit Metric ${editMetricId}`}
              </div>
              <button className={styles.iconBtn} onClick={closeEdit} title="Close">
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
                  onChange={(e) => setExecutePeriodType(e.target.value)}
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


