"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ModelGroupInfo,
  getCityStructure,
} from "@/lib/apiClient";
import {
  useCityAdmin,
  useCityAdminStructure,
  useAvailableModels,
  useUpdateCity,
  useUpdateCityStructure,
  useRefreshCityUrls,
  useRefreshCityMetadata,
  useLoadCityData,
  useRestructureCity,
  useReloadQueryConfig,
  useReloadAllGeographicQueryConfigs,
  useReExtractLeaders,
  useRecreateStructureFromQueryConfigs,
  useCreateCityLeader,
  useUpdateCityLeader,
  useDeleteCityLeader,
  useCityMetricOrdering,
} from "@/lib/hooks/useCityAdmin";
import { pickDefaultModelKey } from "@/lib/modelDefaults";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import DatasetsList from "@/components/DatasetsList";
import Loader from "./Loader";
import MetricActions from "./MetricActions";
import MetricEditModal from "./MetricEditModal";
import MetricChartsModal from "./MetricChartsModal";
import MetricOrderEditor from "./MetricOrderEditor";
import RunAllMetricsModal from "./RunAllMetricsModal";
import AnomalySparkline from "./AnomalySparkline";
import AnomalyChart from "./AnomalyChart";
import {
  useDeleteMetric,
  useExecuteMetric,
  useMetric,
} from "@/lib/hooks/useMetrics";
import {
  useAnomalies,
  useAnomalyDetail,
} from "@/lib/hooks/useAnomalies";
import styles from "./CityDataAdmin.module.css";
import metricStyles from "./MetricsAdmin.module.css";

interface CityData {
  id: number;
  name: string;
  city_name?: string;
  state?: string;
  country?: string;
  population?: number;
  main_domain?: string;
  main_portal_url?: string;
  all_portal_urls?: string[];
  is_active: boolean;
  datasets_count?: number;
  vector_db_points?: number;
  vector_db_size_mb?: number;
  last_fetch_at?: string;
  last_fetch_status?: string;
  last_fetch_error?: string;
  structure_status?: string;
  metrics?: Metric[];
  geographic_structures?: GeographicStructure[];
  governance_structures?: GovernanceStructure[];
}

interface Metric {
  id: number;
  metric_name: string;
  metric_key: string;
  category?: string;
  subcategory?: string;
  last_execution_status?: string;
  last_execution_at?: string | null;
  most_recent_data_date?: string | null;
  freshness?: {
    update_frequency?: string;
    lag_days?: number;
    is_stale?: boolean;
    date_grouping_level?: string;
  };
  most_recent_period_total?: number | null;
  item_noun?: string;
  /** Active/inactive row counts (charts, data points, etc.) – same as MetricsAdmin */
  record_counts?: {
    total_active?: number;
    total_inactive?: number;
    active_data_points?: number;
    inactive_data_points?: number;
    [key: string]: unknown;
  } | null;
}

interface GeographicStructure {
  id?: number;
  structure_name?: string;
  structure_type?: string;
  identifier_field?: string;
}

interface GovernanceStructure {
  id?: number;
  body_name?: string;
  structure_type?: string;
  selection_method?: string;
}

interface CityStructure {
  geographic_structures?: GeographicStructure[];
  governance_structures?: any[];
  leaders?: any[];
  query_configs?: any[];
  shapefiles?: any[];
  mappings?: any[];
  district_field?: string | null;
  district_fields?: string[];
}

interface CityDataAdminProps {
  cityId: number;
  onBack?: () => void;
  embedded?: boolean;
}

