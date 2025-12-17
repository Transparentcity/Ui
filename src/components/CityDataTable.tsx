"use client";

import React from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useMemo } from "react";
import {
  listCities,
  CityListItem,
  loadCityData,
  batchAnalyzeCities,
  getSavedCities,
  saveCity,
  unsaveCity,
  getCityStats,
} from "@/lib/apiClient";
import { emitSavedCitiesChanged } from "@/lib/uiEvents";
import { notifyJobCreated } from "@/lib/useJobWebSocket";

interface CityDataTableProps {
  onOpenCity?: (cityId: number) => void;
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

export default function CityDataTable({ onOpenCity }: CityDataTableProps) {
  const { getAccessTokenSilently } = useAuth0();
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
  const [showAddCityForm, setShowAddCityForm] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [structuringCities, setStructuringCities] = useState(false);
  const [vectorStatsLoadingCityIds, setVectorStatsLoadingCityIds] = useState<
    Set<number>
  >(() => new Set());
  const [vectorStatsErrorCityIds, setVectorStatsErrorCityIds] = useState<
    Set<number>
  >(() => new Set());

  useEffect(() => {
    loadCities();
  }, []);

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

  const filteredCities = useMemo(() => {
    let filtered = [...cities];

    if (showOnlyPortals) {
      filtered = filtered.filter((c) => hasPortal(c));
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

    return filtered;
  }, [cities, showOnlyPortals, countryFilter, citySearchQuery]);

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

    try {
      setLoadingData(true);
      const token = await getAccessTokenSilently();
      const result = await loadCityData(
        {
          city_ids: selectedCityIds,
          fetch_urls: true,
          fetch_metadata: true,
          refresh: false,
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

  const formatLastFetch = (date: string | null | undefined) => {
    if (!date) return "Never";
    try {
      return new Date(date).toLocaleDateString();
    } catch {
      return "Invalid";
    }
  };

  const formatStatus = (status: string | null | undefined) => {
    if (!status) return "N/A";
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  const getStatusClass = (status: string | null | undefined) => {
    if (!status) return "unknown";
    const s = status.toLowerCase();
    if (s === "success") return "success";
    if (s === "error" || s === "failed") return "error";
    return "unknown";
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

  const getPlatformType = (city: CityListItem) => {
    // Simple heuristic - could be enhanced
    const url = city.main_portal_url || "";
    if (url.includes("socrata")) return "Socrata";
    if (url.includes("arcgis")) return "ArcGIS";
    if (url.includes("ckan")) return "CKAN";
    return "Other";
  };

  if (loading) {
    return (
      <div className="admin-container" style={{ padding: "48px", textAlign: "center" }}>
        <div className="loader">Loading cities...</div>
      </div>
    );
  }

  return (
    <div className="admin-container" style={{ padding: "24px", height: "100%", overflowY: "auto" }}>
      {/* Stats Header */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="city-stats-header">
          {/* Worldwide Row */}
          <div className="stats-row" style={{ marginBottom: "24px" }}>
            <div className="stats-row-label" style={{ fontWeight: 600, marginBottom: "12px" }}>
              Worldwide
            </div>
            <div
              className="city-stats-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "16px",
              }}
            >
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Countries
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatNumber(stats.totalCountriesCount)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Cities
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatNumber(stats.totalCitiesCount)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Population
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatTotalPopulation(stats.totalPopulation)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Portals
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatNumber(stats.citiesWithPortalsCount)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Datasets
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatNumber(stats.totalDatasetsCount)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Pop Covered by Data
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatTotalPopulation(stats.worldwidePopCoveredByData)}
                </span>
              </div>
            </div>
          </div>
          {/* US Row */}
          <div className="stats-row">
            <div className="stats-row-label" style={{ fontWeight: 600, marginBottom: "12px" }}>US</div>
            <div
              className="city-stats-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "16px",
              }}
            >
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Countries
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatNumber(stats.usCountriesCount)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Cities
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatNumber(stats.usCitiesCount)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Population
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatTotalPopulation(stats.usPopulation)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Portals
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatNumber(stats.usCitiesWithPortalsCount)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Datasets
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatNumber(stats.usDatasetsCount)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Pop Covered by Data
                </span>
                <span className="stat-value" style={{ fontSize: "20px", fontWeight: 600 }}>
                  {formatTotalPopulation(stats.usPopCoveredByData)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="city-actions-header" style={{ marginBottom: "16px" }}>
          <h3 className="city-actions-title" style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
            City Data Actions
          </h3>
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
      <div className="card">
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
              className="city-search-input"
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
          </div>
          <div
            className="city-list-actions"
            style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}
          >
            <button
              onClick={selectAllCities}
              className="link-btn"
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
              className="link-btn"
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
              className="link-btn danger"
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
              className="link-btn"
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

        <div className="city-table-container" style={{ overflowX: "auto" }}>
          <table className="city-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th className="checkbox-col" style={{ padding: "12px", textAlign: "left", width: "40px" }}>
                  <input
                    type="checkbox"
                    checked={allCitiesSelected}
                    onChange={toggleAllCities}
                  />
                </th>
                <th className="name-col" style={{ padding: "12px", textAlign: "left" }}>
                  City Name
                </th>
                <th className="state-col" style={{ padding: "12px", textAlign: "left" }}>
                  State
                </th>
                <th className="country-col" style={{ padding: "12px", textAlign: "left" }}>
                  Country
                </th>
                <th className="population-col" style={{ padding: "12px", textAlign: "left" }}>
                  Population
                </th>
                <th className="platform-col" style={{ padding: "12px", textAlign: "left" }}>
                  Platform
                </th>
                <th className="datasets-col" style={{ padding: "12px", textAlign: "left" }}>
                  Datasets
                </th>
                <th className="vector-db-col" style={{ padding: "12px", textAlign: "left" }}>
                  Vector DB
                </th>
                <th className="last-fetch-col" style={{ padding: "12px", textAlign: "left" }}>
                  Last Fetch
                </th>
                <th className="status-col" style={{ padding: "12px", textAlign: "left" }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {citiesByState.map((stateGroup) => (
                <React.Fragment key={`state-${stateGroup.state}`}>
                  <tr className="state-header-row">
                    <td
                      colSpan={10}
                      className="state-header-cell"
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

                    return (
                      <tr
                        key={city.city_id}
                        className="city-row"
                        style={{
                          borderBottom: "1px solid var(--border-primary)",
                        }}
                      >
                        <td className="checkbox-col" style={{ padding: "12px" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleCitySelection(city.city_id, e.target.checked)}
                          />
                        </td>
                        <td className="name-col" style={{ padding: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <button
                              type="button"
                              onClick={() => handleToggleSavedCity(city.city_id)}
                              disabled={isSaving}
                              title={
                                isSaved
                                  ? "Remove from My Cities"
                                  : "Save to My Cities"
                              }
                              aria-label={
                                isSaved
                                  ? "Remove from My Cities"
                                  : "Save to My Cities"
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
                            <button
                              type="button"
                              className="city-name"
                              onClick={() => onOpenCity && onOpenCity(city.city_id)}
                              style={{
                                cursor: onOpenCity ? "pointer" : "default",
                                background: "transparent",
                                border: "none",
                                padding: 0,
                                margin: 0,
                                textAlign: "left",
                                color: "var(--text-primary)",
                                fontSize: "13px",
                                fontWeight: 600,
                              }}
                              title="Open city view"
                            >
                              {city.city_name || "—"}
                            </button>
                          </div>
                        </td>
                        <td className="state-col" style={{ padding: "12px" }}>
                          {getStateAbbreviation(city.state)}
                        </td>
                        <td className="country-col" style={{ padding: "12px" }}>
                          {city.country || "—"}
                        </td>
                        <td className="population-col" style={{ padding: "12px" }}>
                          {formatPopulation(city.population)}
                        </td>
                        <td className="platform-col" style={{ padding: "12px" }}>
                          <span
                            className="platform-badge"
                            style={{
                              padding: "4px 8px",
                              background: "var(--bg-secondary)",
                              borderRadius: "4px",
                              fontSize: "11px",
                            }}
                          >
                            {getPlatformType(city)}
                          </span>
                        </td>
                        <td className="datasets-col" style={{ padding: "12px" }}>
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
                        <td className="vector-db-col" style={{ padding: "12px" }}>
                          {vectorStatsLoadingCityIds.has(city.city_id) ? (
                            <button
                              type="button"
                              className="vector-db-btn"
                              disabled
                              title="Loading Vector DB stats..."
                            >
                              <span className="loading-spinner" aria-hidden="true" />
                            </button>
                          ) : city.vector_db_points !== null &&
                            city.vector_db_points !== undefined ? (
                            <button
                              type="button"
                              className="vector-db-btn stats-loaded"
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
                              className="vector-db-btn"
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
                        <td className="last-fetch-col" style={{ padding: "12px", fontSize: "12px" }}>
                          {formatLastFetch(city.last_fetch_at)}
                        </td>
                        <td className="status-col" style={{ padding: "12px" }}>
                          <span
                            className={`status-badge ${getStatusClass(city.last_fetch_status)}`}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              background:
                                getStatusClass(city.last_fetch_status) === "success"
                                  ? "#d1fae5"
                                  : getStatusClass(city.last_fetch_status) === "error"
                                  ? "#fee2e2"
                                  : "#f3f4f6",
                              color:
                                getStatusClass(city.last_fetch_status) === "success"
                                  ? "#065f46"
                                  : getStatusClass(city.last_fetch_status) === "error"
                                  ? "#991b1b"
                                  : "#374151",
                            }}
                          >
                            {formatStatus(city.last_fetch_status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {filteredCities.length === 0 && (
            <div className="empty-state" style={{ padding: "48px", textAlign: "center", color: "var(--text-secondary)" }}>
              No cities found matching filters.
            </div>
          )}
        </div>
      </div>
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

