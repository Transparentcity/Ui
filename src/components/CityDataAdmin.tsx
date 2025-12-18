"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import {
  getCityAdmin,
  updateCity,
  getCityStructure,
  updateCityStructure,
  refreshCityUrls,
  refreshCityMetadata,
  restructureCity,
  reloadQueryConfig,
  reloadAllGeographicQueryConfigs,
  loadCityData as loadCityDataApi,
  createCityLeader,
  updateCityLeader,
  deleteCityLeader,
  CityLeader,
  getAvailableModels,
  ModelGroupInfo,
} from "@/lib/apiClient";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import DatasetsList from "@/components/DatasetsList";

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
}

interface GeographicStructure {
  structure_name?: string;
  structure_type?: string;
  identifier_field?: string;
}

interface GovernanceStructure {
  body_name?: string;
  structure_type?: string;
  selection_method?: string;
}

interface CityStructure {
  geographic_structures?: GeographicStructure[];
  leaders?: any[];
  query_configs?: any[];
  shapefiles?: any[];
}

interface CityDataAdminProps {
  cityId: number;
  onBack?: () => void;
}

export default function CityDataAdmin({ cityId, onBack }: CityDataAdminProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityData, setCityData] = useState<CityData | null>(null);
  const [structureData, setStructureData] = useState<CityStructure | null>(null);
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
  });

  const [editingLeader, setEditingLeader] = useState<{
    index: number;
    data: any;
    isNew: boolean;
  } | null>(null);

  const [availableModels, setAvailableModels] = useState<ModelGroupInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [hoveredQuery, setHoveredQuery] = useState<{ config: any; x: number; y: number } | null>(null);

  useEffect(() => {
    loadCityData();
    loadAvailableModels();
  }, [cityId]);

  const loadAvailableModels = async () => {
    try {
      const token = await getAccessTokenSilently();
      const models = await getAvailableModels(token);
      setAvailableModels(models);
      // Set default model (first available model from first group)
      if (models.length > 0 && models[0].models.length > 0) {
        const firstAvailable = models[0].models.find(m => m.is_available);
        if (firstAvailable) {
          setSelectedModel(firstAvailable.key);
        }
      }
    } catch (err) {
      console.error("Error loading available models:", err);
    }
  };

  const loadCityData = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();

      // Load city data
      const city = await getCityAdmin(cityId, token);
      setCityData(city);

      // Initialize form data
      setFormData({
        name: city.city_name || city.name || "",
        state: city.state || "",
        country: city.country || "",
        population: city.population?.toString() || "",
        main_domain: city.main_domain || "",
        main_portal_url: city.main_portal_url || "",
        all_portal_urls: JSON.stringify(city.all_portal_urls || [], null, 2),
        is_active: city.is_active || false,
      });

      // Load structure data
      try {
        const structure = await getCityStructure(cityId, token);
        setStructureData(structure);
        setStructureFormData({
          leaders: JSON.stringify(structure.leaders || [], null, 2),
          query_configs: JSON.stringify(structure.query_configs || [], null, 2),
        });
      } catch (e) {
        console.warn("Could not load structure data:", e);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load city data");
      console.error("Error loading city data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCityData = async () => {
    try {
      setSaving(true);
      setError(null);
      const token = await getAccessTokenSilently();

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

      await updateCity(cityId, updateData, token);
      alert("City data saved successfully!");
      await loadCityData();
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
      const token = await getAccessTokenSilently();

      // Parse JSON from textareas
      let leaders, query_configs;

      try {
        leaders = structureFormData.leaders.trim()
          ? JSON.parse(structureFormData.leaders)
          : [];
      } catch (e) {
        throw new Error("Invalid JSON in City Leaders");
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
        geographic_structures: structureData?.geographic_structures || [],
        governance_structures: [], // No longer used in UI
        leaders,
        query_configs,
        mappings: structureData?.mappings || [],
      };

      await updateCityStructure(cityId, structureConfig, token);
      alert("City structure saved successfully!");
      await loadCityData();
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
      const token = await getAccessTokenSilently();
      const result = await refreshCityUrls(cityId, token);
      notifyJobCreated(result.job_id);
      alert(`URL refresh started! Job ID: ${result.job_id}\n\nYou can monitor progress in the jobs dropdown.`);
      setTimeout(() => loadCityData(), 2000);
    } catch (err: any) {
      alert("Failed to refresh URLs: " + err.message);
    }
  };

  const handleRefreshMetadata = async () => {
    if (!confirm("Re-load datasets and metadata for this city? This will fetch the latest URLs and detailed metadata for all datasets.")) {
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      const result = await loadCityDataApi(
        {
          city_ids: [cityId],
          fetch_urls: true,
          fetch_metadata: true,
          refresh: false,
        },
        token
      );
      notifyJobCreated(result.job_id);
      alert(`Datasets and metadata reload started! Job ID: ${result.job_id}\n\nYou can monitor progress in the jobs dropdown.`);
      setTimeout(() => loadCityData(), 2000);
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
      const token = await getAccessTokenSilently();
      const result = await restructureCity(cityId, selectedModel || undefined, token);
      notifyJobCreated(result.job_id);
      alert(`Re-structuring started! Job ID: ${result.job_id}\n\nYou can monitor progress in the jobs badge at the top of the page.`);
    } catch (err: any) {
      alert("Failed to start re-structure: " + err.message);
    }
  };

  const handleReloadOfficials = async () => {
    try {
      const token = await getAccessTokenSilently();
      // Find the leaders query config
      const leadersConfig = structureData?.query_configs?.find(
        (qc: any) => qc.structure_type === "leaders"
      );
      
      if (!leadersConfig || !leadersConfig.id) {
        alert("No leaders query configuration found. Please run re-structure first.");
        return;
      }

      const result = await reloadQueryConfig(cityId, leadersConfig.id, token);
      
      // Reload structure data to get updated query_output
      const structure = await getCityStructure(cityId, token);
      setStructureData(structure);
      
      alert(`Officials reloaded! Found ${result.record_count} records.`);
    } catch (err: any) {
      alert("Failed to reload officials: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="admin-container" style={{ padding: "48px", textAlign: "center" }}>
        <div className="loader">Loading city data...</div>
      </div>
    );
  }

  if (error && !cityData) {
    return (
      <div className="admin-container" style={{ padding: "48px", textAlign: "center", color: "#dc2626" }}>
        <p>Error loading city data: {error}</p>
        <button onClick={loadCityData} style={{ marginTop: "16px", padding: "8px 16px" }}>
          Retry
        </button>
      </div>
    );
  }

  if (!cityData) {
    return null;
  }

  const lastFetch = cityData.last_fetch_at
    ? new Date(cityData.last_fetch_at).toLocaleString()
    : "Never";
  const vectorSize = cityData.vector_db_size_mb
    ? `${cityData.vector_db_size_mb.toFixed(2)} MB`
    : "N/A";
  const metricsCount = cityData.metrics?.length || 0;

  return (
    <div className="admin-container" style={{ padding: "24px" }}>
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
      {/* Header Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div style={{ flex: 1 }} />
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
      </div>

      {/* Tabs */}
      <div className="tabs-container" style={{ marginBottom: "24px" }}>
        <button
          className={`tab-btn ${activeTab === "data" ? "active" : ""}`}
          onClick={() => setActiveTab("data")}
        >
          City Data
        </button>
        <button
          className={`tab-btn ${activeTab === "structure" ? "active" : ""}`}
          onClick={() => setActiveTab("structure")}
        >
          City Structure
        </button>
        <button
          className={`tab-btn ${activeTab === "metrics" ? "active" : ""}`}
          onClick={() => setActiveTab("metrics")}
        >
          Metrics
        </button>
        <button
          className={`tab-btn ${activeTab === "datasets" ? "active" : ""}`}
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
                <div style={{ fontSize: "20px", fontWeight: 600 }}>{cityData.datasets_count || 0}</div>
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
                <div style={{ fontSize: "20px", fontWeight: 600 }}>{cityData.vector_db_points || "N/A"}</div>
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
              className="editable-table"
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
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
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
                          cityData.last_fetch_status === "success"
                            ? "#d1fae5"
                            : cityData.last_fetch_status === "error"
                            ? "#fee2e2"
                            : "#f3f4f6",
                        color:
                          cityData.last_fetch_status === "success"
                            ? "#065f46"
                            : cityData.last_fetch_status === "error"
                            ? "#991b1b"
                            : "#374151",
                      }}
                    >
                      {cityData.last_fetch_status || "N/A"}
                    </span>
                  </td>
                </tr>
                {cityData.last_fetch_error && (
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
                      {cityData.last_fetch_error}
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
              {cityData.structure_status && (
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 500,
                    background:
                      cityData.structure_status === "complete"
                        ? "#d1fae5"
                        : cityData.structure_status === "partial"
                        ? "#fef3c7"
                        : "#fee2e2",
                    color:
                      cityData.structure_status === "complete"
                        ? "#065f46"
                        : cityData.structure_status === "partial"
                        ? "#92400e"
                        : "#991b1b",
                  }}
                >
                  Status: {(cityData.structure_status || "not_started").toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
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
                  {availableModels.map((group) =>
                    group.models
                      .filter((m) => m.is_available)
                      .map((model) => (
                        <option key={model.key} value={model.key}>
                          {group.emoji} {model.name}
                        </option>
                      ))
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
                        const token = await getAccessTokenSilently();
                        if (geographicConfigs.length === 0) {
                          alert("No geographic structures query configurations found. Please run re-structure first.");
                          return;
                        }
                        const result = await reloadAllGeographicQueryConfigs(cityId, token);
                        const structure = await getCityStructure(cityId, token);
                        setStructureData(structure);
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

          {/* City Officials Box */}
          {(() => {
            const leadersConfig = structureData?.query_configs?.find(
              (qc: any) => qc.structure_type === "leaders"
            );
            const officialsData = leadersConfig?.query_output || [];
            const storedLeaders = structureData?.leaders || [];
            
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
            const storedLeadersMap = new Map<string, any>();
            storedLeaders.forEach((leader: any) => {
              const key = `${leader.name || ""}_${leader.title || ""}_${leader.district ?? "null"}`;
              storedLeadersMap.set(key, leader);
            });
            
            // Get geographic structures for dropdown
            const geographicStructures = structureData?.geographic_structures || [];
            // Get governance structures for dropdown
            const governanceStructures = structureData?.governance_structures || [];
            
            const handleSaveLeader = async (leaderData: any, isNew: boolean) => {
              try {
                setSaving(true);
                setError(null);
                const token = await getAccessTokenSilently();
                
                if (isNew) {
                  await createCityLeader(cityId, {
                    city_id: cityId,
                    name: leaderData.name,
                    title: leaderData.title,
                    district: leaderData.district || null,
                    geographic_structure_id: leaderData.geographic_structure_id || null,
                    governance_structure_id: leaderData.governance_structure_id || null,
                    metadata: leaderData.metadata || {},
                  }, token);
                } else {
                  await updateCityLeader(cityId, leaderData.id, {
                    city_id: cityId,
                    name: leaderData.name,
                    title: leaderData.title,
                    district: leaderData.district || null,
                    geographic_structure_id: leaderData.geographic_structure_id || null,
                    governance_structure_id: leaderData.governance_structure_id || null,
                    metadata: leaderData.metadata || {},
                  }, token);
                }
                
                setEditingLeader(null);
                await loadCityData();
                alert("Leader saved successfully!");
              } catch (err: any) {
                setError(err.message || "Failed to save leader");
                alert("Failed to save leader: " + err.message);
              } finally {
                setSaving(false);
              }
            };
            
            const handleDeleteLeader = async (leaderId: number) => {
              if (!confirm("Are you sure you want to delete this leader?")) {
                return;
              }
              
              try {
                setSaving(true);
                setError(null);
                const token = await getAccessTokenSilently();
                await deleteCityLeader(cityId, leaderId, token);
                await loadCityData();
                alert("Leader deleted successfully!");
              } catch (err: any) {
                setError(err.message || "Failed to delete leader");
                alert("Failed to delete leader: " + err.message);
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
                      City Officials
                    </span>
                    {officialsData.length > 0 && (
                      <span style={{ fontSize: "12px", fontWeight: "normal", color: "var(--text-secondary)" }}>
                        ({storedLeaders.length} stored / {officialsData.length} in query output)
                      </span>
                    )}
                    {leadersConfig && (() => {
                      const confidence = leadersConfig.metadata?.confidence || leadersConfig.confidence;
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
                          alert("No officials data available to store.");
                          return;
                        }
                        if (!confirm(`Store all ${officialsData.length} officials from query output?`)) {
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
                              const officialTitle = official.title || official.position || "Supervisor";
                              // Use dynamically found district field, with fallback to common field names
                              const officialDistrict = districtField 
                                ? (official[districtField] !== undefined && official[districtField] !== null ? Number(official[districtField]) : null)
                                : (official.district || official.supervisor_district || official.council_district || official.sup_dist || official.sup_dist_num || null);
                              // Convert to number if it's a string
                              const districtNum = officialDistrict !== null && officialDistrict !== undefined 
                                ? (typeof officialDistrict === 'string' ? (isNaN(Number(officialDistrict)) ? null : Number(officialDistrict)) : officialDistrict)
                                : null;
                              
                              if (!officialName) continue;
                              
                              await createCityLeader(cityId, {
                                city_id: cityId,
                                name: officialName,
                                title: officialTitle,
                                district: districtNum,
                                geographic_structure_id: matchingGeoStructure?.id || null,
                                governance_structure_id: matchingGovStructure?.id || null,
                                metadata: official,
                              }, token);
                              stored++;
                            } catch (err: any) {
                              console.error("Error storing leader:", err);
                              errors++;
                            }
                          }
                          
                          await loadCityData();
                          alert(`Stored ${stored} officials${errors > 0 ? ` (${errors} errors)` : ""}!`);
                        } catch (err: any) {
                          setError(err.message || "Failed to store all officials");
                          alert("Failed to store all officials: " + err.message);
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
                      title={leadersConfig && officialsData.length ? `Store all ${officialsData.length} officials from query output` : "No officials data available"}
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
                      }}
                      title={leadersConfig ? "Re-run query and reload officials data" : "No query configuration found"}
                    >
                      Re-load
                    </button>
                  </div>
                </div>
                
                {/* Show all officials from query output with mapping status */}
                {officialsData.length > 0 ? (
                  <div style={{ marginBottom: "16px" }}>
                    <h5 style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: 600 }}>
                      All Officials from Query Output ({officialsData.length})
                    </h5>
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
                            <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Governance Structure</th>
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
                            const officialName = nameField 
                              ? (official[nameField] || official.name || official.supervisor || official.councilmember || "")
                              : (official.name || official.supervisor || official.councilmember || official.official || "");
                            const officialTitle = official.title || official.position || "Supervisor";
                            // Use dynamically found district field, with fallback to common field names
                            const officialDistrictRaw = districtField 
                              ? (official[districtField] !== undefined && official[districtField] !== null ? official[districtField] : null)
                              : (official.district || official.supervisor_district || official.council_district || official.sup_dist || official.sup_dist_num || null);
                            // Convert to number if it's a string
                            const officialDistrict = officialDistrictRaw !== null && officialDistrictRaw !== undefined 
                              ? (typeof officialDistrictRaw === 'string' ? (isNaN(Number(officialDistrictRaw)) ? null : Number(officialDistrictRaw)) : officialDistrictRaw)
                              : null;
                            const key = `${officialName}_${officialTitle}_${officialDistrict ?? "null"}`;
                            const storedLeader = storedLeadersMap.get(key);
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
                                <td style={{ padding: "8px" }}>{officialName || "N/A"}</td>
                                <td style={{ padding: "8px" }}>{officialTitle || "N/A"}</td>
                                <td style={{ padding: "8px" }}>
                                  {officialDistrict !== null && officialDistrict !== undefined
                                    ? `District ${officialDistrict}`
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
                                  {storedLeader?.governance_structure_id ? (
                                    <span style={{ color: "var(--text-primary)" }}>
                                      {governanceStructures.find((g: any) => g.id === storedLeader.governance_structure_id)?.body_name || storedLeader.governance_structure_id}
                                    </span>
                                  ) : (
                                    <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>Not mapped</span>
                                  )}
                                </td>
                                <td style={{ padding: "8px" }}>
                                  <button
                                    onClick={() => setEditingLeader({
                                      index,
                                      data: storedLeader || {
                                        name: officialName,
                                        title: officialTitle,
                                        district: officialDistrict,
                                        geographic_structure_id: null,
                                        governance_structure_id: null,
                                      },
                                      isNew: !isStored,
                                    })}
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
                    No officials data in query output. Click Re-load to fetch from query.
                  </div>
                )}
                
                {/* Edit/Add Leader Modal */}
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
                        {editingLeader.isNew ? "Add Leader" : "Edit Leader"}
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
          <h3 style={{ marginBottom: "16px" }}>Metrics</h3>
          {cityData.metrics && cityData.metrics.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "16px",
              }}
            >
              {cityData.metrics.map((metric) => (
                <div
                  key={metric.id}
                  className="metric-card"
                  style={{
                    padding: "16px",
                    border: "1px solid var(--border-primary)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onClick={() => {
                    // TODO: Navigate to metric view
                    console.log("Navigate to metric:", metric.id);
                  }}
                >
                  <h4 style={{ margin: "0 0 4px 0", fontWeight: 500 }}>{metric.metric_name}</h4>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "4px 0" }}>
                    {metric.metric_key}
                  </p>
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "4px 0" }}>
                    {metric.category}
                    {metric.subcategory ? ` / ${metric.subcategory}` : ""}
                  </p>
                  <p style={{ fontSize: "12px", marginTop: "8px" }}>
                    Status: {metric.last_execution_status || "N/A"}
                  </p>
                </div>
              ))}
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
    </div>
  );
}