export default function CityDataAdmin({
  cityId,
  onBack,
  embedded = false,
}: CityDataAdminProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  
  // React Query hooks for data fetching
  const { data: cityData, isLoading: loadingCity, error: cityError, refetch: refetchCity } = useCityAdmin(cityId);
  const { data: structureData, isLoading: loadingStructure, refetch: refetchStructure } = useCityAdminStructure(cityId);
  const { data: availableModelsData } = useAvailableModels();
  
  // Fetch metric ordering for this city (same as dashboard)
  const { data: orderingData } = useCityMetricOrdering(cityId);
  
  // React Query mutation hooks
  const updateCityMutation = useUpdateCity();
  const updateCityStructureMutation = useUpdateCityStructure();
  const refreshCityUrlsMutation = useRefreshCityUrls();
  const refreshCityMetadataMutation = useRefreshCityMetadata();
  const loadCityDataMutation = useLoadCityData();
  const restructureCityMutation = useRestructureCity();
  const reloadQueryConfigMutation = useReloadQueryConfig();
  const reloadAllGeographicQueryConfigsMutation = useReloadAllGeographicQueryConfigs();
  const reExtractLeadersMutation = useReExtractLeaders();
  const recreateStructureFromQueryConfigsMutation = useRecreateStructureFromQueryConfigs();
  const createCityLeaderMutation = useCreateCityLeader();
  const updateCityLeaderMutation = useUpdateCityLeader();
  const deleteCityLeaderMutation = useDeleteCityLeader();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"data" | "structure" | "metrics" | "datasets">("data");

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    state: "",
    country: "",
    population: "",
    main_domain: "",
    main_portal_url: "",
    all_portal_urls: "",
    is_active: false,
  });

  const [structureFormData, setStructureFormData] = useState({
    leaders: "",
    query_configs: "",
    district_fields: [] as string[],
  });

  const [editingLeader, setEditingLeader] = useState<{
    index: number;
    data: any;
    isNew: boolean;
  } | null>(null);

  const [selectedModel, setSelectedModel] = useState<string>("");
  const [hoveredQuery, setHoveredQuery] = useState<{ config: any; x: number; y: number } | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  // Note: model defaults are centralized in `lib/modelDefaults.ts`

  // Metric action modals state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalMetricId, setEditModalMetricId] = useState<number | null>(null);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [chartsMetricId, setChartsMetricId] = useState<number | null>(null);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executeMetricId, setExecuteMetricId] = useState<number | null>(null);
  const [executePeriodType, setExecutePeriodType] = useState<string>("day");
  const [executeStartDate, setExecuteStartDate] = useState<string>("");
  const [executeEndDate, setExecuteEndDate] = useState<string>("");
  const [anomaliesOpen, setAnomaliesOpen] = useState(false);
  const [runAllMetricsOpen, setRunAllMetricsOpen] = useState(false);
  const [anomaliesMetricId, setAnomaliesMetricId] = useState<number | null>(null);
  const [anomalyPeriodFilter, setAnomalyPeriodFilter] = useState<string>("all");
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<number | null>(null);

  // Metric queries - fetch all results (both anomalies and non-anomalies)
  // Pass period_type to API for server-side filtering (more efficient than client-side)
  // Normalize options to remove undefined values for proper query key serialization
  const anomaliesQueryOptions = anomaliesMetricId 
    ? (() => {
        const opts: { metric_id: number; period_type?: string; limit: number } = {
          metric_id: anomaliesMetricId,
          limit: 50
        };
        if (anomalyPeriodFilter !== "all") {
          opts.period_type = anomalyPeriodFilter;
        }
        return opts;
      })()
    : undefined;
  const anomaliesQuery = useAnomalies(anomaliesQueryOptions);
  const metricQuery = useMetric(anomaliesMetricId);
  const anomalyDetailQuery = useAnomalyDetail(selectedAnomalyId);
  const deleteMetricMutation = useDeleteMetric();
  const executeMetricMutation = useExecuteMetric();
  const anomaliesData = anomaliesQuery.data ?? null;
  
  // Refetch anomalies when period filter changes
  // React Query should auto-refetch when query key changes, but we'll manually trigger to ensure it works
  useEffect(() => {
    if (anomaliesMetricId && anomaliesOpen) {
      anomaliesQuery.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anomalyPeriodFilter]);

  const metricData = metricQuery.data ?? null;
  const anomalyDetail = anomalyDetailQuery.data ?? null;

  // Metric action handlers
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
    const today = new Date();
    const startDate = new Date(2023, 0, 1);
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
          refetchCity();
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

  const openViewAnomalies = (metricId: number) => {
    setAnomaliesMetricId(metricId);
    setAnomalyPeriodFilter("all");
    setAnomaliesOpen(true);
  };

  const closeViewAnomalies = () => {
    setAnomaliesOpen(false);
    setAnomaliesMetricId(null);
    setAnomalyPeriodFilter("all");
    setSelectedAnomalyId(null);
  };

  const openAnomalyChart = (anomalyId: number) => {
    setSelectedAnomalyId(anomalyId);
  };

  const closeAnomalyChart = () => {
    setSelectedAnomalyId(null);
  };

  // Get filtered results for navigation
  const getFilteredAnomalies = () => {
    if (!anomaliesData) return [];
    // Since we're now filtering server-side, we can just return all results
    // But keep client-side filter as fallback for edge cases
    if (anomalyPeriodFilter === "all") {
      return anomaliesData.results;
    }
    // Double-check client-side (shouldn't be needed if server filtering works)
    return anomaliesData.results.filter((anomaly: any) => anomaly.period_type === anomalyPeriodFilter);
  };

  // Navigation functions
  const goToNextAnomaly = () => {
    const filtered = getFilteredAnomalies();
    if (!selectedAnomalyId || filtered.length === 0) return;
    
    const currentIndex = filtered.findIndex((a: any) => a.id === selectedAnomalyId);
    if (currentIndex === -1) return;
    
    const nextIndex = (currentIndex + 1) % filtered.length;
    const nextId = filtered[nextIndex].id;
    if (nextId !== null && nextId !== undefined) {
      setSelectedAnomalyId(nextId);
    }
  };

  const goToPreviousAnomaly = () => {
    const filtered = getFilteredAnomalies();
    if (!selectedAnomalyId || filtered.length === 0) return;
    
    const currentIndex = filtered.findIndex((a: any) => a.id === selectedAnomalyId);
    if (currentIndex === -1) return;
    
    const prevIndex = currentIndex === 0 ? filtered.length - 1 : currentIndex - 1;
    const prevId = filtered[prevIndex].id;
    if (prevId !== null && prevId !== undefined) {
      setSelectedAnomalyId(prevId);
    }
  };

  // Initialize form data when city data loads
  useEffect(() => {
    if (cityData) {
      setFormData({
        name: cityData.city_name || cityData.name || "",
        state: cityData.state || "",
        country: cityData.country || "",
        population: cityData.population?.toString() || "",
        main_domain: cityData.main_domain || "",
        main_portal_url: cityData.main_portal_url || "",
        all_portal_urls: JSON.stringify(cityData.all_portal_urls || [], null, 2),
        is_active: cityData.is_active || false,
      });
    }
  }, [cityData]);

  // Initialize structure form data when structure data loads
  useEffect(() => {
    if (structureData) {
      const districtFields = Array.isArray(structureData.district_fields)
        ? structureData.district_fields
        : (structureData.district_field ? [structureData.district_field] : []);

      setStructureFormData({
        leaders: JSON.stringify(structureData.leaders || [], null, 2),
        query_configs: JSON.stringify(structureData.query_configs || [], null, 2),
        district_fields: districtFields,
      });
    }
  }, [structureData]);

  // Initialize selected model when available models load
  useEffect(() => {
    if (availableModelsData) {
      const defaultKey = pickDefaultModelKey(availableModelsData);
      if (defaultKey) {
        setSelectedModel(defaultKey);
      }
    }
  }, [availableModelsData]);

  const loading = loadingCity || loadingStructure;
  const cityDataTyped = cityData as CityData | null;
  const structureDataTyped = structureData as CityStructure | null;
  const availableModels = availableModelsData || [];
  const errorMessage = error || (cityError as Error)?.message || null;

  // Build ordering map from saved ordering data (same as dashboard)
  const orderingMap = useMemo(() => {
    const map = new Map<number, { categoryOrder: number; metricOrder: number; categoryName: string }>();
    if (orderingData?.orderings) {
      orderingData.orderings.forEach((o) => {
        if (o.metric_id) {
          map.set(o.metric_id, {
            categoryOrder: o.category_order,
            metricOrder: o.metric_order,
            categoryName: o.category_name,
          });
        }
      });
    }
    return map;
  }, [orderingData]);

  const handleSaveCityData = async () => {
    try {
      setSaving(true);
      setError(null);

      // Parse all_portal_urls JSON
      let allUrls: string[] = [];
      try {
        if (formData.all_portal_urls.trim()) {
          allUrls = JSON.parse(formData.all_portal_urls);
        }
      } catch (e) {
        throw new Error("Invalid JSON in All Portal URLs field");
      }

      const updateData = {
        city_name: formData.name.trim() || null,
        state: formData.state.trim() || null,
        country: formData.country.trim() || null,
        population: formData.population ? parseInt(formData.population) : null,
        main_domain: formData.main_domain.trim() || null,
        main_portal_url: formData.main_portal_url.trim() || null,
        all_portal_urls: allUrls,
        is_active: formData.is_active,
      };

      await updateCityMutation.mutateAsync({ cityId, data: updateData });
      alert("City data saved successfully!");
      await refetchCity();
    } catch (err: any) {
      setError(err.message || "Failed to save city data");
      alert("Failed to save city data: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStructure = async () => {
    try {
      setSaving(true);
      setError(null);

      // Parse JSON from textareas
      let leaders, query_configs;

      try {
        leaders = structureFormData.leaders.trim()
          ? JSON.parse(structureFormData.leaders)
          : [];
      } catch (e) {
        throw new Error("Invalid JSON in City Elected Officials");
      }

      try {
        query_configs = structureFormData.query_configs.trim()
          ? JSON.parse(structureFormData.query_configs)
          : [];
      } catch (e) {
        throw new Error("Invalid JSON in Query Configs");
      }

      const structureConfig = {
        city_id: cityId,
        geographic_structures: structureDataTyped?.geographic_structures || [],
        governance_structures: [], // No longer used in UI
        leaders,
        query_configs,
        mappings: structureDataTyped?.mappings || [],
        district_fields: structureFormData.district_fields || [],
      };

      await updateCityStructureMutation.mutateAsync({ cityId, data: structureConfig });
      alert("City structure saved successfully!");
      await refetchCity();
      await refetchStructure();
    } catch (err: any) {
      setError(err.message || "Failed to save city structure");
      alert("Failed to save city structure: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshUrls = async () => {
    if (!confirm("Refresh dataset URLs for this city? This will fetch the latest URLs from the portal.")) {
      return;
    }

    try {
      const result = await refreshCityUrlsMutation.mutateAsync(cityId);
      notifyJobCreated(result.job_id);
      alert(`URL refresh started! Job ID: ${result.job_id}\n\nYou can monitor progress in the jobs dropdown.`);
      setTimeout(() => refetchCity(), 2000);
    } catch (err: any) {
      alert("Failed to refresh URLs: " + err.message);
    }
  };

  const handleRefreshMetadata = async () => {
    if (!confirm("Re-load datasets and metadata for this city? This will fetch the latest URLs and detailed metadata for all datasets.")) {
      return;
    }

    try {
      const result = await loadCityDataMutation.mutateAsync({
        data: {
          city_ids: [cityId],
          fetch_urls: true,
          fetch_metadata: true,
          refresh: false,
        },
      });
      notifyJobCreated(result.job_id);
      alert(`Datasets and metadata reload started! Job ID: ${result.job_id}\n\nYou can monitor progress in the jobs dropdown.`);
      setTimeout(() => refetchCity(), 2000);
    } catch (err: any) {
      alert("Failed to reload datasets and metadata: " + err.message);
    }
  };

  const handleRestructure = async () => {
    if (
      !confirm(
        "Re-structure this city? This will DELETE all existing structure data and run a fresh AI analysis. This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const result = await restructureCityMutation.mutateAsync({
        cityId,
        model: selectedModel || undefined,
      });
      notifyJobCreated(result.job_id);
      alert(`Re-structuring started! Job ID: ${result.job_id}\n\nYou can monitor progress in the jobs badge at the top of the page.`);
    } catch (err: any) {
      alert("Failed to start re-structure: " + err.message);
    }
  };

  const handleRecreateStructureFromQueryConfigs = async () => {
    if (
      !confirm(
        "Re-create structure from query configs? This will:\n\n" +
        "1. DELETE all existing shapefiles, leaders, geographic structures, governance structures, and mappings\n" +
        "2. Re-download shapefiles from geographic query configs\n" +
        "3. Re-extract leaders from leaders query configs\n\n" +
        "Query configs will be preserved. This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const result = await recreateStructureFromQueryConfigsMutation.mutateAsync(cityId);
      
      const message = [
        `Structure re-created successfully for ${result.city_name}!`,
        ``,
        `Deleted:`,
        `  - ${result.deleted.shapefiles} shapefiles`,
        `  - ${result.deleted.leaders} leaders`,
        `  - ${result.deleted.geographic_structures} geographic structures`,
        `  - ${result.deleted.governance_structures} governance structures`,
        `  - ${result.deleted.mappings} mappings`,
        ``,
        `Re-created:`,
        `  - ${result.geographic_reload.shapefiles_created} shapefiles from geographic query configs`,
        `  - ${result.leaders_reload.leaders_created} leaders from leaders query configs`,
      ].join("\n");
      
      alert(message);
      await refetchStructure();
      await refetchCity();
    } catch (err: any) {
      setError(err.message || "Failed to recreate structure from query configs");
      alert("Failed to recreate structure from query configs: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReloadOfficials = async () => {
    try {
      // Find ALL elected officials query configs (including Mayor)
      const leadersConfigs = structureDataTyped?.query_configs?.filter(
        (qc: any) => qc.structure_type === "leaders"
      ) || [];
      
      if (leadersConfigs.length === 0) {
        alert("No elected officials query configurations found. Please run re-structure first.");
        return;
      }

      // Reload all leaders query configs
      const results = [];
      let totalRecords = 0;
      for (const config of leadersConfigs) {
        try {
          if (!config.id) {
            results.push({ config: config.structure_name, error: "No config ID" });
            continue;
          }
          const result = await reloadQueryConfigMutation.mutateAsync({
            cityId,
            configId: config.id,
          });
          totalRecords += result.record_count || 0;
          results.push({ config: config.structure_name, result, record_count: result.record_count || 0 });
        } catch (err: any) {
          results.push({ config: config.structure_name, error: err.message });
        }
      }
      
      // Reload structure data to get updated query_output
      await refetchStructure();
      
      // Show summary
      const successCount = results.filter(r => !r.error).length;
      const message = `Reloaded ${successCount} of ${leadersConfigs.length} leaders query configs (${totalRecords} total records):\n\n` +
        results.map(r => `- ${r.config}: ${r.error || `${r.record_count} records`}`).join('\n');
      alert(message);
    } catch (err: any) {
      alert("Failed to reload elected officials: " + err.message);
    }
  };

  if (loading) {
    return (
      <div
        className={styles.container}
        style={{
          padding: embedded ? "24px" : "48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
        }}
      >
        <Loader size="sm" color="dark" />
        <span>Loading city data...</span>
      </div>
    );
  }

  if (errorMessage && !cityDataTyped) {
    return (
      <div
        className={styles.container}
        style={{
          padding: embedded ? "24px" : "48px",
          textAlign: "center",
          color: "#dc2626",
        }}
      >
        <p>Error loading city data: {errorMessage}</p>
        <button onClick={() => refetchCity()} style={{ marginTop: "16px", padding: "8px 16px" }}>
          Retry
        </button>
      </div>
    );
  }

  if (!cityDataTyped) {
    return null;
  }

  const lastFetch = cityDataTyped.last_fetch_at
    ? new Date(cityDataTyped.last_fetch_at).toLocaleString()
    : "Never";
  const vectorSize = cityDataTyped.vector_db_size_mb
    ? `${cityDataTyped.vector_db_size_mb.toFixed(2)} MB`
    : "N/A";
  const metricsCount = cityDataTyped.metrics?.length || 0;

  return (
    <div className={`${styles.container} ${embedded ? styles.containerEmbedded : ""}`}>
      {onBack && (
        <button
          onClick={onBack}
          style={{
            marginBottom: "16px",
            padding: "8px 16px",
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          ← Back to City List
        </button>
      )}

      {/* Tabs */}
      <div
        className={`${styles.tabsContainer} ${embedded ? styles.tabsContainerEmbedded : ""}` }
      >
        <button
          className={`${styles.tabBtn} ${activeTab === "data" ? styles.tabBtnActive : ""}` }
          onClick={() => setActiveTab("data")}
        >
          City Data
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "structure" ? styles.tabBtnActive : ""}` }
          onClick={() => setActiveTab("structure")}
        >
          City Structure
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "metrics" ? styles.tabBtnActive : ""}` }
          onClick={() => setActiveTab("metrics")}
        >
          Metrics
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "datasets" ? styles.tabBtnActive : ""}` }
          onClick={() => setActiveTab("datasets")}
        >
          Datasets
        </button>
      </div>

      {/* City Data Tab */}
      {activeTab === "data" && (
        <div>
          {/* Statistics Section */}
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Statistics</h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "12px",
              }}
            >
              <div style={{ padding: "10px 12px", background: "var(--bg-secondary)", borderRadius: "4px" }}>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "2px" }}>
                  Datasets
                </div>
                <div style={{ fontSize: "20px", fontWeight: 600 }}>{cityDataTyped.datasets_count || 0}</div>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--bg-secondary)", borderRadius: "4px" }}>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "2px" }}>
                  Metrics
                </div>
                <div style={{ fontSize: "20px", fontWeight: 600 }}>{metricsCount}</div>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--bg-secondary)", borderRadius: "4px" }}>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "2px" }}>
                  Vector DB Points
                </div>
                <div style={{ fontSize: "20px", fontWeight: 600 }}>{cityDataTyped.vector_db_points || "N/A"}</div>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--bg-secondary)", borderRadius: "4px" }}>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "2px" }}>
                  Vector DB Size
                </div>
                <div style={{ fontSize: "20px", fontWeight: 600 }}>{vectorSize}</div>
              </div>
            </div>
          </div>

          {/* City Information Section */}
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h3 style={{ margin: 0 }}>City Information</h3>
              <button
                onClick={handleSaveCityData}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  background: "var(--brand-primary)",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 500,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
            <table
              className={styles.editableTable}
              style={{ width: "100%", borderCollapse: "collapse" }}
            >
              <tbody>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      background: "var(--bg-secondary)",
                      fontWeight: 600,
                      width: "200px",
                    }}
                  >
                    Name
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "4px",
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      background: "var(--bg-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    State
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "4px",
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      background: "var(--bg-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Country
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "4px",
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      background: "var(--bg-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Population
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <input
                      type="text"
                      value={formData.population}
                      onChange={(e) => setFormData({ ...formData, population: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "4px",
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      background: "var(--bg-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Main Domain
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <input
                      type="text"
                      value={formData.main_domain}
                      onChange={(e) => setFormData({ ...formData, main_domain: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "4px",
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      background: "var(--bg-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Portal URL
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <input
                      type="text"
                      value={formData.main_portal_url}
                      onChange={(e) => setFormData({ ...formData, main_portal_url: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "4px",
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }}
                    />
                    {formData.main_portal_url && (
                      <a
                        href={formData.main_portal_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginLeft: "8px", color: "var(--brand-primary)" }}
                      >
                        Open ↗
                      </a>
                    )}
                  </td>
                </tr>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      background: "var(--bg-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    All Portal URLs
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <textarea
                      value={formData.all_portal_urls}
                      onChange={(e) =>
                        setFormData({ ...formData, all_portal_urls: e.target.value })
                      }
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "6px",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "4px",
                        fontFamily: "monospace",
                        fontSize: "12px",
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      JSON array of URLs
                    </div>
                  </td>
                </tr>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      background: "var(--bg-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Is Active
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      />
                      <span>Active</span>
                    </label>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Data Refresh Section */}
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h3 style={{ margin: 0 }}>Data Refresh</h3>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleRefreshUrls}
                  style={{
                    padding: "8px 16px",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-primary)",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Refresh URLs
                </button>
                <button
                  onClick={handleRefreshMetadata}
                  style={{
                    padding: "8px 16px",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-primary)",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Re-load datasets and metadata
                </button>
              </div>
            </div>
            <table className={styles.dataTable} style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      background: "var(--bg-secondary)",
                      fontWeight: 600,
                      width: "200px",
                    }}
                  >
                    Last Fetch
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    {lastFetch}
                  </td>
                </tr>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      background: "var(--bg-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Last Status
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 500,
                        background:
                          cityDataTyped.last_fetch_status === "success"
                            ? "#d1fae5"
                            : cityDataTyped.last_fetch_status === "error"
                            ? "#fee2e2"
                            : "#f3f4f6",
                        color:
                          cityDataTyped.last_fetch_status === "success"
                            ? "#065f46"
                            : cityDataTyped.last_fetch_status === "error"
                            ? "#991b1b"
                            : "#374151",
                      }}
                    >
                      {cityDataTyped.last_fetch_status || "N/A"}
                    </span>
                  </td>
                </tr>
                {cityDataTyped.last_fetch_error && (
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "12px",
                        background: "var(--bg-secondary)",
                        fontWeight: 600,
                      }}
                    >
                      Last Error
                    </th>
                    <td
                      style={{
                        padding: "12px",
                        borderBottom: "1px solid var(--border-primary)",
                        color: "#dc2626",
                        fontSize: "12px",
                      }}
                    >
                      {cityDataTyped.last_fetch_error}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* City Structure Tab */}
      {activeTab === "structure" && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>City Structure</h3>
              {cityDataTyped.structure_status && (
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 500,
                    background:
                      cityDataTyped.structure_status === "complete"
                        ? "#d1fae5"
                        : cityDataTyped.structure_status === "partial"
                        ? "#fef3c7"
                        : "#fee2e2",
                    color:
                      cityDataTyped.structure_status === "complete"
                        ? "#065f46"
                        : cityDataTyped.structure_status === "partial"
                        ? "#92400e"
                        : "#991b1b",
                  }}
                >
                  Status: {(cityDataTyped.structure_status || "not_started").toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              padding: "12px 16px",
              background: "var(--bg-secondary)",
              borderRadius: "8px",
              marginBottom: "24px",
              border: "1px solid var(--border-primary)",
            }}
          >
            <button
              onClick={handleRefreshMetadata}
              style={{
                padding: "8px 16px",
                background: "var(--brand-primary)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
              title="Re-load datasets and metadata for this city (fetches latest URLs and detailed metadata for all datasets)"
            >
              <span>🔄</span>
              <span>Re-load datasets and metadata</span>
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 500 }}>
                Model:
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{
                  padding: "6px 12px",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "4px",
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  fontSize: "12px",
                  minWidth: "200px",
                }}
              >
                {availableModels.length === 0 ? (
                  <option value="">Loading models...</option>
                ) : (
                  availableModels.map((group) =>
                    group.models.map((model) => (
                      <option 
                        key={model.key} 
                        value={model.key}
                        disabled={!model.is_available}
                      >
                        {group.emoji} {model.name}{!model.is_available ? " (API key not configured)" : ""}
                      </option>
                    ))
                  )
                )}
              </select>
            </div>
            <button
              onClick={handleRestructure}
              disabled={!selectedModel}
              style={{
                padding: "8px 16px",
                background: selectedModel ? "#f59e0b" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: selectedModel ? "pointer" : "not-allowed",
                fontWeight: 500,
                opacity: selectedModel ? 1 : 0.6,
              }}
              title={selectedModel ? "Re-structure this city using the selected model" : "Please select a model"}
            >
              🔄 Re-structure
            </button>
            <button
              onClick={handleRecreateStructureFromQueryConfigs}
              disabled={saving || !structureDataTyped?.query_configs || structureDataTyped.query_configs.length === 0}
              style={{
                padding: "8px 16px",
                background: (structureDataTyped?.query_configs && structureDataTyped.query_configs.length > 0) ? "#10b981" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: (structureDataTyped?.query_configs && structureDataTyped.query_configs.length > 0) && !saving ? "pointer" : "not-allowed",
                fontWeight: 500,
                opacity: (structureDataTyped?.query_configs && structureDataTyped.query_configs.length > 0) && !saving ? 1 : 0.6,
              }}
              title={
                !structureDataTyped?.query_configs || structureDataTyped.query_configs.length === 0
                  ? "No query configs found. Please run re-structure first."
                  : "Re-create structure from query configs (delete existing data and re-download shapefiles and leaders)"
              }
            >
              {saving ? "Re-creating..." : "🔄 Re-create from Query Configs"}
            </button>
            <button
              onClick={handleSaveStructure}
              disabled={saving}
              style={{
                padding: "8px 16px",
                background: "var(--brand-primary)",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 500,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving..." : "Save Structure"}
            </button>
          </div>

          {/* Geographic Structures Box */}
          {(() => {
            const geographicConfigs = structureData?.query_configs?.filter(
              (qc: any) => qc.structure_type === "geographic"
            ) || [];
            
            return (
              <div
                style={{
                  marginBottom: "24px",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "8px",
                  padding: "16px",
                  background: "var(--bg-primary)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    Geographic Structures {geographicConfigs.length > 0 ? `(${geographicConfigs.length})` : ""}
                    {geographicConfigs.map((config: any) => {
                      const confidence = config.metadata?.confidence || config.confidence;
                      if (confidence) {
                        const confidencePercent = Math.round(confidence * 100);
                        return (
                          <span
                            key={config.id}
                            style={{
                              padding: "2px 8px",
                              borderRadius: "12px",
                              fontSize: "11px",
                              fontWeight: 600,
                              background: confidence >= 0.8 ? "#d1fae5" : confidence >= 0.7 ? "#fef3c7" : "#fee2e2",
                              color: confidence >= 0.8 ? "#065f46" : confidence >= 0.7 ? "#92400e" : "#991b1b",
                            }}
                          >
                            Confidence: {confidencePercent}%
                          </span>
                        );
                      }
                      return null;
                    })}
                  </h4>
                  <button
                    onClick={async () => {
                      try {
                        if (geographicConfigs.length === 0) {
                          alert("No geographic structures query configurations found. Please run re-structure first.");
                          return;
                        }
                        const result = await reloadAllGeographicQueryConfigsMutation.mutateAsync(cityId);
                        await refetchStructure();
                        let message = `Reloaded ${result.reloaded} of ${result.total_configs} geographic structures.\n\n`;
                        message += `Shapefiles created: ${result.shapefiles_created}\n\n`;
                        if (result.results.length > 0) {
                          message += "Results:\n";
                          result.results.forEach((r: any) => {
                            message += `- ${r.structure_name}: ${r.status === "success" ? `${r.record_count} records${r.shapefile_id ? `, shapefile ID ${r.shapefile_id}` : ""}` : `Error: ${r.error}`}\n`;
                          });
                        }
                        alert(message);
                      } catch (err: any) {
                        alert("Failed to reload geographic structures: " + err.message);
                      }
                    }}
                    disabled={geographicConfigs.length === 0}
                    style={{
                      padding: "6px 12px",
                      background: geographicConfigs.length > 0 ? "var(--brand-primary)" : "#ccc",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: geographicConfigs.length > 0 ? "pointer" : "not-allowed",
                      fontWeight: 500,
                      fontSize: "12px",
                    }}
                    title={geographicConfigs.length > 0 ? "Re-run all geographic queries and store as shapefiles" : "No query configurations found"}
                  >
                    Re-load All ({geographicConfigs.length})
                  </button>
                </div>
                {geographicConfigs.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", padding: "12px" }}>
                    No geographic structures query configurations found. Please run re-structure first.
                  </div>
                ) : (
                  geographicConfigs.map((geographicConfig: any, index: number) => {
                    const geographicData = geographicConfig?.query_output || [];
                    return (
                      <div key={geographicConfig.id || index} style={{ marginBottom: index < geographicConfigs.length - 1 ? "16px" : "0" }}>
                        <div style={{ marginBottom: "8px", fontWeight: 600, fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              cursor: geographicConfig.query ? "pointer" : "default",
                              textDecoration: geographicConfig.query ? "underline" : "none",
                              color: geographicConfig.query ? "var(--brand-primary)" : "var(--text-primary)",
                            }}
                            onClick={(e) => {
                              if (geographicConfig.query) {
                                setHoveredQuery({
                                  config: geographicConfig,
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                              }
                            }}
                            onMouseEnter={(e) => {
                              if (geographicConfig.query) {
                                setHoveredQuery({
                                  config: geographicConfig,
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                              }
                            }}
                            onMouseLeave={() => {
                              // Don't clear on mouse leave - let click handle it
                            }}
                            title={geographicConfig.query ? "Click or hover to view query" : ""}
                          >
                            {geographicConfig.structure_name || `Geographic Structure ${index + 1}`}
                          </span>
                          {(() => {
                            const confidence = geographicConfig.metadata?.confidence || geographicConfig.confidence;
                            if (confidence) {
                              const confidencePercent = Math.round(confidence * 100);
                              return (
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "12px",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    background: confidence >= 0.8 ? "#d1fae5" : confidence >= 0.7 ? "#fef3c7" : "#fee2e2",
                                    color: confidence >= 0.8 ? "#065f46" : confidence >= 0.7 ? "#92400e" : "#991b1b",
                                  }}
                                >
                                  Confidence: {confidencePercent}%
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <textarea
                          value={JSON.stringify(geographicData, null, 2)}
                          readOnly
                          rows={8}
                          style={{
                            width: "100%",
                            padding: "8px",
                            border: "1px solid var(--border-primary)",
                            borderRadius: "4px",
                            fontFamily: "monospace",
                            fontSize: "12px",
                            background: "var(--bg-secondary)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                          {geographicData.length > 0
                            ? `${geographicData.length} geographic feature${geographicData.length !== 1 ? "s" : ""} found`
                            : "No data. Click 'Re-load All' to fetch from query."}
                        </div>
                        {index < geographicConfigs.length - 1 && (
                          <hr style={{ margin: "12px 0", border: "none", borderTop: "1px solid var(--border-primary)" }} />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}

          {/* District Field Names Box */}
          <div
            style={{
              marginBottom: "24px",
              border: "1px solid var(--border-primary)",
              borderRadius: "8px",
              padding: "16px",
              background: "var(--bg-primary)",
            }}
          >
            <h4 style={{ margin: "0 0 12px 0" }}>
              District Field Names
            </h4>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "12px" }}>
              List of field names used for districts in different endpoints. Some endpoints may use different field names (e.g., "supervisor_district" vs "sup_dist_num"). 
              <strong>Add ALL field names</strong> that identify districts in this city's datasets. The system will automatically use whichever field exists in each dataset.
            </div>
            {structureFormData.district_fields.length > 0 && (
              <div style={{ 
                padding: "8px", 
                background: "var(--bg-secondary)", 
                borderRadius: "4px",
                fontSize: "11px",
                color: "var(--text-secondary)",
                marginBottom: "8px"
              }}>
                Currently configured: {structureFormData.district_fields.filter(f => f.trim()).join(", ") || "none"}
              </div>
            )}
            {structureFormData.district_fields.length === 0 && (
              <div style={{ 
                padding: "8px", 
                background: "var(--bg-secondary)", 
                borderRadius: "4px",
                fontSize: "12px",
                color: "var(--text-secondary)",
                marginBottom: "8px"
              }}>
                No district fields configured. Click "Add Field Name" to add district fields.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {structureFormData.district_fields.map((field, index) => (
                <div key={index} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="text"
                    value={field}
                    onChange={(e) => {
                      const newFields = [...structureFormData.district_fields];
                      newFields[index] = e.target.value;
                      setStructureFormData({ ...structureFormData, district_fields: newFields });
                    }}
                    placeholder="e.g., supervisor_district"
                    style={{
                      flex: 1,
                      padding: "6px 12px",
                      border: "1px solid var(--border-primary)",
                      borderRadius: "4px",
                      background: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                      fontSize: "12px",
                    }}
                  />
                  <button
                    onClick={() => {
                      const newFields = structureFormData.district_fields.filter((_, i) => i !== index);
                      setStructureFormData({ ...structureFormData, district_fields: newFields });
                    }}
                    style={{
                      padding: "6px 12px",
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  setStructureFormData({
                    ...structureFormData,
                    district_fields: [...structureFormData.district_fields, ""],
                  });
                }}
                style={{
                  padding: "6px 12px",
                  background: "var(--brand-primary)",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px",
                  alignSelf: "flex-start",
                }}
              >
                + Add Field Name
              </button>
            </div>
          </div>

          {/* Elected Officials Box */}
          {(() => {
            // Get ALL leaders query configs (not just the first one)
            // This includes both "City Council Members" and "Mayor" query configs
            const leadersConfigs = structureData?.query_configs?.filter(
              (qc: any) => qc.structure_type === "leaders"
            ) || [];

            // Get stored leaders early so we can use them when building officialsData
            const storedLeaders = structureData?.leaders || [];
            
            // Combine query_output and manual_data from all leaders configs
            const officialsData: any[] = [];
            const officialsDataMap = new Map<string, any>(); // Track by name+district to avoid duplicates
            
            leadersConfigs.forEach((config: any) => {
              // Add query_output entries (regular dataset entries)
              if (config.query_output && Array.isArray(config.query_output)) {
                config.query_output.forEach((official: any) => {
                  const key = `${(official.name || "").toLowerCase()}_${official.district || "null"}`;
                  if (!officialsDataMap.has(key)) {
                    officialsDataMap.set(key, official);
                    officialsData.push(official);
                  }
                });
              }
              
              // Add manual_data entries (like Mayor) - these don't have query_output
              const manualData = config.metadata?.manual_data || config.manual_data;
              if (manualData) {
                const dataArray = Array.isArray(manualData) ? manualData : [manualData];
                dataArray.forEach((official: any) => {
                  const key = `${(official.name || "").toLowerCase()}_${official.district || "null"}`;
                  if (!officialsDataMap.has(key)) {
                    officialsDataMap.set(key, official);
                    officialsData.push(official);
                  }
                });
              }
            });

            // Also add stored leaders that aren't in query_output/manual_data
            // This ensures we can always edit stored leaders even if they're not in the current query output
            // We'll mark these with a special flag so they're always recognized as stored
            storedLeaders.forEach((leader: any) => {
              const key = `${(leader.name || "").toLowerCase()}_${leader.district || "null"}`;
              if (!officialsDataMap.has(key)) {
                // Create an official entry from stored leader
                // Include the stored leader's ID so it can be matched properly
                const officialEntry = {
                  name: leader.name,
                  title: leader.title,
                  district: leader.district,
                  _storedLeaderId: leader.id, // Internal flag to mark this as a stored leader
                  _isStoredLeader: true, // Flag to indicate this came from stored leaders
                  ...leader.metadata, // Include all metadata fields
                };
                officialsDataMap.set(key, officialEntry);
                officialsData.push(officialEntry);
              }
            });

            // Sort officials: Mayor/district 0 first, then by district number, then by name
            officialsData.sort((a: any, b: any) => {
              const aDistrict = a.district !== undefined && a.district !== null ? Number(a.district) : null;
              const bDistrict = b.district !== undefined && b.district !== null ? Number(b.district) : null;
              
              // District 0 (Mayor) goes first
              if (aDistrict === 0 && bDistrict !== 0) return -1;
              if (aDistrict !== 0 && bDistrict === 0) return 1;
              
              // Then sort by district number
              if (aDistrict !== null && bDistrict !== null) {
                if (aDistrict !== bDistrict) return aDistrict - bDistrict;
              } else if (aDistrict !== null) return -1;
              else if (bDistrict !== null) return 1;
              
              // Finally sort by name
              const aName = (a.name || a.alderman || a.supervisor || "").toLowerCase();
              const bName = (b.name || b.alderman || b.supervisor || "").toLowerCase();
              return aName.localeCompare(bName);
            });

            // Use the first leaders config for metadata (identifier_field, etc.)
            // This is typically the council members config, but we'll use it for field names
            const leadersConfig = leadersConfigs[0];
            
            // Helper function to find district field dynamically
            const findDistrictField = (config: any, sampleData: any[]): string | null => {
              // Check metadata for district field
              if (config?.metadata?.district_field) {
                return config.metadata.district_field;
              }
              
              // Check query string for district-related fields (case-insensitive search, but return original case)
              if (config?.query) {
                // Extract field names from SELECT clause
                const selectMatch = config.query.match(/SELECT\s+(.+?)(?:\s+FROM|\s+WHERE|$)/i);
                if (selectMatch) {
                  const fields = selectMatch[1].split(',').map((f: string) => f.trim());
                  // Look for district-related fields
                  const distField = fields.find((f: string) => {
                    const fLower = f.toLowerCase();
                    return fLower.includes('dist') || fLower.includes('ward') || fLower.includes('precinct');
                  });
                  if (distField) {
                    // Prefer numeric variants
                    if (distField.toLowerCase().includes('num') || distField.toLowerCase().includes('dist_num')) {
                      return distField;
                    }
                    // Otherwise return the first match
                    return distField;
                  }
                }
              }
              
              // Check sample data for fields containing "dist" that have numeric values
              if (sampleData && sampleData.length > 0) {
                const sample = sampleData[0];
                const distFields = Object.keys(sample).filter(key => {
                  const keyLower = key.toLowerCase();
                  return (keyLower.includes('dist') || keyLower.includes('ward') || keyLower.includes('precinct')) &&
                    (typeof sample[key] === 'number' || (typeof sample[key] === 'string' && !isNaN(Number(sample[key])) && sample[key] !== ''));
                });
                if (distFields.length > 0) {
                  // Prefer fields with "num" or "dist_num"
                  const preferred = distFields.find(f => {
                    const fLower = f.toLowerCase();
                    return fLower.includes('num') || fLower.includes('dist_num');
                  });
                  return preferred || distFields[0];
                }
              }
              
              return null;
            };
            
            const districtField = findDistrictField(leadersConfig, officialsData);

            // Create a map of stored leaders by name+title+district for quick lookup
            // Use normalized keys to handle variations in spacing, case, etc.
            const storedLeadersMap = new Map<string, any>();
            storedLeaders.forEach((leader: any) => {
              // Normalize the key: trim whitespace, lowercase, handle nulls
              const normalizedName = (leader.name || "").trim().toLowerCase();
              const normalizedTitle = (leader.title || "").trim().toLowerCase();
              // Normalize district value - convert to string and handle 0/null
              const districtValue = leader.district !== null && leader.district !== undefined 
                ? String(leader.district) 
                : "null";
              
              // Primary key: name_title_district
              const key = `${normalizedName}_${normalizedTitle}_${districtValue}`;
              storedLeadersMap.set(key, leader);
              
              // Also create key without title for easier matching: name_district
              const keyNoTitle = `${normalizedName}_${districtValue}`;
              if (!storedLeadersMap.has(keyNoTitle)) {
                storedLeadersMap.set(keyNoTitle, leader);
              }
              
              // Also create alternative keys for fuzzy matching
              // Try with different title variations
              if (normalizedTitle === "supervisor") {
                storedLeadersMap.set(`${normalizedName}_councilmember_${districtValue}`, leader);
              }
              if (normalizedTitle === "councilmember" || normalizedTitle === "council member") {
                storedLeadersMap.set(`${normalizedName}_supervisor_${districtValue}`, leader);
              }
            });
            
            // Get geographic structures for dropdown
            const geographicStructures = structureData?.geographic_structures || [];
            // Get governance structures for dropdown
            const governanceStructures = structureData?.governance_structures || [];
            
            const handleSaveLeader = async (leaderData: any, isNew: boolean) => {
              try {
                setSaving(true);
                setError(null);
                
                // Clean up metadata: remove undefined values and empty strings
                const cleanedMetadata: Record<string, any> = {};
                if (leaderData.metadata) {
                  Object.keys(leaderData.metadata).forEach((key) => {
                    const value = leaderData.metadata[key];
                    if (value !== undefined && value !== null && value !== "") {
                      cleanedMetadata[key] = value;
                    }
                  });
                }
                
                const leaderPayload = {
                  city_id: cityId,
                  name: leaderData.name,
                  title: leaderData.title,
                  district: leaderData.district || null,
                  geographic_structure_id: leaderData.geographic_structure_id || null,
                  governance_structure_id: leaderData.governance_structure_id || null,
                  metadata: cleanedMetadata,
                };
                
                if (isNew) {
                  await createCityLeaderMutation.mutateAsync({
                    cityId,
                    leader: leaderPayload,
                  });
                } else {
                  await updateCityLeaderMutation.mutateAsync({
                    cityId,
                    leaderId: leaderData.id,
                    leader: leaderPayload,
                  });
                }
                
                setEditingLeader(null);
                await refetchCity();
                await refetchStructure();
                alert("Elected official saved successfully!");
              } catch (err: any) {
                setError(err.message || "Failed to save elected official");
                alert("Failed to save elected official: " + err.message);
              } finally {
                setSaving(false);
              }
            };
            
            const handleDeleteLeader = async (leaderId: number) => {
              if (!confirm("Are you sure you want to delete this elected official?")) {
                return;
              }
              
              try {
                setSaving(true);
                setError(null);
                await deleteCityLeaderMutation.mutateAsync({
                  cityId,
                  leaderId,
                });
                await refetchCity();
                await refetchStructure();
                alert("Elected official deleted successfully!");
              } catch (err: any) {
                setError(err.message || "Failed to delete elected official");
                alert("Failed to delete elected official: " + err.message);
              } finally {
                setSaving(false);
              }
            };
            
            return (
              <div
                style={{
                  marginTop: "24px",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "8px",
                  padding: "16px",
                  background: "var(--bg-primary)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        cursor: leadersConfig?.query ? "pointer" : "default",
                        textDecoration: leadersConfig?.query ? "underline" : "none",
                        color: leadersConfig?.query ? "var(--brand-primary)" : "var(--text-primary)",
                      }}
                      onClick={(e) => {
                        if (leadersConfig?.query) {
                          setHoveredQuery({
                            config: leadersConfig,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (leadersConfig?.query) {
                          setHoveredQuery({
                            config: leadersConfig,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }
                      }}
                      title={leadersConfig?.query ? "Click or hover to view query" : ""}
                    >
                      Elected Officials
                    </span>
                    {officialsData.length > 0 && (
                      <span style={{ fontSize: "12px", fontWeight: "normal", color: "var(--text-secondary)" }}>
                        ({storedLeaders.length} stored / {officialsData.length} total)
                      </span>
                    )}
                    {leadersConfig && (() => {
                      const confidence = (leadersConfig as any).metadata?.confidence || (leadersConfig as any).confidence;
                      if (confidence) {
                        const confidencePercent = Math.round(confidence * 100);
                        return (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "12px",
                              fontSize: "11px",
                              fontWeight: 600,
                              background: confidence >= 0.8 ? "#d1fae5" : confidence >= 0.7 ? "#fef3c7" : "#fee2e2",
                              color: confidence >= 0.8 ? "#065f46" : confidence >= 0.7 ? "#92400e" : "#991b1b",
                            }}
                          >
                            Confidence: {confidencePercent}%
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </h4>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={async () => {
                        if (!leadersConfig || !officialsData.length) {
                          alert("No elected officials data available to store.");
                          return;
                        }
                        if (!confirm(`Store all ${officialsData.length} elected officials from query output?`)) {
                          return;
                        }
                        try {
                          setSaving(true);
                          setError(null);
                          const token = await getAccessTokenSilently();
                          
                          // Get geographic and governance structures for mapping
                          const geoStructures = structureData?.geographic_structures || [];
                          const govStructures = structureData?.governance_structures || [];
                          
                          // Try to find matching geographic structure by identifier_field
                          const matchingGeoStructure = geoStructures.find((g: any) => {
                            const identifierField = g.identifier_field?.toLowerCase() || "";
                            return identifierField.includes("supervisor") || identifierField.includes("district");
                          });
                          
                          // Try to find matching governance structure
                          const matchingGovStructure = govStructures.find((g: any) => {
                            const bodyName = g.body_name?.toLowerCase() || "";
                            return bodyName.includes("supervisor") || bodyName.includes("board");
                          });
                          
                          let stored = 0;
                          let errors = 0;
                          
                          // Get identifier field from config to extract name
                          // CRITICAL: identifier_field should be the NAME field, not district field
                          const identifierField = leadersConfig?.identifier_field || "";
                          // Check if identifier_field is actually a district field (should not be used as name)
                          const isDistrictField = identifierField && (
                            identifierField.toLowerCase().includes('district') ||
                            identifierField.toLowerCase().includes('ward') ||
                            identifierField.toLowerCase().includes('precinct') ||
                            identifierField.toLowerCase().includes('dist') ||
                            identifierField.toLowerCase().includes('num')
                          );
                          // Only use identifier_field as name if it's NOT a district field
                          const nameField = (!isDistrictField && identifierField) ? identifierField : null;
                          
                          for (const official of officialsData) {
                            try {
                              // Use identifier_field from config ONLY if it's a name field, otherwise use common name patterns
                              const officialName = nameField 
                                ? (official[nameField] || official.name || official.supervisor || official.councilmember || "")
                                : (official.name || official.supervisor || official.councilmember || official.official || "");
                              
                              // Use dynamically found district field, with fallback to common field names
                              const officialDistrict = districtField 
                                ? (official[districtField] !== undefined && official[districtField] !== null ? Number(official[districtField]) : null)
                                : (official.district || official.supervisor_district || official.council_district || official.sup_dist || official.sup_dist_num || null);
                              // Convert to number if it's a string
                              const districtNum = officialDistrict !== null && officialDistrict !== undefined 
                                ? (typeof officialDistrict === 'string' ? (isNaN(Number(officialDistrict)) ? null : Number(officialDistrict)) : officialDistrict)
                                : null;
                              
                              // Extract title: use explicit title field only - NO INFERENCE
                              // If no title available, it will be null and backend will handle it
                              let officialTitle = official.title || official.position || null;
                              
                              if (!officialName) continue;
                              
                              await createCityLeaderMutation.mutateAsync({
                                cityId,
                                leader: {
                                  city_id: cityId,
                                  name: officialName,
                                  title: officialTitle,
                                  district: districtNum,
                                  geographic_structure_id: matchingGeoStructure?.id || null,
                                  governance_structure_id: matchingGovStructure?.id || null,
                                  metadata: official,
                                },
                              });
                              stored++;
                            } catch (err: any) {
                              console.error("Error storing leader:", err);
                              errors++;
                            }
                          }
                          
                          await refetchCity();
                          await refetchStructure();
                          alert(`Stored ${stored} elected officials${errors > 0 ? ` (${errors} errors)` : ""}!`);
                        } catch (err: any) {
                          setError(err.message || "Failed to store all elected officials");
                          alert("Failed to store all elected officials: " + err.message);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={!leadersConfig || !officialsData.length || saving}
                      style={{
                        padding: "6px 12px",
                        background: (leadersConfig && officialsData.length && !saving) ? "#10b981" : "#ccc",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: (leadersConfig && officialsData.length && !saving) ? "pointer" : "not-allowed",
                        fontWeight: 500,
                        fontSize: "12px",
                      }}
                      title={leadersConfig && officialsData.length ? `Store all ${officialsData.length} elected officials from query output` : "No elected officials data available"}
                    >
                      Store All ({officialsData.length})
                    </button>
                    <button
                      onClick={handleReloadOfficials}
                      disabled={!leadersConfig}
                      style={{
                        padding: "6px 12px",
                        background: leadersConfig ? "var(--brand-primary)" : "#ccc",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: leadersConfig ? "pointer" : "not-allowed",
                        fontWeight: 500,
                        fontSize: "12px",
                        marginRight: "8px",
                      }}
                      title={leadersConfig ? "Re-run query and reload elected officials data" : "No query configuration found"}
                    >
                      Re-load
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const token = await getAccessTokenSilently();
                          if (leadersConfigs.length === 0) {
                            alert("No leaders query configurations found. Please run re-structure first.");
                            return;
                          }
                          if (!confirm(`Re-extract and store leaders from ${leadersConfigs.length} query config(s)? This will delete existing stored leaders and recreate them with the current code.`)) {
                            return;
                          }
                          const result = await reExtractLeadersMutation.mutateAsync(cityId);
                          // Refetch structure data to get updated leaders
                          await refetchStructure();
                          alert(`Re-extracted ${result.leaders_count} leaders:\n\n${result.message}`);
                        } catch (err: any) {
                          alert("Failed to re-extract leaders: " + err.message);
                        }
                      }}
                      disabled={leadersConfigs.length === 0 || reExtractLeadersMutation.isPending}
                      style={{
                        padding: "6px 12px",
                        background: (leadersConfigs.length > 0 && !reExtractLeadersMutation.isPending) ? "#f59e0b" : "#ccc",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: (leadersConfigs.length > 0 && !reExtractLeadersMutation.isPending) ? "pointer" : "not-allowed",
                        fontWeight: 500,
                        fontSize: "12px",
                      }}
                      title={leadersConfigs.length > 0 ? "Re-extract leaders from query configs using current code (fixes titles, mappings, etc.)" : "No query configurations found"}
                    >
                      {reExtractLeadersMutation.isPending ? "Re-extracting..." : "Re-extract Leaders"}
                    </button>
                  </div>
                </div>
                
                {/* Show all elected officials from query output with mapping status */}
                {officialsData.length > 0 ? (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <h5 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>
                        All Elected Officials ({officialsData.length})
                      </h5>
                      {(() => {
                        // Collect all emails from stored leaders
                        const emailsWithNames = storedLeaders
                          .filter((leader: any) => leader.metadata?.email)
                          .map((leader: any) => `${leader.name} <${leader.metadata.email}>`);
                        
                        if (emailsWithNames.length > 0) {
                          return (
                            <button
                              onClick={async () => {
                                const emailList = emailsWithNames.join(", ");
                                try {
                                  await navigator.clipboard.writeText(emailList);
                                  alert(`Copied ${emailsWithNames.length} email addresses to clipboard!`);
                                } catch (err) {
                                  console.error("Failed to copy:", err);
                                  alert("Failed to copy emails. Please try again.");
                                }
                              }}
                              style={{
                                padding: "4px 12px",
                                background: "var(--brand-primary)",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "11px",
                                fontWeight: 500,
                              }}
                              title={`Copy all ${emailsWithNames.length} email addresses (Name <email> format)`}
                            >
                              📧 Copy All Emails ({emailsWithNames.length})
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: "12px",
                          background: "var(--bg-primary)",
                        }}
                      >
                        <thead>
                          <tr style={{ background: "var(--bg-secondary)", borderBottom: "2px solid var(--border-primary)" }}>
                            <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Status</th>
                            <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Name</th>
                            <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Title</th>
                            <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>District</th>
                            <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Geographic Structure</th>
                            <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {officialsData.map((official: any, index: number) => {
                            // Get identifier field from config to extract name
                            // CRITICAL: identifier_field should be the NAME field, not district field
                            const identifierField = leadersConfig?.identifier_field || "";
                            // Check if identifier_field is actually a district field (should not be used as name)
                            const isDistrictField = identifierField && (
                              identifierField.toLowerCase().includes('district') ||
                              identifierField.toLowerCase().includes('ward') ||
                              identifierField.toLowerCase().includes('precinct') ||
                              identifierField.toLowerCase().includes('dist') ||
                              identifierField.toLowerCase().includes('num')
                            );
                            // Only use identifier_field as name if it's NOT a district field
                            const nameField = (!isDistrictField && identifierField) ? identifierField : null;
                            
                            // Try to find matching stored leader
                            // Use identifier_field from config ONLY if it's a name field, otherwise use common name patterns
                            // For manual_data entries, always use 'name' field directly
                            const officialName = official.name 
                              || (nameField ? (official[nameField] || "") : "")
                              || official.supervisor 
                              || official.councilmember 
                              || official.alderman
                              || official.official 
                              || "";
                            
                            // Use dynamically found district field, with fallback to common field names
                            const officialDistrictRaw = districtField 
                              ? (official[districtField] !== undefined && official[districtField] !== null ? official[districtField] : null)
                              : (official.district || official.supervisor_district || official.council_district || official.sup_dist || official.sup_dist_num || null);
                            // Convert to number if it's a string
                            const officialDistrict = officialDistrictRaw !== null && officialDistrictRaw !== undefined 
                              ? (typeof officialDistrictRaw === 'string' ? (isNaN(Number(officialDistrictRaw)) ? null : Number(officialDistrictRaw)) : officialDistrictRaw)
                              : null;
                            
                            // Normalize the key to match stored leaders (trim, lowercase, handle nulls)
                            // We'll try to find stored leader first to get the correct title from database
                            const normalizedName = (officialName || "").trim().toLowerCase();
                            // Normalize district value - convert to string to match map keys
                            const districtValue = officialDistrict !== null && officialDistrict !== undefined 
                              ? String(officialDistrict) 
                              : "null";
                            
                            // First check if this official is already marked as a stored leader (from the stored leaders we added)
                            let storedLeader: any = null;
                            if (official._isStoredLeader && official._storedLeaderId) {
                              // This official came from stored leaders, find it by ID
                              storedLeader = storedLeaders.find((l: any) => l.id === official._storedLeaderId);
                            }
                            
                            // Build key for lookup (needed for both lookup and debug logging)
                            const keyNoTitle = `${normalizedName}_${districtValue}`;
                            
                            // If not found by ID, try to find stored leader by name+district first (using key without title)
                            // This allows us to get the correct title from the database
                            if (!storedLeader) {
                              storedLeader = storedLeadersMap.get(keyNoTitle);
                            }
                            
                            // If not found, try with title if we have one
                            if (!storedLeader) {
                              let officialTitle = official.title || official.position || null;
                              if (officialTitle) {
                                const normalizedTitle = (officialTitle || "").trim().toLowerCase();
                                const keyWithTitle = `${normalizedName}_${normalizedTitle}_${districtValue}`;
                                storedLeader = storedLeadersMap.get(keyWithTitle);
                              }
                            }
                            
                            // Special handling for Mayor/district 0: try matching by title only if name doesn't match
                            // This handles cases where the name might be slightly different but it's clearly the Mayor
                            if (!storedLeader && officialDistrict === 0) {
                              // Try to find any stored leader with district 0 and title containing "mayor"
                              const mayorTitle = (official.title || official.position || "").toLowerCase();
                              if (mayorTitle.includes("mayor")) {
                                // Look for stored leaders with district 0 and title containing "mayor"
                                storedLeaders.forEach((leader: any) => {
                                  if (!storedLeader && (leader.district === 0 || leader.district === null)) {
                                    const leaderTitle = (leader.title || "").toLowerCase();
                                    if (leaderTitle.includes("mayor")) {
                                      // Check if names are similar (fuzzy match)
                                      const leaderName = (leader.name || "").trim().toLowerCase();
                                      // If names are similar (at least 3 characters match) or exact match
                                      if (normalizedName === leaderName || 
                                          (normalizedName.length >= 3 && leaderName.length >= 3 && 
                                           (normalizedName.includes(leaderName.substring(0, 3)) || 
                                            leaderName.includes(normalizedName.substring(0, 3))))) {
                                        storedLeader = leader;
                                      }
                                    }
                                  }
                                });
                              }
                            }
                            
                            // Additional fallback: if still not found and district is 0, try exact name match with any district 0 leader
                            if (!storedLeader && officialDistrict === 0) {
                              storedLeaders.forEach((leader: any) => {
                                if (!storedLeader && (leader.district === 0 || leader.district === null)) {
                                  const leaderName = (leader.name || "").trim().toLowerCase();
                                  if (normalizedName === leaderName) {
                                    storedLeader = leader;
                                  }
                                }
                              });
                            }

                            // Extract title: use stored leader's title (from database) or explicit title field from query output
                            // NO INFERENCE - just use what's available or show N/A
                            let officialTitle = storedLeader?.title || official.title || official.position || null;
                            
                            const isStored = !!storedLeader;
                            
                            return (
                              <tr
                                key={index}
                                style={{
                                  borderBottom: "1px solid var(--border-primary)",
                                  background: index % 2 === 0 ? "var(--bg-primary)" : "var(--bg-secondary)",
                                }}
                              >
                                <td style={{ padding: "8px" }}>
                                  {isStored ? (
                                    <span style={{ color: "#10b981", fontWeight: 500 }}>✓ Stored</span>
                                  ) : (
                                    <span style={{ color: "#f59e0b", fontWeight: 500 }}>⚠ Not stored</span>
                                  )}
                                </td>
                                <td style={{ padding: "8px" }}>
                                  {(() => {
                                    const email = storedLeader?.metadata?.email || official.email;
                                    if (email) {
                                      // Display name with email - click to copy "Name <email>" format
                                      return (
                                        <div>
                                          <span
                                            title={`Click to copy: ${officialName} <${email}>`}
                                            onClick={async (e) => {
                                              const emailText = `${officialName} <${email}>`;
                                              try {
                                                await navigator.clipboard.writeText(emailText);
                                                // Show brief feedback
                                                const target = e.currentTarget;
                                                const originalHTML = target.innerHTML;
                                                target.innerHTML = "✓ Copied!";
                                                target.style.color = "#10b981";
                                                setTimeout(() => {
                                                  target.innerHTML = originalHTML;
                                                  target.style.color = "";
                                                }, 1500);
                                              } catch (err) {
                                                console.error("Failed to copy:", err);
                                              }
                                            }}
                                            style={{
                                              cursor: "pointer",
                                              textDecoration: "underline",
                                              color: "var(--brand-primary)",
                                            }}
                                          >
                                            {officialName || "N/A"}
                                          </span>
                                          <br />
                                          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                            {email}
                                          </span>
                                        </div>
                                      );
                                    }
                                    return officialName || "N/A";
                                  })()}
                                </td>
                                <td style={{ padding: "8px" }}>{officialTitle || "N/A"}</td>
                                <td style={{ padding: "8px" }}>
                                  {officialDistrict !== null && officialDistrict !== undefined
                                    ? (officialDistrict === 0 ? "Citywide (District 0)" : `District ${officialDistrict}`)
                                    : "At-large"}
                                </td>
                                <td style={{ padding: "8px" }}>
                                  {storedLeader?.geographic_structure_id ? (
                                    <span style={{ color: "var(--brand-primary)", fontWeight: 500 }}>
                                      {geographicStructures.find((g: any) => g.id === storedLeader.geographic_structure_id)?.structure_name || storedLeader.geographic_structure_id}
                                    </span>
                                  ) : (
                                    <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>Not mapped</span>
                                  )}
                                </td>
                                <td style={{ padding: "8px" }}>
                                  <button
                                    onClick={() => {
                                      // If we have a stored leader, use its data (including metadata and IDs)
                                      // Otherwise, create a new leader from the official data
                                      const leaderData = storedLeader ? {
                                        ...storedLeader,
                                        // Ensure metadata exists
                                        metadata: storedLeader.metadata || {},
                                      } : {
                                        name: officialName,
                                        title: officialTitle,
                                        district: officialDistrict,
                                        geographic_structure_id: null,
                                        governance_structure_id: null,
                                        metadata: official.metadata || {},
                                      };
                                      
                                      setEditingLeader({
                                        index,
                                        data: leaderData,
                                        isNew: !isStored,
                                      });
                                    }}
                                    style={{
                                      padding: "4px 8px",
                                      background: "var(--brand-primary)",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      cursor: "pointer",
                                      fontSize: "11px",
                                      marginRight: "4px",
                                    }}
                                  >
                                    {isStored ? "Edit" : "Add"}
                                  </button>
                                  {isStored && storedLeader?.id && (
                                    <button
                                      onClick={() => handleDeleteLeader(storedLeader.id)}
                                      style={{
                                        padding: "4px 8px",
                                        background: "#dc2626",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        fontSize: "11px",
                                      }}
                                    >
                                      Delete
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", padding: "12px" }}>
                    No elected officials data in query output. Click Re-load to fetch from query.
                  </div>
                )}
                
                {/* Edit/Add Elected Official Modal */}
                {editingLeader && (
                  <div
                    style={{
                      position: "fixed",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: "rgba(0, 0, 0, 0.5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 1000,
                    }}
                    onClick={() => setEditingLeader(null)}
                  >
                    <div
                      style={{
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "8px",
                        padding: "24px",
                        maxWidth: "500px",
                        width: "90%",
                        maxHeight: "90vh",
                        overflow: "auto",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3 style={{ margin: "0 0 16px 0" }}>
                        {editingLeader.isNew ? "Add Elected Official" : "Edit Elected Official"}
                      </h3>
                      
                      <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                          Name
                        </label>
                        <input
                          type="text"
                          value={editingLeader.data.name || ""}
                          onChange={(e) => setEditingLeader({
                            ...editingLeader,
                            data: { ...editingLeader.data, name: e.target.value },
                          })}
                          style={{
                            width: "100%",
                            padding: "6px",
                            border: "1px solid var(--border-primary)",
                            borderRadius: "4px",
                            background: "var(--bg-tertiary)",
                            color: "var(--text-primary)",
                          }}
                        />
                      </div>
                      
                      <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                          Title
                        </label>
                        <input
                          type="text"
                          value={editingLeader.data.title || ""}
                          onChange={(e) => setEditingLeader({
                            ...editingLeader,
                            data: { ...editingLeader.data, title: e.target.value },
                          })}
                          style={{
                            width: "100%",
                            padding: "6px",
                            border: "1px solid var(--border-primary)",
                            borderRadius: "4px",
                            background: "var(--bg-tertiary)",
                            color: "var(--text-primary)",
                          }}
                        />
                      </div>
                      
                      <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                          District (leave empty for at-large)
                        </label>
                        <input
                          type="number"
                          value={editingLeader.data.district || ""}
                          onChange={(e) => setEditingLeader({
                            ...editingLeader,
                            data: { ...editingLeader.data, district: e.target.value ? parseInt(e.target.value) : null },
                          })}
                          style={{
                            width: "100%",
                            padding: "6px",
                            border: "1px solid var(--border-primary)",
                            borderRadius: "4px",
                            background: "var(--bg-tertiary)",
                            color: "var(--text-primary)",
                          }}
                        />
                      </div>
                      
                      <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                          Geographic Structure
                        </label>
                        <select
                          value={editingLeader.data.geographic_structure_id || ""}
                          onChange={(e) => setEditingLeader({
                            ...editingLeader,
                            data: { ...editingLeader.data, geographic_structure_id: e.target.value ? parseInt(e.target.value) : null },
                          })}
                          style={{
                            width: "100%",
                            padding: "6px",
                            border: "1px solid var(--border-primary)",
                            borderRadius: "4px",
                            background: "var(--bg-tertiary)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <option value="">None</option>
                          {geographicStructures.map((geo: any) => (
                            <option key={geo.id} value={geo.id}>
                              {geo.structure_name} (ID: {geo.id})
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                          Governance Structure
                        </label>
                        <select
                          value={editingLeader.data.governance_structure_id || ""}
                          onChange={(e) => setEditingLeader({
                            ...editingLeader,
                            data: { ...editingLeader.data, governance_structure_id: e.target.value ? parseInt(e.target.value) : null },
                          })}
                          style={{
                            width: "100%",
                            padding: "6px",
                            border: "1px solid var(--border-primary)",
                            borderRadius: "4px",
                            background: "var(--bg-tertiary)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <option value="">None</option>
                          {governanceStructures.map((gov: any) => (
                            <option key={gov.id} value={gov.id}>
                              {gov.body_name} (ID: {gov.id})
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Metadata Fields Section */}
                      <div style={{ marginTop: "24px", marginBottom: "12px", paddingTop: "16px", borderTop: "1px solid var(--border-primary)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                          Additional Information
                        </h4>
                        
                        <div style={{ marginBottom: "12px" }}>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                            Email
                          </label>
                          <input
                            type="email"
                            value={editingLeader.data.metadata?.email || ""}
                            onChange={(e) => setEditingLeader({
                              ...editingLeader,
                              data: {
                                ...editingLeader.data,
                                metadata: {
                                  ...editingLeader.data.metadata,
                                  email: e.target.value || undefined,
                                },
                              },
                            })}
                            style={{
                              width: "100%",
                              padding: "6px",
                              border: "1px solid var(--border-primary)",
                              borderRadius: "4px",
                              background: "var(--bg-tertiary)",
                              color: "var(--text-primary)",
                            }}
                            placeholder="official@city.gov"
                          />
                        </div>
                        
                        <div style={{ marginBottom: "12px" }}>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                            Phone
                          </label>
                          <input
                            type="tel"
                            value={editingLeader.data.metadata?.phone || ""}
                            onChange={(e) => setEditingLeader({
                              ...editingLeader,
                              data: {
                                ...editingLeader.data,
                                metadata: {
                                  ...editingLeader.data.metadata,
                                  phone: e.target.value || undefined,
                                },
                              },
                            })}
                            style={{
                              width: "100%",
                              padding: "6px",
                              border: "1px solid var(--border-primary)",
                              borderRadius: "4px",
                              background: "var(--bg-tertiary)",
                              color: "var(--text-primary)",
                            }}
                            placeholder="(555) 123-4567"
                          />
                        </div>
                        
                        <div style={{ marginBottom: "12px" }}>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                            Website
                          </label>
                          <input
                            type="url"
                            value={editingLeader.data.metadata?.website || ""}
                            onChange={(e) => setEditingLeader({
                              ...editingLeader,
                              data: {
                                ...editingLeader.data,
                                metadata: {
                                  ...editingLeader.data.metadata,
                                  website: e.target.value || undefined,
                                },
                              },
                            })}
                            style={{
                              width: "100%",
                              padding: "6px",
                              border: "1px solid var(--border-primary)",
                              borderRadius: "4px",
                              background: "var(--bg-tertiary)",
                              color: "var(--text-primary)",
                            }}
                            placeholder="https://example.com"
                          />
                        </div>
                        
                        <div style={{ marginBottom: "12px" }}>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                            Party
                          </label>
                          <input
                            type="text"
                            value={editingLeader.data.metadata?.party || ""}
                            onChange={(e) => setEditingLeader({
                              ...editingLeader,
                              data: {
                                ...editingLeader.data,
                                metadata: {
                                  ...editingLeader.data.metadata,
                                  party: e.target.value || undefined,
                                },
                              },
                            })}
                            style={{
                              width: "100%",
                              padding: "6px",
                              border: "1px solid var(--border-primary)",
                              borderRadius: "4px",
                              background: "var(--bg-tertiary)",
                              color: "var(--text-primary)",
                            }}
                            placeholder="Democratic, Republican, Independent, etc."
                          />
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                          <div>
                            <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                              Term Start
                            </label>
                            <input
                              type="date"
                              value={editingLeader.data.metadata?.term_start || ""}
                              onChange={(e) => setEditingLeader({
                                ...editingLeader,
                                data: {
                                  ...editingLeader.data,
                                  metadata: {
                                    ...editingLeader.data.metadata,
                                    term_start: e.target.value || undefined,
                                  },
                                },
                              })}
                              style={{
                                width: "100%",
                                padding: "6px",
                                border: "1px solid var(--border-primary)",
                                borderRadius: "4px",
                                background: "var(--bg-tertiary)",
                                color: "var(--text-primary)",
                              }}
                            />
                          </div>
                          
                          <div>
                            <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                              Term End
                            </label>
                            <input
                              type="date"
                              value={editingLeader.data.metadata?.term_end || ""}
                              onChange={(e) => setEditingLeader({
                                ...editingLeader,
                                data: {
                                  ...editingLeader.data,
                                  metadata: {
                                    ...editingLeader.data.metadata,
                                    term_end: e.target.value || undefined,
                                  },
                                },
                              })}
                              style={{
                                width: "100%",
                                padding: "6px",
                                border: "1px solid var(--border-primary)",
                                borderRadius: "4px",
                                background: "var(--bg-tertiary)",
                                color: "var(--text-primary)",
                              }}
                            />
                          </div>
                        </div>
                        
                        <div style={{ marginBottom: "12px" }}>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                            Office Address
                          </label>
                          <textarea
                            value={editingLeader.data.metadata?.office_address || ""}
                            onChange={(e) => setEditingLeader({
                              ...editingLeader,
                              data: {
                                ...editingLeader.data,
                                metadata: {
                                  ...editingLeader.data.metadata,
                                  office_address: e.target.value || undefined,
                                },
                              },
                            })}
                            style={{
                              width: "100%",
                              padding: "6px",
                              border: "1px solid var(--border-primary)",
                              borderRadius: "4px",
                              background: "var(--bg-tertiary)",
                              color: "var(--text-primary)",
                              minHeight: "60px",
                              resize: "vertical",
                            }}
                            placeholder="City Hall, Room 123&#10;123 Main Street&#10;City, State ZIP"
                          />
                        </div>
                        
                        <div style={{ marginBottom: "12px" }}>
                          <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}>
                            Bio/Notes
                          </label>
                          <textarea
                            value={editingLeader.data.metadata?.bio || ""}
                            onChange={(e) => setEditingLeader({
                              ...editingLeader,
                              data: {
                                ...editingLeader.data,
                                metadata: {
                                  ...editingLeader.data.metadata,
                                  bio: e.target.value || undefined,
                                },
                              },
                            })}
                            style={{
                              width: "100%",
                              padding: "6px",
                              border: "1px solid var(--border-primary)",
                              borderRadius: "4px",
                              background: "var(--bg-tertiary)",
                              color: "var(--text-primary)",
                              minHeight: "80px",
                              resize: "vertical",
                            }}
                            placeholder="Additional notes or biographical information"
                          />
                        </div>
                      </div>
                      
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
                        <button
                          onClick={() => setEditingLeader(null)}
                          style={{
                            padding: "8px 16px",
                            background: "var(--bg-tertiary)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border-primary)",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveLeader(editingLeader.data, editingLeader.isNew)}
                          disabled={saving || !editingLeader.data.name || !editingLeader.data.title}
                          style={{
                            padding: "8px 16px",
                            background: saving ? "#ccc" : "var(--brand-primary)",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: saving ? "not-allowed" : "pointer",
                            opacity: saving || !editingLeader.data.name || !editingLeader.data.title ? 0.6 : 1,
                          }}
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Metrics Tab */}
      {activeTab === "metrics" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>Metrics</h3>
            <button
              onClick={() => setRunAllMetricsOpen(true)}
              style={{
                padding: "8px 16px",
                background: "var(--brand-primary, #0066cc)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
              disabled={!cityDataTyped.metrics || cityDataTyped.metrics.length === 0}
            >
              ▶ Run All Metrics
            </button>
          </div>
          
          {/* Metric Order Editor */}
          {cityDataTyped.metrics && cityDataTyped.metrics.length > 0 && (
            <MetricOrderEditor
              cityId={cityId}
              metrics={cityDataTyped.metrics}
            />
          )}
          
          {cityDataTyped.metrics && cityDataTyped.metrics.length > 0 ? (
            <div>
              {(() => {
                // Group and sort metrics by category using saved ordering (same as dashboard)
                const grouped: Record<string, { metrics: Metric[]; categoryOrder: number }> = {};
                
                cityDataTyped.metrics.forEach((metric) => {
                  const ordering = orderingMap.get(metric.id);
                  const category = ordering?.categoryName || metric.category || "Uncategorized";
                  const categoryOrder = ordering?.categoryOrder ?? 1000;
                  const metricOrder = ordering?.metricOrder ?? 1000;
                  
                  if (!grouped[category]) {
                    grouped[category] = { metrics: [], categoryOrder };
                  }
                  // Update category order to match any metric in it (they should all have the same)
                  grouped[category].categoryOrder = Math.min(grouped[category].categoryOrder, categoryOrder);
                  
                  grouped[category].metrics.push({
                    ...metric,
                    metricOrder, // Store for sorting
                  } as Metric & { metricOrder: number });
                });

                // Sort categories by their order, then alphabetically (same as dashboard)
                const sortedCategories = Object.keys(grouped).sort((a, b) => {
                  const orderA = grouped[a].categoryOrder;
                  const orderB = grouped[b].categoryOrder;
                  if (orderA !== orderB) return orderA - orderB;
                  return a.localeCompare(b);
                });
                
                // Sort metrics within each category by their metric order, then by name (same as dashboard)
                sortedCategories.forEach((category) => {
                  grouped[category].metrics.sort((a, b) => {
                    const orderA = (a as any).metricOrder ?? 1000;
                    const orderB = (b as any).metricOrder ?? 1000;
                    if (orderA !== orderB) return orderA - orderB;
                    return a.metric_name.localeCompare(b.metric_name);
                  });
                });

                return sortedCategories.map((category) => (
                  <div key={category} style={{ marginBottom: "32px" }}>
                    <h4 style={{ 
                      margin: "0 0 12px 0", 
                      padding: "8px 0",
                      borderBottom: "2px solid var(--brand-primary)",
                      color: "var(--text-primary)",
                      fontSize: "14px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.03em"
                    }}>
                      {category}
                    </h4>
                    <div className={styles.metricsTableContainer}>
                      <table className={styles.metricsTable}>
                        <thead>
                          <tr>
                            <th>Metric</th>
                            <th>Most Recent Data</th>
                            <th>Active</th>
                            <th>Inactive</th>
                            <th>Last Execution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grouped[category].metrics.map((metric) => {
                            // Determine background color based on execution status
                            // Status values from backend: "completed", "failed", "error", or null
                            const isSuccess = metric.last_execution_status === "completed" || metric.last_execution_status === "success";
                            const isFailure = metric.last_execution_status === "failed" || 
                                             metric.last_execution_status === "failure" || 
                                             metric.last_execution_status === "error";
                            const hasNoStatus = !metric.last_execution_status;
                            
                            // Access data - handle both typed and untyped (any) metric objects
                            const metricAny = metric as any;

                            return (
                              <tr
                                key={metric.id}
                                className={styles.metricTableRow}
                                style={{
                                  backgroundColor: isSuccess
                                    ? "rgba(76, 175, 80, 0.03)"
                                    : isFailure
                                    ? "rgba(244, 67, 54, 0.03)"
                                    : hasNoStatus
                                    ? "rgba(158, 158, 158, 0.03)"
                                    : "transparent",
                                }}
                              >
                                <td className={styles.metricNameCell}>
                                  <div className={styles.metricNameContent}>
                                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                                      {metric.metric_name}
                                      <span className={styles.metricIdInline}>({metric.id})</span>
                                    </div>
                                    <div className={styles.metricActionsWrapper}>
                                      <MetricActions
                                        metricId={metric.id}
                                        onEdit={() => openEditModal(metric.id)}
                                        onViewCharts={() => openCharts(metric.id)}
                                        onExecute={() => openExecuteModal(metric.id)}
                                        onDelete={() => deleteMetric(metric.id)}
                                        onViewAnomalies={() => openViewAnomalies(metric.id)}
                                        compact={true}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className={styles.metricDateCell}>
                                  {(metricAny.most_recent_data_date || metric.most_recent_data_date) ? (
                                    <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                                      {new Date(metricAny.most_recent_data_date || metric.most_recent_data_date).toLocaleDateString()}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>—</span>
                                  )}
                                </td>
                                <td className={styles.metricDateCell}>
                                  {(metricAny.record_counts?.total_active ?? metric.record_counts?.total_active) != null ? (
                                    <span style={{ fontSize: "12px", color: "var(--color-success, #22c55e)", fontWeight: 500 }}>
                                      {(metricAny.record_counts?.total_active ?? metric.record_counts?.total_active).toLocaleString()}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>—</span>
                                  )}
                                </td>
                                <td className={styles.metricDateCell}>
                                  {(metricAny.record_counts?.total_inactive ?? metric.record_counts?.total_inactive) != null ? (
                                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                                      {(metricAny.record_counts?.total_inactive ?? metric.record_counts?.total_inactive).toLocaleString()}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>—</span>
                                  )}
                                </td>
                                <td className={styles.metricExecutionCell}>
                                  {(metricAny.last_execution_at || metric.last_execution_at) ? (
                                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                      {new Date(metricAny.last_execution_at || metric.last_execution_at).toLocaleDateString()}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <p>No metrics defined for this city</p>
          )}
        </div>
      )}

      {/* Datasets Tab */}
      {activeTab === "datasets" && (
        <div>
          <DatasetsList cityId={cityId} showStats={false} showCityFilter={false} />
        </div>
      )}

      {/* Query Popup */}
      {hoveredQuery && (
        <div
          style={{
            position: "fixed",
            top: hoveredQuery.y + 10,
            left: hoveredQuery.x + 10,
            background: "var(--bg-primary)",
            border: "2px solid var(--brand-primary)",
            borderRadius: "8px",
            padding: "16px",
            maxWidth: "600px",
            maxHeight: "400px",
            overflow: "auto",
            zIndex: 10000,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          }}
          onMouseLeave={() => setHoveredQuery(null)}
          onClick={() => setHoveredQuery(null)}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h5 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
              Query: {hoveredQuery.config.structure_name || hoveredQuery.config.structure_type}
            </h5>
            <button
              onClick={() => setHoveredQuery(null)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "18px",
                cursor: "pointer",
                color: "var(--text-secondary)",
                padding: "0",
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          </div>
          {hoveredQuery.config.endpoint && (
            <div style={{ marginBottom: "8px" }}>
              <strong style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Endpoint:</strong>
              <div style={{ fontSize: "12px", fontFamily: "monospace", marginTop: "4px", wordBreak: "break-all" }}>
                {hoveredQuery.config.endpoint}
              </div>
            </div>
          )}
          {hoveredQuery.config.query && (
            <div>
              <strong style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Query:</strong>
              <pre
                style={{
                  fontSize: "11px",
                  fontFamily: "monospace",
                  background: "var(--bg-secondary)",
                  padding: "8px",
                  borderRadius: "4px",
                  marginTop: "4px",
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {hoveredQuery.config.query}
              </pre>
            </div>
          )}
          {hoveredQuery.config.description && (
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-secondary)" }}>
              <strong>Description:</strong> {hoveredQuery.config.description}
            </div>
          )}
        </div>
      )}

      {/* Edit Metric Modal */}
      {editModalMetricId && (
        <MetricEditModal
          metricId={editModalMetricId}
          isOpen={editModalOpen}
          onClose={closeEditModal}
          onExecute={(metricId) => {
            closeEditModal();
            openExecuteModal(metricId);
          }}
          onSave={() => {
            refetchCity();
          }}
        />
      )}


      {/* Charts Modal */}
      <MetricChartsModal
        metricId={chartsMetricId}
        isOpen={chartsOpen}
        onClose={closeCharts}
      />

      {/* Run All Metrics Modal */}
      <RunAllMetricsModal
        isOpen={runAllMetricsOpen}
        onClose={() => setRunAllMetricsOpen(false)}
        cityId={cityId}
        cityName={cityDataTyped?.name || cityDataTyped?.city_name || `City ${cityId}`}
        metrics={cityDataTyped?.metrics || []}
      />

      {/* Execute Metric Modal */}
      {isClient && showExecuteModal
        ? createPortal(
            <div className={metricStyles.modalOverlay} onClick={closeExecuteModal}>
              <div
                className={metricStyles.modal}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={metricStyles.modalHeader}>
                  <h2>Execute Metric {executeMetricId}</h2>
                  <button
                    className={metricStyles.modalClose}
                    onClick={closeExecuteModal}
                  >
                    ×
                  </button>
                </div>
                <div className={metricStyles.modalBody}>
                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: 8,
                        fontWeight: 500,
                      }}
                    >
                      Period Type
                    </label>
                    <select
                      value={executePeriodType}
                      onChange={(e) => setExecutePeriodType(e.target.value)}
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 4,
                        border: "1px solid var(--border-primary)",
                        backgroundColor: "var(--bg-primary)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <option value="day">Daily</option>
                      <option value="week">Weekly</option>
                      <option value="month">Monthly</option>
                      <option value="year">Yearly</option>
                      <option value="ytd">Year-to-Date</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: 8,
                        fontWeight: 500,
                      }}
                    >
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
                        border: "1px solid var(--border-primary)",
                        backgroundColor: "var(--bg-primary)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: 8,
                        fontWeight: 500,
                      }}
                    >
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
                        border: "1px solid var(--border-primary)",
                        backgroundColor: "var(--bg-primary)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                </div>
                <div className={metricStyles.modalFooter}>
                  <button
                    className={metricStyles.secondaryBtn}
                    onClick={closeExecuteModal}
                  >
                    Cancel
                  </button>
                  <button
                    className={metricStyles.primaryBtn}
                    onClick={executeMetric}
                    disabled={executeMetricMutation.isPending}
                  >
                    <i className="fas fa-play" /> Execute
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {/* View Anomalies Modal */}
      {isClient && anomaliesOpen && anomaliesData
        ? createPortal(
            <div
              className={metricStyles.modalOverlay}
              onMouseDown={closeViewAnomalies}
            >
              <div
                className={metricStyles.modal}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ maxWidth: "95vw", width: "1200px" }}
              >
                <div className={metricStyles.modalHeader}>
                  <div className={metricStyles.modalTitle}>
                    <i
                      className="fas fa-exclamation-triangle"
                      style={{
                        marginRight: "8px",
                        color: "var(--warning-text, #f59e0b)",
                      }}
                    />
                     <span className={metricStyles.modalTitleText}>
                       Anomaly Detection: {metricData?.metric_name || `Metric ${anomaliesMetricId}`} (
                       {anomaliesData.count} results)
                     </span>
                  </div>
                  <button
                    className={metricStyles.iconBtn}
                    onClick={closeViewAnomalies}
                    title="Close"
                  >
                    <i className="fas fa-times" />
                  </button>
                </div>
                <div className={metricStyles.modalBody}>
              {selectedAnomalyId ? (
                anomalyDetailQuery.isLoading ? (
                  <div className={metricStyles.muted} style={{ padding: 16, textAlign: "center" }}>
                    <i className="fas fa-spinner fa-spin" style={{ marginRight: "8px" }} />
                    Loading anomaly details...
                  </div>
                ) : anomalyDetailQuery.isError ? (
                  <div className={metricStyles.muted} style={{ padding: 16, textAlign: "center", color: "var(--error-text, #ef4444)" }}>
                    <i className="fas fa-exclamation-circle" style={{ marginRight: "8px" }} />
                    Error loading anomaly details. Please try again.
                  </div>
                ) : anomalyDetail ? (
                <>
                  {/* Chart View */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                    <button className={metricStyles.secondaryBtn} onClick={closeAnomalyChart}>
                      <i className="fas fa-arrow-left" /> Back to list
                    </button>
                    <div className={metricStyles.muted} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      {anomalyDetail.city_name && (
                        <span>
                          <strong>{anomalyDetail.city_name}</strong>
                          {anomalyDetail.district !== undefined && (
                            <>
                              {anomalyDetail.district === 0 ? " (Citywide)" : `, District ${anomalyDetail.district}`}
                            </>
                          )}
                        </span>
                      )}
                      {!anomalyDetail.city_name && anomalyDetail.district !== undefined && (
                        <span>
                          <strong>{anomalyDetail.district === 0 ? "Citywide" : `District ${anomalyDetail.district}`}</strong>
                        </span>
                      )}
                      {anomalyDetail.period_type && (
                        <>
                          {anomalyDetail.city_name || anomalyDetail.district !== undefined ? (
                            <span> • </span>
                          ) : null}
                          <span>
                            <strong>Period:</strong> {anomalyDetail.period_type}
                          </span>
                        </>
                      )}
                    </div>
                    <a
                      href={`/a/${selectedAnomalyId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={metricStyles.primaryBtn}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        textDecoration: "none",
                      }}
                    >
                      <i className="fas fa-external-link-alt" /> Full View
                    </a>
                  </div>

                  {/* Navigation arrows and chart */}
                  <div style={{ position: "relative", marginTop: 14, display: "flex", alignItems: "center", gap: "12px" }}>
                    {/* Previous button */}
                    {getFilteredAnomalies().length > 1 && (
                      <button
                        onClick={goToPreviousAnomaly}
                        className={metricStyles.iconBtn}
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-primary)",
                          flexShrink: 0,
                        }}
                        title="Previous anomaly"
                      >
                        <i className="fas fa-chevron-left" />
                      </button>
                    )}

                    {/* Chart container */}
                    <div style={{ flex: 1, position: "relative" }}>
                      {anomalyDetail.chart_payload ? (
                        <AnomalyChart
                          chartData={{
                            dates: anomalyDetail.chart_payload.dates || [],
                            values: anomalyDetail.chart_payload.values || [],
                            periods: anomalyDetail.chart_payload.periods || [],
                          }}
                          anomaly={{
                            comparison_mean: anomalyDetail.comparison_mean || 0,
                            recent_mean: anomalyDetail.recent_mean || 0,
                            std_dev: anomalyDetail.stddev || 0,
                            percent_change: anomalyDetail.pct_change || 0,
                            period_type: anomalyDetail.period_type || "month",
                          }}
                          metadata={{
                            object_name: anomalyDetail.object_name ?? undefined,
                            field_name: anomalyDetail.metric_name ?? undefined,
                            y_axis_label: undefined,
                            period_type: anomalyDetail.period_type,
                            group_field_name: anomalyDetail.group_field ?? undefined,
                            group_value: anomalyDetail.group_value ?? undefined,
                            city_name: anomalyDetail.city_name ?? undefined,
                            district: anomalyDetail.district,
                          }}
                          height={400}
                        />
                      ) : (
                        <div className={metricStyles.muted} style={{ padding: 16, textAlign: "center" }}>
                          No chart data available for this anomaly
                        </div>
                      )}

                      {/* Navigation info */}
                      {getFilteredAnomalies().length > 1 && (
                        <div style={{ 
                          textAlign: "center", 
                          marginTop: "12px", 
                          fontSize: "12px", 
                          color: "var(--text-secondary)" 
                        }}>
                          {(() => {
                            const filtered = getFilteredAnomalies();
                            const currentIndex = filtered.findIndex((a: any) => a.id === selectedAnomalyId);
                            return `${currentIndex + 1} of ${filtered.length}`;
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Next button */}
                    {getFilteredAnomalies().length > 1 && (
                      <button
                        onClick={goToNextAnomaly}
                        className={metricStyles.iconBtn}
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-primary)",
                          flexShrink: 0,
                        }}
                        title="Next anomaly"
                      >
                        <i className="fas fa-chevron-right" />
                      </button>
                    )}
                  </div>

                    {/* Additional stats section */}
                    <div style={{ marginTop: 16, padding: 12, background: "var(--bg-secondary)", borderRadius: "8px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
                        <div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Recent Value</div>
                          <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                            {(anomalyDetail.recent_mean || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Historical Average</div>
                          <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                            {(anomalyDetail.comparison_mean || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Difference</div>
                          <div
                            style={{
                              fontSize: "16px",
                              fontWeight: 600,
                              color:
                                (anomalyDetail.recent_mean || 0) > (anomalyDetail.comparison_mean || 0)
                                  ? "var(--success-text, #10b981)"
                                  : "var(--error-text, #ef4444)",
                            }}
                          >
                            {((anomalyDetail.recent_mean || 0) - (anomalyDetail.comparison_mean || 0) > 0 ? "+" : "")}
                            {((anomalyDetail.recent_mean || 0) - (anomalyDetail.comparison_mean || 0)).toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>% Change</div>
                          <div
                            style={{
                              fontSize: "16px",
                              fontWeight: 600,
                              color: (anomalyDetail.pct_change || 0) > 0 ? "var(--success-text, #10b981)" : "var(--error-text, #ef4444)",
                            }}
                          >
                            {(anomalyDetail.pct_change || 0) > 0 ? "+" : ""}
                            {(anomalyDetail.pct_change || 0).toFixed(2)}%
                          </div>
                        </div>
                        {anomalyDetail.stddev && anomalyDetail.stddev > 0 && (
                          <div>
                            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Z-Score (σ)</div>
                            <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                              {(
                                Math.abs((anomalyDetail.recent_mean || 0) - (anomalyDetail.comparison_mean || 0)) /
                                anomalyDetail.stddev
                              ).toFixed(2)}σ
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                </>
                ) : null
              ) : (
                <>
                  {/* List View */}
                  {/* Period Type Filter */}
                  <div 
                    style={{ 
                      marginBottom: "12px", 
                      display: "flex", 
                      alignItems: "center", 
                      gap: "8px",
                      flexWrap: "wrap"
                    }}
                    className={metricStyles.anomalyFilter}
                  >
                    <label style={{ 
                      fontSize: "12px", 
                      fontWeight: 600, 
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap"
                    }}>
                      Filter:
                    </label>
                    <select
                      value={anomalyPeriodFilter}
                      onChange={(e) => setAnomalyPeriodFilter(e.target.value)}
                      style={{
                        padding: "4px 8px",
                        fontSize: "12px",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "4px",
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        minWidth: "120px",
                      }}
                    >
                      <option value="all">All Periods</option>
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                    </select>
                  </div>
                  {(() => {
                    const filteredResults = getFilteredAnomalies();
                    
                    return filteredResults.length === 0 ? (
                      <div className={metricStyles.muted} style={{ padding: 16 }}>
                        No anomaly data found for this metric{anomalyPeriodFilter !== "all" ? ` with period type "${anomalyPeriodFilter}"` : ""}.
                      </div>
                    ) : (
                      <div className={metricStyles.anomalyTableWrapper}>
                        <table className={metricStyles.anomalyTable}>
                    <thead>
                      <tr>
                        <th className={metricStyles.anomalyTh}></th>
                        <th className={metricStyles.anomalyTh}>
                          <span className={metricStyles.anomalyThFull}>Group</span>
                          <span className={metricStyles.anomalyThShort}>Grp</span>
                        </th>
                        <th className={metricStyles.anomalyTh}>
                          <span className={metricStyles.anomalyThFull}>Recent Date</span>
                          <span className={metricStyles.anomalyThShort}>Date</span>
                        </th>
                        <th className={metricStyles.anomalyTh}>
                          <span className={metricStyles.anomalyThFull}>Comparison Mean</span>
                          <span className={metricStyles.anomalyThShort}>Compare</span>
                        </th>
                        <th className={metricStyles.anomalyTh}>
                          <span className={metricStyles.anomalyThFull}>Recent Value</span>
                          <span className={metricStyles.anomalyThShort}>Recent</span>
                        </th>
                        <th className={metricStyles.anomalyTh}>
                          <span className={metricStyles.anomalyThFull}>Difference</span>
                          <span className={metricStyles.anomalyThShort}>Diff</span>
                        </th>
                        <th className={metricStyles.anomalyTh}>
                          <span className={metricStyles.anomalyThFull}>% Change</span>
                          <span className={metricStyles.anomalyThShort}>%</span>
                        </th>
                        <th className={metricStyles.anomalyTh}>σ</th>
                        <th className={metricStyles.anomalyTh}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.slice(0, 50).map((anomaly, idx) => {
                      const recentMean = anomaly.recent_mean ?? 0;
                      const comparisonMean = anomaly.comparison_mean ?? 0;
                      const stddev = anomaly.stddev ?? 0;
                      const difference = recentMean - comparisonMean;
                      const isAbove = difference > 0;
                      const pctChange = anomaly.pct_change ?? 0;
                      
                      // Calculate deviation from mean in standard deviations
                      const deviationFromMean = stddev > 0 ? (difference / stddev) : 0;
                      const deviationText = stddev > 0 
                        ? `${deviationFromMean > 0 ? "+" : ""}${deviationFromMean.toFixed(2)}σ`
                        : "—";
                      
                      // Get greendirection from metric data
                      const greendirection = (metricData as any)?.greendirection?.toLowerCase();
                      let changeColor = "var(--text-primary)";
                      let isGood = false;
                      
                      if (greendirection && pctChange !== 0) {
                        if (greendirection === 'up') {
                          // Up is good - positive change is good
                          isGood = pctChange > 0;
                          changeColor = isGood ? "var(--success-text, #10b981)" : "var(--error-text, #ef4444)";
                        } else if (greendirection === 'down') {
                          // Down is good - negative change is good
                          isGood = pctChange < 0;
                          changeColor = isGood ? "var(--success-text, #10b981)" : "var(--error-text, #ef4444)";
                        }
                      } else {
                        // Fallback: positive change is green, negative is red
                        changeColor = pctChange > 0 ? "var(--success-text, #10b981)" : "var(--error-text, #ef4444)";
                      }
                      
                      // Format period date
                      const formatPeriodDate = (periodType: string, chartPayload: any) => {
                        if (!chartPayload || !chartPayload.dates || !Array.isArray(chartPayload.dates) || chartPayload.dates.length === 0) {
                          return "—";
                        }
                        
                        // Get the most recent date from recent period
                        const recentIndices: number[] = [];
                        if (Array.isArray(chartPayload.periods)) {
                          chartPayload.periods.forEach((p: string, i: number) => {
                            if (p === "recent") recentIndices.push(i);
                          });
                        }
                        
                        // If no recent periods found, use the last date
                        let dateStr: string;
                        if (recentIndices.length > 0) {
                          const lastRecentIdx = recentIndices[recentIndices.length - 1];
                          dateStr = chartPayload.dates[lastRecentIdx];
                        } else {
                          dateStr = chartPayload.dates[chartPayload.dates.length - 1];
                        }
                        
                        if (!dateStr) return "—";
                        
                        try {
                          if (periodType === "year") {
                            return dateStr.split("-")[0];
                          } else if (periodType === "month") {
                            const [year, month] = dateStr.split("-");
                            if (!year || !month) return dateStr;
                            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                            const monthNum = parseInt(month);
                            if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return dateStr;
                            return `${monthNames[monthNum - 1]} ${year}`;
                          } else if (periodType === "week") {
                            // Handle ISO week format YYYY-WXX
                            if (dateStr.includes("W")) {
                              return dateStr;
                            }
                            const parts = dateStr.split("-");
                            if (parts.length >= 3) {
                              const [year, month, day] = parts;
                              return `${month}/${day}/${year}`;
                            }
                            return dateStr;
                          } else {
                            // day
                            const parts = dateStr.split("-");
                            if (parts.length >= 3) {
                              const [year, month, day] = parts;
                              return `${month}/${day}/${year}`;
                            }
                            return dateStr;
                          }
                        } catch {
                          return dateStr;
                        }
                      };
                      
                      const periodDate = formatPeriodDate(anomaly.period_type, anomaly.chart_payload);
                      
                      return (
                        <tr 
                          key={idx} 
                          className={metricStyles.anomalyTr}
                          style={{ 
                            backgroundColor: "var(--bg-primary, #ffffff)",
                            opacity: anomaly.is_anomaly ? 1 : 0.7
                          }}
                        >
                          {/* Sparkline */}
                          <td className={metricStyles.anomalyTd}>
                            {anomaly.chart_payload && 
                             Array.isArray(anomaly.chart_payload.dates) && 
                             Array.isArray(anomaly.chart_payload.values) &&
                             anomaly.chart_payload.dates.length > 0 ? (
                              <AnomalySparkline
                                chartData={{
                                  dates: anomaly.chart_payload.dates,
                                  values: anomaly.chart_payload.values,
                                  periods: Array.isArray(anomaly.chart_payload.periods) 
                                    ? anomaly.chart_payload.periods 
                                    : undefined,
                                }}
                                height={60}
                                width={120}
                                showAverage={true}
                                showAnnotations={true}
                              />
                            ) : (
                              <div style={{ width: "120px", height: "60px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "10px" }}>
                                No data
                              </div>
                            )}
                          </td>
                          
                          {/* Group Field: Value */}
                          <td className={metricStyles.anomalyTd}>
                            <div className={metricStyles.anomalyGroup}>
                              <span className={metricStyles.anomalyGroupLabel}>
                                {anomaly.group_field ?? "—"}:
                              </span>
                              <span className={metricStyles.anomalyGroupValue}>
                                {anomaly.group_value ?? "—"}
                              </span>
                            </div>
                          </td>
                          
                          {/* Recent Date */}
                          <td className={metricStyles.anomalyTd}>
                            {periodDate}
                          </td>
                          
                          {/* Comparison Mean */}
                          <td className={metricStyles.anomalyTd}>
                            {comparisonMean.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                          
                          {/* Recent Value */}
                          <td className={metricStyles.anomalyTd}>
                            {recentMean.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                          
                          {/* Difference */}
                          <td className={metricStyles.anomalyTd} style={{ color: changeColor, fontWeight: 600 }}>
                            {difference > 0 ? "+" : ""}{difference.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                          
                          {/* Percent Change */}
                          <td className={metricStyles.anomalyTd} style={{ color: changeColor, fontWeight: 600 }}>
                            {pctChange > 0 ? "+" : ""}{pctChange.toFixed(1)}%
                          </td>
                          
                          {/* Sigma */}
                          <td className={metricStyles.anomalyTd}>
                            <div className={metricStyles.anomalyDeviation}>
                              <span style={{ 
                                color: changeColor,
                                fontSize: "14px",
                                fontWeight: "bold",
                                marginRight: "4px"
                              }}>
                                {isAbove ? "↑" : "↓"}
                              </span>
                              <span style={{ color: changeColor }}>{deviationText}</span>
                            </div>
                          </td>
                          
                          {/* Actions */}
                          <td className={metricStyles.anomalyTd}>
                            <button
                              className={metricStyles.primaryBtn}
                              onClick={() => {
                                if (anomaly.id !== null && anomaly.id !== undefined) {
                                  openAnomalyChart(anomaly.id);
                                }
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "4px 8px",
                                fontSize: "12px",
                              }}
                            >
                              <i className="fas fa-chart-line" /> View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                  {filteredResults.length > 50 && (
                    <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-secondary)", textAlign: "center" }}>
                      Showing first 50 of {filteredResults.length} results
                    </div>
                  )}
                  <div style={{ marginTop: "16px", padding: "12px", background: "var(--bg-secondary)", borderRadius: "4px", fontSize: "12px", color: "var(--text-secondary)" }}>
                    <strong>Note:</strong> All anomaly detection results are stored, including those that don't meet the anomaly threshold. 
                    Results flagged as anomalies exceed 2.0 standard deviations.
                  </div>
                </div>
                );
              })()}
                </>
              )}
                </div>
                <div className={metricStyles.modalFooter}>
                  <button
                    className={metricStyles.secondaryBtn}
                    onClick={closeViewAnomalies}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

    </div>
  );
}


