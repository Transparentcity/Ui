"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import {
  clearCityStructureCache,
  getPopulationSource,
  refreshPopulation,
  syncPopulationToMetric,
  lookupCensusGeoid,
  type PopulationSourceConfig,
} from "@/lib/apiClient";
import {
  useCityAdmin,
  useCityAdminStructure,
  useAvailableModels,
  useUpdateCity,
  useUpdateCityStructure,
  useRefreshCityUrls,
  useLoadCityData,
  useRestructureCity,
  useReloadQueryConfig,
  useReExtractLeaders,
  useRecreateStructureFromQueryConfigs,
  useCreateCityLeader,
  useUpdateCityLeader,
  useDeleteCityLeader,
  cityAdminKeys,
} from "@/lib/hooks/useCityAdmin";
import { useQueryClient } from "@tanstack/react-query";
import { pickDefaultModelKey } from "@/lib/modelDefaults";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import DatasetsList from "@/components/DatasetsList";
import Loader from "./Loader";
import NewslettersTabPanel from "@/components/NewslettersTabPanel";
import CityMetricsTab from "./cityAdmin/CityMetricsTab";
import ShapeLayersSection from "./cityAdmin/ShapeLayersSection";
import { portalPlatformLabel } from "@/lib/portalPlatformLabel";
import styles from "./CityDataAdmin.module.css";

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
  portal_type?: string | null;
  is_active: boolean;
  is_launched?: boolean;
  datasets_count?: number;
  vector_db_points?: number;
  vector_db_size_mb?: number;
  last_fetch_at?: string;
  last_fetch_status?: string;
  last_fetch_error?: string;
  structure_status?: string;
  metrics?: Metric[];
  governance_structures?: GovernanceStructure[];
}

interface Metric {
  id: number;
  metric_name: string;
  metric_key: string;
  category?: string;
  subcategory?: string;
  show_on_dash?: boolean;
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

interface GovernanceStructure {
  id?: number;
  body_name?: string;
  structure_type?: string;
  selection_method?: string;
}

interface CityStructure {
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
  
  // React Query hooks for data fetching
  const queryClient = useQueryClient();
  const { data: cityData, isLoading: loadingCity, error: cityError, refetch: refetchCity } = useCityAdmin(cityId);
  const { data: structureData, isLoading: loadingStructure, refetch: refetchStructure } = useCityAdminStructure(cityId);
  const { data: availableModelsData } = useAvailableModels();

