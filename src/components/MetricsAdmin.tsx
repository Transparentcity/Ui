"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createAdminMetric,
  deleteAdminMetric,
  executeAdminMetric,
  getAdminMetric,
  getAdminMetricCityStructure,
  getAdminMetricTimeSeries,
  getAdminMetricTimeSeriesDetail,
  getAdminMetricsSummary,
  listAdminMetricCategories,
  listAdminMetricCities,
  listAdminMetricTypes,
  listAdminMetrics,
  updateAdminMetric,
  type AdminMetricCategory,
  type AdminMetricCity,
  type AdminMetricDetail,
  type AdminMetricListItem,
  type AdminMetricSummary,
  type AdminMetricTimeSeries,
  type AdminMetricTimeSeriesDetail,
  type AdminMetricType,
  type CreateAdminMetricRequest,
  type UpdateAdminMetricRequest,
} from "@/lib/apiClient";

import styles from "./MetricsAdmin.module.css";
import { notifyJobCreated } from "@/lib/useJobWebSocket";

type StatusFilter = "" | "true" | "false";

function formatDateTime(value?: string | null): string {
  if (!value) return "Never";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
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

  const [summary, setSummary] = useState<AdminMetricSummary | null>(null);
  const [categories, setCategories] = useState<AdminMetricCategory[]>([]);
  const [types, setTypes] = useState<AdminMetricType[]>([]);
  const [cities, setCities] = useState<AdminMetricCity[]>([]);
  const [metrics, setMetrics] = useState<AdminMetricListItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("");

  // City dropdown filter
  const [citySearchQuery, setCitySearchQuery] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // Modals
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<AdminMetricDetail | null>(null);
  const [detailCityStructure, setDetailCityStructure] = useState<any | null>(null);

  const [chartsOpen, setChartsOpen] = useState(false);
  const [chartsData, setChartsData] = useState<AdminMetricTimeSeries | null>(null);
  const [chartDetail, setChartDetail] = useState<AdminMetricTimeSeriesDetail | null>(null);

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

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();
      const [summaryData, categoriesData, typesData, citiesData, metricsData] =
        await Promise.all([
          getAdminMetricsSummary(token),
          listAdminMetricCategories(token),
          listAdminMetricTypes(token),
          listAdminMetricCities(token),
          listAdminMetrics(token, { limit: 100 }),
        ]);
      setSummary(summaryData);
      setCategories(categoriesData);
      setTypes(typesData);
      setCities(citiesData);
      setMetrics(metricsData);
    } catch (err) {
      console.error("Error loading metrics admin data:", err);
      setError(err instanceof Error ? err.message : "Failed to load metrics admin data");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  const loadMetrics = useCallback(
    async (forceRefresh: boolean = false) => {
      try {
        setLoading(true);
        setError(null);
        const token = await getAccessTokenSilently();
        const metricsData = await listAdminMetrics(token, {
          limit: 100,
          search: searchQuery || undefined,
          category: selectedCategory || undefined,
          metric_type: selectedType || undefined,
          is_active:
            selectedStatus === "" ? undefined : selectedStatus === "true",
          city_id: selectedCityId || undefined,
          force_refresh: forceRefresh,
        });
        setMetrics(metricsData);
        const summaryData = await getAdminMetricsSummary(token);
        setSummary(summaryData);
      } catch (err) {
        console.error("Error loading metrics:", err);
        setError(err instanceof Error ? err.message : "Failed to load metrics");
      } finally {
        setLoading(false);
      }
    },
    [
      getAccessTokenSilently,
      searchQuery,
      selectedCategory,
      selectedType,
      selectedStatus,
      selectedCityId,
    ],
  );

  const debouncedSearch = useCallback(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadMetrics();
    }, 500);
  }, [loadMetrics]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    debouncedSearch();
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, debouncedSearch]);

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedType, selectedStatus, selectedCityId]);

  // Keep city input synced when selection changes programmatically
  useEffect(() => {
    if (selectedCityId && selectedCityDisplayName) {
      setCitySearchQuery(selectedCityDisplayName);
    }
    // We intentionally do not clear citySearchQuery when selection clears
  }, [selectedCityId, selectedCityDisplayName]);

  const openDetail = async (metricId: number) => {
    try {
      setError(null);
      const token = await getAccessTokenSilently();
      const [metric, cityStructure] = await Promise.all([
        getAdminMetric(metricId, token),
        getAdminMetricCityStructure(metricId, token).catch(() => null),
      ]);
      setDetail(metric);
      setDetailCityStructure(cityStructure);
      setDetailOpen(true);
    } catch (err) {
      console.error("Error loading metric detail:", err);
      setError(err instanceof Error ? err.message : "Failed to load metric detail");
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetail(null);
    setDetailCityStructure(null);
  };

  const openCharts = async (metricId: number) => {
    try {
      setError(null);
      setChartDetail(null);
      const token = await getAccessTokenSilently();
      const ts = await getAdminMetricTimeSeries(metricId, token);
      setChartsData(ts);
      setChartsOpen(true);
    } catch (err) {
      console.error("Error loading time series:", err);
      setError(err instanceof Error ? err.message : "Failed to load time series");
    }
  };

  const closeCharts = () => {
    setChartsOpen(false);
    setChartsData(null);
    setChartDetail(null);
  };

  const openChartDetail = async (metricId: number, chartId: number) => {
    try {
      setError(null);
      const token = await getAccessTokenSilently();
      const detailData = await getAdminMetricTimeSeriesDetail(metricId, chartId, token);
      setChartDetail(detailData);
    } catch (err) {
      console.error("Error loading chart detail:", err);
      setError(err instanceof Error ? err.message : "Failed to load chart detail");
    }
  };

  const executeMetric = async (metricId: number) => {
    if (!confirm(`Execute metric ${metricId}?`)) return;
    try {
      setError(null);
      const token = await getAccessTokenSilently();
      const res = await executeAdminMetric(metricId, { period_type: "month" }, token);
      notifyJobCreated(res.job_id);
      alert(`Metric execution started.\nJob ID: ${res.job_id}`);
      await loadMetrics(true);
    } catch (err) {
      console.error("Error executing metric:", err);
      setError(err instanceof Error ? err.message : "Failed to execute metric");
    }
  };

  const deleteMetric = async (metricId: number) => {
    if (!confirm("Delete this metric? This cannot be undone.")) return;
    try {
      setError(null);
      const token = await getAccessTokenSilently();
      const res = await deleteAdminMetric(metricId, token);
      alert(res.message || `Deleted metric ${metricId}`);
      await loadMetrics(true);
    } catch (err) {
      console.error("Error deleting metric:", err);
      setError(err instanceof Error ? err.message : "Failed to delete metric");
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
    setEditOpen(true);
  };

  const openEdit = async (metricId: number) => {
    try {
      setError(null);
      const token = await getAccessTokenSilently();
      const metric = await getAdminMetric(metricId, token);
      setEditMode("edit");
      setEditMetricId(metricId);
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
      setEditOpen(true);
    } catch (err) {
      console.error("Error loading metric for edit:", err);
      setError(err instanceof Error ? err.message : "Failed to load metric for edit");
    }
  };

  const closeEdit = () => {
    setEditOpen(false);
  };

  const saveEdit = async () => {
    if (!editForm.metric_name.trim() || !editForm.category.trim()) {
      alert("Please fill in Metric Name and Category.");
      return;
    }
    try {
      setError(null);
      const token = await getAccessTokenSilently();
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
        const res = await createAdminMetric(payload, token);
        alert(res.message || `Created metric ${res.metric_id}`);
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
        const res = await updateAdminMetric(editMetricId, payload, token);
        alert(res.message || `Updated metric ${editMetricId}`);
      }
      closeEdit();
      await loadMetrics(true);
    } catch (err) {
      console.error("Error saving metric:", err);
      setError(err instanceof Error ? err.message : "Failed to save metric");
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
      {error && <div className={styles.errorMessage}>{error}</div>}

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <div className={styles.statIcon}>
                <i className="fas fa-chart-bar" style={{ color: "var(--brand-primary)", fontSize: 28 }} />
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
                <i className="fas fa-check-circle" style={{ color: "var(--success)", fontSize: 28 }} />
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
                <i className="fas fa-play-circle" style={{ color: "var(--brand-primary)", fontSize: 28 }} />
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
                <i className="fas fa-exclamation-triangle" style={{ color: "var(--error)", fontSize: 28 }} />
              </div>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Failed</div>
                <div className={styles.statValue}>{summary?.failed_metrics ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

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

          <button className={styles.primaryBtn} onClick={() => loadMetrics(true)} disabled={loading}>
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
                <th className={styles.th}>ID</th>
                <th className={styles.th}>Metric</th>
                <th className={styles.th}>City</th>
                <th className={styles.th}>Category</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Last Execution</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className={styles.td} colSpan={8}>
                    <span className={styles.muted}>Loading…</span>
                  </td>
                </tr>
              )}

              {tableEmpty && (
                <tr>
                  <td className={styles.td} colSpan={8}>
                    <span className={styles.muted}>No metrics found matching the current filters.</span>
                  </td>
                </tr>
              )}

              {!loading &&
                metrics.map((m) => (
                  <tr key={m.id} className={styles.rowHover}>
                    <td className={styles.td}>{m.id}</td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 600 }}>{m.metric_name}</div>
                      <div className={styles.muted} style={{ fontSize: 12 }}>
                        {m.metric_key}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.muted}>{m.city_name || "—"}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={`${styles.badge} ${styles.badgePrimary}`}>{m.category}</span>
                      {m.subcategory && (
                        <div className={styles.muted} style={{ fontSize: 12, marginTop: 4 }}>
                          {m.subcategory}
                        </div>
                      )}
                    </td>
                    <td className={styles.td}>
                      <span className={styles.muted}>{m.metric_type || "—"}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.muted}>{formatDateTime(m.last_execution_at)}</span>
                    </td>
                    <td className={styles.td}>
                      <StatusBadge isActive={m.is_active} lastExecutionStatus={m.last_execution_status} />
                    </td>
                    <td className={styles.td}>
                      <div className={styles.actions}>
                        <button className={styles.iconBtn} onClick={() => openDetail(m.id)} title="View details">
                          <i className="fas fa-eye" />
                        </button>
                        <button className={styles.iconBtn} onClick={() => openCharts(m.id)} title="Time series">
                          <i className="fas fa-chart-line" />
                        </button>
                        <button className={styles.iconBtn} onClick={() => openEdit(m.id)} title="Edit">
                          <i className="fas fa-edit" />
                        </button>
                        <button className={styles.iconBtn} onClick={() => executeMetric(m.id)} title="Execute">
                          <i className="fas fa-play" />
                        </button>
                        <button
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          onClick={() => deleteMetric(m.id)}
                          title="Delete"
                        >
                          <i className="fas fa-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detailOpen && detail && (
        <div className={styles.modalOverlay} onMouseDown={closeDetail}>
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>{detail.metric_name}</div>
              <button className={styles.iconBtn} onClick={closeDetail} title="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.grid2}>
                <div>
                  <div className={styles.fieldLabel}>Metric Key</div>
                  <div className={styles.fieldValue}>{detail.metric_key || "—"}</div>
                </div>
                <div>
                  <div className={styles.fieldLabel}>Category</div>
                  <div className={styles.fieldValue}>
                    {detail.category}
                    {detail.subcategory ? ` / ${detail.subcategory}` : ""}
                  </div>
                </div>
                <div>
                  <div className={styles.fieldLabel}>Type</div>
                  <div className={styles.fieldValue}>{detail.metric_type || "queried"}</div>
                </div>
                <div>
                  <div className={styles.fieldLabel}>Data Source</div>
                  <div className={styles.fieldValue}>{detail.data_source_type || "—"}</div>
                </div>
                {detail.endpoint && (
                  <div>
                    <div className={styles.fieldLabel}>Endpoint</div>
                    <div className={styles.fieldValue}>{detail.endpoint}</div>
                  </div>
                )}
                {detail.city_name && (
                  <div>
                    <div className={styles.fieldLabel}>City</div>
                    <div className={styles.fieldValue}>{detail.city_name}</div>
                  </div>
                )}
              </div>

              {(detail.summary || detail.definition) && (
                <div style={{ marginTop: 16 }}>
                  {detail.summary && (
                    <div style={{ marginBottom: 12 }}>
                      <div className={styles.fieldLabel}>Summary</div>
                      <div className={styles.fieldValue}>{detail.summary}</div>
                    </div>
                  )}
                  {detail.definition && (
                    <div>
                      <div className={styles.fieldLabel}>Definition</div>
                      <div className={styles.fieldValue}>{detail.definition}</div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <div className={styles.fieldLabel}>Execution</div>
                <div className={styles.fieldValue}>
                  <div className={styles.chartMeta}>
                    <span>
                      <strong>Last Run:</strong> {formatDateTime(detail.last_execution_at)}
                    </span>
                    <span>
                      <strong>Status:</strong>{" "}
                      <StatusBadge isActive={detail.is_active} lastExecutionStatus={detail.last_execution_status} />
                    </span>
                    <span>
                      <strong>Count:</strong> {detail.execution_count ?? 0}
                    </span>
                    <span>
                      <strong>Job:</strong> {detail.last_execution_job_id || "—"}
                    </span>
                  </div>
                  {detail.last_execution_error && (
                    <div style={{ marginTop: 10 }} className={styles.errorMessage}>
                      {detail.last_execution_error}
                    </div>
                  )}
                </div>
              </div>

              {(detail.data_sf_url || detail.source_url) && (
                <div style={{ marginTop: 16 }}>
                  <div className={styles.fieldLabel}>Source URL</div>
                  <div className={styles.fieldValue}>
                    <a
                      href={detail.data_sf_url || detail.source_url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--brand-primary)" }}
                    >
                      {detail.data_sf_url || detail.source_url}
                    </a>
                  </div>
                </div>
              )}

              {detailCityStructure?.city_id && (
                <div style={{ marginTop: 18 }}>
                  <div className={styles.fieldLabel}>City Structure</div>
                  <div className={styles.fieldValue}>
                    <div style={{ marginBottom: 10 }}>
                      <span className={`${styles.badge} ${styles.badgePrimary}`}>{detailCityStructure.status}</span>
                    </div>
                    {(detailCityStructure.geographic_structures?.length || 0) > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div className={styles.fieldLabel}>Geographic Structures</div>
                        <table className={styles.miniTable}>
                          <thead>
                            <tr>
                              <th className={styles.miniTh}>Name</th>
                              <th className={styles.miniTh}>Field</th>
                              <th className={styles.miniTh}>Range</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailCityStructure.geographic_structures.map((g: any, idx: number) => (
                              <tr key={idx}>
                                <td className={styles.miniTd}>{g.structure_name || g.structure_type || "—"}</td>
                                <td className={styles.miniTd}>{g.identifier_field || "—"}</td>
                                <td className={styles.miniTd}>
                                  {g.min_value !== null && g.max_value !== null ? `${g.min_value}–${g.max_value}` : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {(detailCityStructure.governance_structures?.length || 0) > 0 && (
                      <div>
                        <div className={styles.fieldLabel}>Governance Structures</div>
                        <table className={styles.miniTable}>
                          <thead>
                            <tr>
                              <th className={styles.miniTh}>Name</th>
                              <th className={styles.miniTh}>Seats</th>
                              <th className={styles.miniTh}>Election</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailCityStructure.governance_structures.map((g: any, idx: number) => (
                              <tr key={idx}>
                                <td className={styles.miniTd}>{g.body_name || g.structure_type || "—"}</td>
                                <td className={styles.miniTd}>{g.total_seats ?? "—"}</td>
                                <td className={styles.miniTd}>{g.election_type ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.secondaryBtn} onClick={closeDetail}>
                Close
              </button>
              <button className={styles.primaryBtn} onClick={() => executeMetric(detail.id)}>
                <i className="fas fa-play" /> Execute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Charts Modal */}
      {chartsOpen && chartsData && (
        <div className={styles.modalOverlay} onMouseDown={closeCharts}>
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                Time Series — {chartsData.metric_name} ({chartsData.count})
              </div>
              <button className={styles.iconBtn} onClick={closeCharts} title="Close">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className={styles.modalBody}>
              {chartDetail ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <button className={styles.secondaryBtn} onClick={() => setChartDetail(null)}>
                      <i className="fas fa-arrow-left" /> Back to list
                    </button>
                    <div className={styles.muted} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>
                        <strong>Points:</strong> {chartDetail.count}
                      </span>
                      <span>
                        <strong>Chart ID:</strong> {chartDetail.metadata?.chart_id ?? "—"}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                      {chartDetail.metadata?.chart_title || "Time Series"}
                    </div>
                    {chartDetail.metadata?.caption && (
                      <div className={styles.muted} style={{ marginTop: 4 }}>
                        {chartDetail.metadata.caption}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 14 }} className={styles.chartPreview}>
                    {(() => {
                      const values = chartDetail.data
                        .map((d) => safeNumber(d.numeric_value))
                        .filter((v): v is number => v !== null);
                      if (values.length < 2) {
                        return <span className={styles.muted}>Not enough data to render chart.</span>;
                      }
                      const points = makeSparklinePoints(values, 1000, 260);
                      return (
                        <svg viewBox="0 0 1000 260" width="100%" height="100%" preserveAspectRatio="none">
                          <polyline
                            points={points}
                            fill="rgba(173, 53, 250, 0.12)"
                            stroke="var(--brand-primary)"
                            strokeWidth="3"
                            vectorEffect="non-scaling-stroke"
                          />
                        </svg>
                      );
                    })()}
                  </div>

                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th className={styles.miniTh}>Time Period</th>
                        <th className={styles.miniTh}>Value</th>
                        <th className={styles.miniTh}>Group</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartDetail.data.map((d, idx) => (
                        <tr key={idx}>
                          <td className={styles.miniTd}>{d.time_period}</td>
                          <td className={styles.miniTd}>
                            {typeof d.numeric_value === "number"
                              ? d.numeric_value.toLocaleString()
                              : String(d.numeric_value)}
                          </td>
                          <td className={styles.miniTd}>{d.group_value ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : chartsData.count === 0 ? (
                <div className={styles.muted} style={{ padding: 16 }}>
                  No time series data found for this metric. Execute the metric to generate time series.
                </div>
              ) : (
                <>
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th className={styles.miniTh}>Chart</th>
                        <th className={styles.miniTh}>Period</th>
                        <th className={styles.miniTh}>District</th>
                        <th className={styles.miniTh}>Points</th>
                        <th className={styles.miniTh}>Created</th>
                        <th className={styles.miniTh}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartsData.time_series.map((ts) => (
                        <tr key={ts.chart_id}>
                          <td className={styles.miniTd}>{ts.chart_title || `Chart ${ts.chart_id}`}</td>
                          <td className={styles.miniTd}>{ts.period_type}</td>
                          <td className={styles.miniTd}>{ts.district}</td>
                          <td className={styles.miniTd}>{ts.data_point_count ?? 0}</td>
                          <td className={styles.miniTd}>{formatDateTime(ts.created_at)}</td>
                          <td className={styles.miniTd}>
                            <button
                              className={styles.primaryBtn}
                              onClick={() => openChartDetail(chartsData.metric_id, ts.chart_id)}
                            >
                              <i className="fas fa-chart-line" /> View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.secondaryBtn} onClick={closeCharts}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}