  // When a restructure_city job completes for this city, refetch structure so leaders/geographic data appear
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ job_id: string; data: { status: string; job_type?: string; job_metadata?: { city_id?: number } } }>;
      const { data } = ce.detail ?? {};
      if (
        data?.status === "completed" &&
        data?.job_type === "restructure_city" &&
        data?.job_metadata?.city_id === cityId
      ) {
        clearCityStructureCache(cityId);
        queryClient.invalidateQueries({ queryKey: cityAdminKeys.structure(cityId) });
        queryClient.invalidateQueries({ queryKey: cityAdminKeys.detail(cityId) });
        refetchStructure();
        refetchCity();
      }
    };
    window.addEventListener("job:update", handler);
    return () => window.removeEventListener("job:update", handler);
  }, [cityId, queryClient, refetchStructure, refetchCity]);
  
  // React Query mutation hooks
  const updateCityMutation = useUpdateCity();
  const updateCityStructureMutation = useUpdateCityStructure();
  const refreshCityUrlsMutation = useRefreshCityUrls();
  const loadCityDataMutation = useLoadCityData();
  const restructureCityMutation = useRestructureCity();
  const reloadQueryConfigMutation = useReloadQueryConfig();
  const reExtractLeadersMutation = useReExtractLeaders();
  const recreateStructureFromQueryConfigsMutation = useRecreateStructureFromQueryConfigs();
  const createCityLeaderMutation = useCreateCityLeader();
  const updateCityLeaderMutation = useUpdateCityLeader();
  const deleteCityLeaderMutation = useDeleteCityLeader();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"data" | "structure" | "metrics" | "datasets" | "newsletters">("data");

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    state: "",
    country: "",
    population: "",
    census_place_geoid: "",
    main_domain: "",
    main_portal_url: "",
    all_portal_urls: "",
    is_active: false,
    is_launched: false,
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
  // Note: model defaults are centralized in `lib/modelDefaults.ts`

  const [populationSource, setPopulationSource] = useState<PopulationSourceConfig | null | "none">(null);
  const [populationRefreshLoading, setPopulationRefreshLoading] = useState(false);
  const [populationRefreshError, setPopulationRefreshError] = useState<string | null>(null);
  const [populationSyncLoading, setPopulationSyncLoading] = useState(false);
  const [populationSyncError, setPopulationSyncError] = useState<string | null>(null);
  const [lookupGeoidLoading, setLookupGeoidLoading] = useState(false);
  const [lookupGeoidResult, setLookupGeoidResult] = useState<{
    census_place_geoid: string | null;
    updated?: boolean;
    message?: string;
  } | null>(null);
  const [populationMetricId, setPopulationMetricId] = useState<number | null>(null);


  // Load population source config when Data tab is active
  useEffect(() => {
    if (activeTab !== "data" || !cityId) return;
    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => getPopulationSource(cityId, token))
      .then((config) => {
        if (!cancelled) {
          if (config.configured === false) {
            setPopulationSource("none");
            setPopulationMetricId(null);
          } else {
            setPopulationSource(config);
            setPopulationMetricId(config.population_metric_id ?? null);
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPopulationSource("none");
          setPopulationMetricId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, cityId, getAccessTokenSilently]);

  const handleRefreshPopulation = async () => {
    setPopulationRefreshError(null);
    setPopulationRefreshLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const result = await refreshPopulation(cityId, token);
      if (result.success) {
        const msg = result.rows_written != null
          ? `Ingested ${result.rows_written} district-level value(s) from ${result.source_name ?? "source"}.`
          : "Refresh completed.";
        alert(msg);
        refetchCity();
        getAccessTokenSilently().then((t) =>
          getPopulationSource(cityId, t).then((c) =>
            setPopulationSource(c.configured === false ? "none" : c)
          )
        );
      } else {
        setPopulationRefreshError(result.error ?? "Refresh failed");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPopulationRefreshError(message);
    } finally {
      setPopulationRefreshLoading(false);
    }
  };

  const handleSyncPopulationToMetric = async () => {
    setPopulationSyncError(null);
    setPopulationSyncLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const result = await syncPopulationToMetric(cityId, token);
      if (result.success) {
        let msg: string;
        if (result.metric_sync_skipped) {
          msg =
            result.city_population_updated && result.city_population != null
              ? `Updated city population to ${result.city_population.toLocaleString()} from cached data (no population metric configured).`
              : result.message ??
                "No population metric configured; city population was not changed (no citywide cached value).";
        } else if (result.charts_updated != null) {
          msg = `Synced population to metric (${result.charts_updated} chart(s) updated).`;
        } else {
          msg = result.message ?? "Sync completed.";
        }
        alert(msg);
        if (result.city_population_updated) {
          refetchCity();
        }
      } else {
        setPopulationSyncError(result.error ?? "Sync failed");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPopulationSyncError(message);
    } finally {
      setPopulationSyncLoading(false);
    }
  };

  const handleLookupCensusGeoid = async (updateCity: boolean) => {
    setLookupGeoidResult(null);
    setLookupGeoidLoading(true);
    if (updateCity) {
      setPopulationRefreshError(null);
    }
    try {
      const token = await getAccessTokenSilently();
      const result = await lookupCensusGeoid(cityId, token, {
        update_city: updateCity,
        ensure_acs_source: updateCity,
      });
      setLookupGeoidResult({
        census_place_geoid: result.census_place_geoid,
        updated: result.updated,
        message: result.message,
      });
      if (result.updated && result.census_place_geoid) {
        setFormData((prev) => ({ ...prev, census_place_geoid: result.census_place_geoid ?? "" }));
        if (updateCity) {
          // GEOID + ACS source are saved; pull ACS so cities.population and cache update,
          // then reload city so the City Data table (Population row) shows the new value.
          try {
            await refreshPopulation(cityId, token);
          } catch (refreshErr: unknown) {
            const msg =
              refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
            setPopulationRefreshError(
              `Census GEOID was saved, but refreshing population from ACS failed: ${msg}. Use "Refresh from source" below.`
            );
          }
          const config = await getPopulationSource(cityId, token);
          if (config.configured === false) {
            setPopulationSource("none");
            setPopulationMetricId(null);
          } else {
            setPopulationSource(config);
            setPopulationMetricId(config.population_metric_id ?? null);
          }
        }
        await refetchCity();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setLookupGeoidResult({ census_place_geoid: null, message: message });
    } finally {
      setLookupGeoidLoading(false);
    }
  };

  // Initialize form data when city data loads
  useEffect(() => {
    if (cityData) {
      const cd = cityData as { census_place_geoid?: string | null };
      setFormData({
        name: cityData.city_name || cityData.name || "",
        state: cityData.state || "",
        country: cityData.country || "",
        population: cityData.population?.toString() || "",
        census_place_geoid: cd.census_place_geoid ?? "",
        main_domain: cityData.main_domain || "",
        main_portal_url: cityData.main_portal_url || "",
        all_portal_urls: JSON.stringify(cityData.all_portal_urls || [], null, 2),
        is_active: cityData.is_active || false,
        is_launched: cityData.is_launched || false,
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
        census_place_geoid: formData.census_place_geoid.trim() || null,
        main_domain: formData.main_domain.trim() || null,
        main_portal_url: formData.main_portal_url.trim() || null,
        all_portal_urls: allUrls,
        is_active: formData.is_active,
        is_launched: formData.is_launched,
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
    if (
      !confirm(
        "Refresh dataset URLs and full index for this city?\n\n" +
          "This removes existing dataset rows and Qdrant vectors for the city, then re-fetches URLs, " +
          "metadata, and rebuilds the search index."
      )
    ) {
      return;
    }

    try {
      const result = await refreshCityUrlsMutation.mutateAsync(cityId);
      notifyJobCreated(result.job_id);
      alert(`URL refresh and re-index started! Job ID: ${result.job_id}\n\nYou can monitor progress in the jobs dropdown.`);
      setTimeout(() => refetchCity(), 2000);
    } catch (err: any) {
      alert("Failed to refresh URLs: " + err.message);
    }
  };

  const handleRefreshMetadata = async () => {
    if (
      !confirm(
        "Re-load datasets and metadata for this city?\n\n" +
          "This removes existing dataset rows and Qdrant vectors for the city, then re-fetches URLs, " +
          "metadata, and rebuilds the search index."
      )
    ) {
      return;
    }

    try {
      const result = await loadCityDataMutation.mutateAsync({
        data: {
          city_ids: [cityId],
          fetch_urls: true,
          fetch_metadata: true,
          refresh: true,
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
      clearCityStructureCache(cityId);
      const result = await restructureCityMutation.mutateAsync({
        cityId,
        model: selectedModel || undefined,
      });
      notifyJobCreated(result.job_id);
      alert(`Re-structuring started! Job ID: ${result.job_id}\n\nWhen the job completes, this tab will refresh automatically. You can also click "Refresh structure data" to load the latest leaders and geographic structures.`);
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
        <button
          className={`${styles.tabBtn} ${activeTab === "newsletters" ? styles.tabBtnActive : ""}` }
          onClick={() => setActiveTab("newsletters")}
        >
          Newsletters
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
                    Census place GEOID
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <input
                      type="text"
                      value={formData.census_place_geoid}
                      onChange={(e) => setFormData({ ...formData, census_place_geoid: e.target.value })}
                      placeholder="e.g. 0667000 (2-digit state FIPS + 5-digit place FIPS)"
                      style={{
                        width: "100%",
                        padding: "6px",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "4px",
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                      Required for ACS population source. Use &quot;Lookup GEOID &amp; set ACS source&quot; below to resolve from city name + state and enable &quot;Refresh ACS&quot; from the cities table.
                    </p>
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
                    Portal platform
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <span style={{ fontWeight: 500 }}>
                      {portalPlatformLabel(
                        cityDataTyped?.portal_type,
                        formData.main_portal_url || cityDataTyped?.main_portal_url
                      )}
                    </span>
                    <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                      Set by the &quot;Determine portal type&quot; job on the city list, or inferred from the portal URL. Not editable here.
                    </p>
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
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      background: "var(--bg-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Launched
                  </th>
                  <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={formData.is_launched}
                        onChange={(e) => setFormData({ ...formData, is_launched: e.target.checked })}
                      />
                      <span style={{ color: formData.is_launched ? "var(--color-success, #16a34a)" : "var(--text-secondary)" }}>
                        {formData.is_launched
                          ? "Launched — metrics and city structure visible publicly"
                          : "Not launched — metrics hidden from public pages"}
                      </span>
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

          {/* Population by district */}
          <div style={{ marginBottom: "24px" }}>
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
              <h3 style={{ margin: 0 }}>Population by district</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                {populationSource != null && populationSource !== "none" && (
                  <>
                    <button
                      onClick={handleRefreshPopulation}
                      disabled={populationRefreshLoading}
                      style={{
                        padding: "8px 16px",
                        background: "var(--brand-primary)",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: populationRefreshLoading ? "not-allowed" : "pointer",
                        fontWeight: 500,
                        opacity: populationRefreshLoading ? 0.6 : 1,
                      }}
                    >
                      {populationRefreshLoading ? "Refreshing…" : "Refresh from source"}
                    </button>
                    <button
                      onClick={handleSyncPopulationToMetric}
                      disabled={populationSyncLoading}
                      style={{
                        padding: "8px 16px",
                        background: "#0ea5e9",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: populationSyncLoading ? "not-allowed" : "pointer",
                        fontWeight: 500,
                        opacity: populationSyncLoading ? 0.6 : 1,
                      }}
                    >
                      {populationSyncLoading ? "Syncing…" : "Sync to metric"}
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleLookupCensusGeoid(false)}
                  disabled={lookupGeoidLoading}
                  style={{
                    padding: "8px 16px",
                    background: "#64748b",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: lookupGeoidLoading ? "not-allowed" : "pointer",
                    fontWeight: 500,
                    opacity: lookupGeoidLoading ? 0.6 : 1,
                  }}
                >
                  {lookupGeoidLoading ? "Looking up…" : "Lookup Census GEOID"}
                </button>
                <button
                  onClick={() => handleLookupCensusGeoid(true)}
                  disabled={lookupGeoidLoading}
                  style={{
                    padding: "8px 16px",
                    background: "#0f766e",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: lookupGeoidLoading ? "not-allowed" : "pointer",
                    fontWeight: 500,
                    opacity: lookupGeoidLoading ? 0.6 : 1,
                  }}
                  title="Sets Census GEOID and population source to ACS so 'Refresh ACS' works from the cities table"
                >
                  {lookupGeoidLoading ? "…" : "Lookup GEOID & set ACS source"}
                </button>
              </div>
            </div>
            {populationRefreshError && (
              <div
                style={{
                  padding: "12px",
                  marginBottom: "12px",
                  background: "#fee2e2",
                  color: "#991b1b",
                  borderRadius: "4px",
                  fontSize: "14px",
                }}
              >
                {populationRefreshError}
              </div>
            )}
            {populationSyncError && (
              <div
                style={{
                  padding: "12px",
                  marginBottom: "12px",
                  background: "#fee2e2",
                  color: "#991b1b",
                  borderRadius: "4px",
                  fontSize: "14px",
                }}
              >
                {populationSyncError}
              </div>
            )}
            {lookupGeoidResult && (
              <div
                style={{
                  padding: "12px",
                  marginBottom: "12px",
                  background: lookupGeoidResult.census_place_geoid ? "#d1fae5" : "#fef3c7",
                  color: lookupGeoidResult.census_place_geoid ? "#065f46" : "#92400e",
                  borderRadius: "4px",
                  fontSize: "14px",
                }}
              >
                {lookupGeoidResult.census_place_geoid
                  ? `Census place GEOID: ${lookupGeoidResult.census_place_geoid}${lookupGeoidResult.updated ? " (city updated)" : ""}`
                  : lookupGeoidResult.message ?? "No matching Census place found."}
              </div>
            )}
            {populationSource === null && (
              <p style={{ color: "var(--text-secondary)", margin: 0 }}>Loading…</p>
            )}
            {populationSource === "none" && (
              <p style={{ color: "var(--text-secondary)", margin: 0 }}>
                No population source configured for this city. Configure one via the API (PUT{" "}
                <code>/api/admin/population/sources/{cityId}</code>) to pull district-level population from
                Socrata, direct URL, manual entry, or ACS. Then you can run refresh and sync here.
              </p>
            )}
            {populationSource != null && populationSource !== "none" && (
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
                      Source
                    </th>
                    <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                      {populationSource.source_name ?? populationSource.source_type}
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
                      Last refreshed
                    </th>
                    <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                      {populationSource.last_refreshed_at
                        ? new Date(populationSource.last_refreshed_at).toLocaleString()
                        : "Never"}
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
                      Status
                    </th>
                    <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 500,
                          background:
                            populationSource.last_refresh_status === "success"
                              ? "#d1fae5"
                              : populationSource.last_refresh_status === "failed"
                              ? "#fee2e2"
                              : "#f3f4f6",
                          color:
                            populationSource.last_refresh_status === "success"
                              ? "#065f46"
                              : populationSource.last_refresh_status === "failed"
                              ? "#991b1b"
                              : "#374151",
                        }}
                      >
                        {populationSource.last_refresh_status ?? "—"}
                      </span>
                    </td>
                  </tr>
                  {populationSource.last_refresh_error && (
                    <tr>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "12px",
                          background: "var(--bg-secondary)",
                          fontWeight: 600,
                        }}
                      >
                        Last error
                      </th>
                      <td
                        style={{
                          padding: "12px",
                          borderBottom: "1px solid var(--border-primary)",
                          color: "#dc2626",
                          fontSize: "12px",
                        }}
                      >
                        {populationSource.last_refresh_error}
                      </td>
                    </tr>
                  )}
                  {populationMetricId != null && (
                    <tr>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "12px",
                          background: "var(--bg-secondary)",
                          fontWeight: 600,
                        }}
                      >
                        Population metric ID
                      </th>
                      <td style={{ padding: "12px", borderBottom: "1px solid var(--border-primary)" }}>
                        <code style={{ background: "var(--bg-tertiary)", padding: "2px 6px", borderRadius: "4px" }}>{populationMetricId}</code>
                        <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--text-secondary)" }}>
                          Use as denominator_metric_id in derived metrics (e.g. per capita).
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
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
              onClick={async () => {
                clearCityStructureCache(cityId);
                queryClient.invalidateQueries({ queryKey: cityAdminKeys.structure(cityId) });
                queryClient.invalidateQueries({ queryKey: cityAdminKeys.detail(cityId) });
                await refetchStructure();
                await refetchCity();
              }}
              style={{
                padding: "8px 16px",
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-primary)",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
              title="Reload structure from server (leaders, geographic structures, query configs). Use after re-structure job completes."
            >
              <span>↻</span>
              <span>Refresh structure data</span>
            </button>
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

          {/* Shape Layers Box */}
          <ShapeLayersSection cityId={cityId} />

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

            // Normalize district for dedupe: 0 and "0" must produce the same key
            // (district 0 = at-large/citywide; `0 || "null"` would wrongly yield "null")
            const districtKey = (d: any): string => {
              if (d === undefined || d === null || d === "") return "null";
              const n = Number(d);
              return Number.isNaN(n) ? String(d).toLowerCase() : String(n);
            };
            const officialKey = (o: any): string =>
              `${(o.name || "").toLowerCase()}_${districtKey(o.district)}`;

            leadersConfigs.forEach((config: any) => {
              // Add query_output entries (regular dataset entries)
              if (config.query_output && Array.isArray(config.query_output)) {
                config.query_output.forEach((official: any) => {
                  const key = officialKey(official);
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
                  const key = officialKey(official);
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
              const key = officialKey(leader);
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
                          
                          // Try to find matching governance structure
                          const govStructures = structureData?.governance_structures || [];
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
                              const officialTitle = official.title || official.position || null;
                              
                              if (!officialName) continue;
                              
                              await createCityLeaderMutation.mutateAsync({
                                cityId,
                                leader: {
                                  city_id: cityId,
                                  name: officialName,
                                  title: officialTitle,
                                  district: districtNum,
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
                            
                            // Build key for lookup
                            const keyNoTitle = `${normalizedName}_${districtValue}`;
                            
                            // If not found by ID, try to find stored leader by name+district first (using key without title)
                            // This allows us to get the correct title from the database
                            if (!storedLeader) {
                              storedLeader = storedLeadersMap.get(keyNoTitle);
                            }
                            
                            // If not found, try with title if we have one
                            if (!storedLeader) {
                              const officialTitle = official.title || official.position || null;
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
                            const officialTitle = storedLeader?.title || official.title || official.position || null;
                            
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
      {activeTab === "metrics" && cityDataTyped && (
        <CityMetricsTab
          cityId={cityId}
          metrics={cityDataTyped.metrics ?? []}
          cityName={cityDataTyped.city_name || cityDataTyped.name || ""}
          onMetricChange={refetchCity}
        />
      )}


      {/* Datasets Tab */}
      {activeTab === "datasets" && (
        <div>
          <DatasetsList cityId={cityId} showStats={false} showCityFilter={false} />
        </div>
      )}

      {/* Newsletters Tab */}
      {activeTab === "newsletters" && (
        <div>
          <NewslettersTabPanel
            cityId={cityId}
            cityName={cityData?.name || ""}
            initialDistrict={null}
            isAdmin={true}
            onClose={() => setActiveTab("data")}
          />
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

      {/* metrics modals moved to CityMetricsTab */}



    </div>
  );
}


