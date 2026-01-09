"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import CityDataAdmin from "@/components/CityDataAdmin";
import CityMapView from "@/components/CityMapView";
import CityHeader from "@/components/CityHeader";
import MetricDateRangeSelector from "@/components/MetricDateRangeSelector";
import DistrictNavigation from "@/components/DistrictNavigation";
import AnomaliesTabPanel from "@/components/AnomaliesTabPanel";
import { useCity, useSavedCities, useSaveCity, useUnsaveCity } from "@/lib/hooks/useCities";
import { emitSavedCitiesChanged, SAVED_CITIES_CHANGED_EVENT } from "@/lib/uiEvents";
import { getPresetMetricDateRange, getDefaultDateRangeFromMetrics, type MetricDateRange } from "@/lib/dateRange";
import type { AnomalyResult } from "@/lib/hooks/useAnomalies";
import { useAuth0 } from "@auth0/auth0-react";
import { getAdminMetricTimeSeries, getAdminMetricTimeSeriesDetail } from "@/lib/apiClient";
import Loader from "@/components/Loader";
import "./CityView.css";

interface CityViewProps {
  cityId: number;
  isAdmin: boolean;
  gpsLocation?: { lat: number; lng: number } | null; // GPS coordinates to zoom to
  initialDistrict?: number | null; // Initial district to select when loading
}

type TabType = "map" | "dashboard" | "anomalies" | "admin";

interface MetricWithYTD {
  id: number;
  metric_name: string;
  category?: string | null;
  most_recent_data_date?: string | null;
  freshness?: any;
  ytdLastYear?: number | null;
  ytdThisYear?: number | null;
  ytdLoading?: boolean;
}

interface DashboardMetricsSectionProps {
  metrics: any[];
  cityId: number;
}

function DashboardMetricsSection({ metrics, cityId }: DashboardMetricsSectionProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [ytdData, setYtdData] = useState<Record<number, { lastYear: number | null; thisYear: number | null; loading: boolean }>>({});
  const [loadingMetrics, setLoadingMetrics] = useState<Set<number>>(new Set());

  // Group and sort metrics by category
  const groupedMetrics = useMemo(() => {
    const grouped: Record<string, MetricWithYTD[]> = {};
    
    metrics.forEach((metric) => {
      const category = metric.category || "Uncategorized";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push({
        id: metric.id,
        metric_name: metric.metric_name,
        category: metric.category,
        most_recent_data_date: metric.most_recent_data_date,
        freshness: (metric as any).freshness,
        ytdLastYear: ytdData[metric.id]?.lastYear ?? null,
        ytdThisYear: ytdData[metric.id]?.thisYear ?? null,
        ytdLoading: ytdData[metric.id]?.loading ?? false,
      });
    });

    // Sort categories alphabetically
    const sortedCategories = Object.keys(grouped).sort();
    
    // Sort metrics within each category by name
    sortedCategories.forEach((category) => {
      grouped[category].sort((a, b) => a.metric_name.localeCompare(b.metric_name));
    });

    return { grouped, sortedCategories };
  }, [metrics, ytdData]);

  // Calculate YTD for a metric
  const calculateYTD = useCallback(async (metricId: number) => {
    const token = await getAccessTokenSilently();
    
    setLoadingMetrics((prev) => {
      if (prev.has(metricId)) return prev;
      return new Set(prev).add(metricId);
    });
    
    setYtdData((prev) => ({
      ...prev,
      [metricId]: { ...prev[metricId], loading: true },
    }));

    try {
      // Get time series for the metric
      const timeSeries = await getAdminMetricTimeSeries(metricId, token);
      
      // Find the first active time series (prefer citywide/district 0)
      const activeSeries = timeSeries.time_series.find(
        (ts) => ts.is_active && ts.district === 0
      ) || timeSeries.time_series.find((ts) => ts.is_active);

      if (!activeSeries) {
        setYtdData((prev) => ({
          ...prev,
          [metricId]: { lastYear: null, thisYear: null, loading: false },
        }));
        setLoadingMetrics((prev) => {
          const next = new Set(prev);
          next.delete(metricId);
          return next;
        });
        return;
      }

      // Get time series detail
      const detail = await getAdminMetricTimeSeriesDetail(metricId, activeSeries.chart_id, token);
      
      const now = new Date();
      const currentYear = now.getFullYear();
      const lastYear = currentYear - 1;
      const currentDate = now;

      // Calculate YTD for this year (Jan 1 to today)
      const thisYearStart = new Date(currentYear, 0, 1);
      const thisYearYTD = detail.data
        .filter((point) => {
          const pointDate = new Date(point.time_period);
          return pointDate >= thisYearStart && pointDate <= currentDate;
        })
        .reduce((sum, point) => sum + point.numeric_value, 0);

      // Calculate YTD for last year (Jan 1 to Dec 31 of last year, but only up to same day)
      const lastYearStart = new Date(lastYear, 0, 1);
      const lastYearEnd = new Date(lastYear, currentDate.getMonth(), currentDate.getDate());
      const lastYearYTD = detail.data
        .filter((point) => {
          const pointDate = new Date(point.time_period);
          return pointDate >= lastYearStart && pointDate <= lastYearEnd;
        })
        .reduce((sum, point) => sum + point.numeric_value, 0);

      setYtdData((prev) => ({
        ...prev,
        [metricId]: {
          lastYear: lastYearYTD || null,
          thisYear: thisYearYTD || null,
          loading: false,
        },
      }));
    } catch (error) {
      console.error(`Error calculating YTD for metric ${metricId}:`, error);
      setYtdData((prev) => ({
        ...prev,
        [metricId]: { lastYear: null, thisYear: null, loading: false },
      }));
    } finally {
      setLoadingMetrics((prev) => {
        const next = new Set(prev);
        next.delete(metricId);
        return next;
      });
    }
  }, [getAccessTokenSilently]);

  // Fetch YTD data for all metrics
  useEffect(() => {
    const metricIds = metrics
      .map((m) => m.id)
      .filter((id): id is number => !!id && !ytdData[id] && !loadingMetrics.has(id));
    
    metricIds.forEach((metricId) => {
      calculateYTD(metricId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics.map((m) => m.id).join(",")]); // Only refetch when metric IDs change

  if (!metrics || metrics.length === 0) {
    return (
      <div className="dashboard-section">
        <h2>Metrics</h2>
        <div className="ytd-placeholder">
          <p>No metrics defined for this city.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-section">
      <h2>Metrics</h2>
      <div className="metrics-table-container">
        <table className="metrics-table">
          <thead>
            <tr>
              <th>Metric Name</th>
              <th className="ytd-column">YTD {new Date().getFullYear() - 1}</th>
              <th className="ytd-column">YTD {new Date().getFullYear()}</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {groupedMetrics.sortedCategories.map((category) => (
              <React.Fragment key={category}>
                <tr className="category-header-row">
                  <td colSpan={4} className="category-header">
                    {category}
                  </td>
                </tr>
                {groupedMetrics.grouped[category].map((metric) => {
                  const freshness = metric.freshness;
                  const isStale = freshness?.is_stale || (freshness?.lag_days && freshness.lag_days > 7);
                  
                  return (
                    <tr key={metric.id} className="metric-row">
                      <td className="metric-name-cell">
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span className="metric-name">{metric.metric_name}</span>
                          {metric.most_recent_data_date && (
                            <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                              Last updated: {new Date(metric.most_recent_data_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="ytd-cell">
                        {metric.ytdLoading ? (
                          <Loader size="sm" color="dark" />
                        ) : metric.ytdLastYear !== null && metric.ytdLastYear !== undefined ? (
                          metric.ytdLastYear.toLocaleString()
                        ) : (
                          <span style={{ color: "var(--text-secondary)" }}>—</span>
                        )}
                      </td>
                      <td className="ytd-cell">
                        {metric.ytdLoading ? (
                          <Loader size="sm" color="dark" />
                        ) : metric.ytdThisYear !== null && metric.ytdThisYear !== undefined ? (
                          metric.ytdThisYear.toLocaleString()
                        ) : (
                          <span style={{ color: "var(--text-secondary)" }}>—</span>
                        )}
                      </td>
                      <td className="status-cell">
                        {freshness && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
                            <span style={{ color: "var(--text-secondary)" }}>
                              Updated {freshness.update_frequency || "unknown"}
                            </span>
                            {freshness.lag_days !== undefined && freshness.lag_days > 0 && (
                              <span style={{ color: "var(--text-secondary)" }}>
                                • {freshness.lag_days} days behind
                              </span>
                            )}
                            {isStale && (
                              <span style={{ color: "var(--error-text, #c62828)", fontWeight: 500 }}>
                                ⚠️ Stale
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CityView({ cityId, isAdmin, gpsLocation, initialDistrict }: CityViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("map"); // Default to map tab
  const [saving, setSaving] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [metricDateRange, setMetricDateRange] = useState<MetricDateRange>(
    getPresetMetricDateRange("all")
  );
  // Use initialDistrict if provided, otherwise default to 0 (mayor/citywide)
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(initialDistrict ?? 0);
  const [districtGPSLocation, setDistrictGPSLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapLeaders, setMapLeaders] = useState<any[]>([]);
  const [mapShapefiles, setMapShapefiles] = useState<any[]>([]);
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyResult | null>(null);
  const mapTabRef = useRef<HTMLDivElement | null>(null);

  // Anomaly selection handler - accepts null to clear selection
  const handleAnomalySelect = useCallback((anomaly: AnomalyResult | null) => {
    setSelectedAnomaly(anomaly);
    // If selecting an anomaly and not on map tab, switch to it
    if (anomaly && activeTab !== "map") {
      setActiveTab("map");
    }
  }, [activeTab]);

  // Use React Query hooks for data fetching - these handle caching automatically
  const { data: cityData, isLoading: loadingCity, error: cityError } = useCity(cityId);
  const { data: savedCities = [], isLoading: loadingSaved } = useSavedCities();
  
  // Mutations for save/unsave
  const saveCityMutation = useSaveCity();
  const unsaveCityMutation = useUnsaveCity();

  // Determine if current city is saved
  const isCitySaved = useMemo(() => {
    return savedCities.some((city) => city.id === cityId);
  }, [savedCities, cityId]);

  // Set default date range when city data loads
  useEffect(() => {
    if (cityData?.metrics && cityData.metrics.length > 0) {
      const defaultDateRange = getDefaultDateRangeFromMetrics(cityData.metrics);
      setMetricDateRange(defaultDateRange);
    } else {
      // Reset to "all" when switching cities or if no metrics
      setMetricDateRange(getPresetMetricDateRange("all"));
    }
  }, [cityData?.metrics, cityId]);

  // Update selected district when cityId or initialDistrict changes
  useEffect(() => {
    if (initialDistrict !== undefined) {
      setSelectedDistrict(initialDistrict ?? 0);
    }
  }, [cityId, initialDistrict]);

  // Listen for saved cities changes (from other components)
  useEffect(() => {
    const handleSavedCitiesChanged = () => {
      // React Query will automatically refetch saved cities when cache is invalidated
      // No manual refetch needed
    };

    window.addEventListener(SAVED_CITIES_CHANGED_EVENT, handleSavedCitiesChanged);
    return () => {
      window.removeEventListener(SAVED_CITIES_CHANGED_EVENT, handleSavedCitiesChanged);
    };
  }, []);

  // Handle scroll to hide/show header on mobile in map view
  useEffect(() => {
    if (activeTab !== "map" || !mapTabRef.current) return;

    const handleScroll = () => {
      // Only apply scroll behavior on narrow screens (mobile)
      if (window.innerWidth > 768) {
        setHeaderVisible(true);
        return;
      }

      const currentScrollY = window.scrollY;
      const scrollThreshold = 10; // Small threshold to prevent jitter

      if (currentScrollY > lastScrollY && currentScrollY > scrollThreshold) {
        // Scrolling down - hide header
        setHeaderVisible(false);
      } else if (currentScrollY < lastScrollY) {
        // Scrolling up - show header
        setHeaderVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [activeTab, lastScrollY]);

  const handleToggleSave = async () => {
    try {
      setSaving(true);
      
      if (isCitySaved) {
        await unsaveCityMutation.mutateAsync(cityId);
      } else {
        await saveCityMutation.mutateAsync(cityId);
      }
      
      // Emit event for other components (React Query cache invalidation handles the rest)
      emitSavedCitiesChanged();
    } catch (err: any) {
      console.error("Error toggling save city:", err);
      alert("Failed to update saved status. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const loading = loadingCity || loadingSaved;
  const error = cityError ? (cityError as Error).message : null;

  if (loading) {
    return (
      <div className="city-view-loading" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", padding: "40px" }}>
        <Loader size="sm" color="dark" />
        <span>Loading city data...</span>
      </div>
    );
  }

  if (error && !cityData) {
    return (
      <div className="city-view-error">
        <p>Error loading city data: {error}</p>
        <button onClick={() => window.location.reload()} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  if (!cityData) {
    return null;
  }

  return (
    <div className={`city-view ${activeTab === "map" ? "map-view-active" : "tab-view-active"}`}>
      {/* Map Tab - Full Screen with Overlays */}
      {activeTab === "map" && (
        <div 
          ref={mapTabRef}
          className={`tab-content active map-tab-fullscreen ${headerVisible ? "header-visible" : "header-hidden"}`}
          id="map-tab"
        >
          <CityMapView
            cityId={cityId}
            isAdmin={isAdmin}
            cityData={cityData}
            metricDateRange={metricDateRange}
            gpsLocation={districtGPSLocation || gpsLocation}
            selectedDistrict={selectedDistrict}
            onDistrictChange={setSelectedDistrict}
            onDataReady={(data) => {
              setMapLeaders(data.leaders);
              setMapShapefiles(data.shapefiles);
            }}
          />
          
          {/* Header Overlay */}
          <CityHeader
            emoji={cityData.emoji || undefined}
            name={cityData.name}
            isCitySaved={isCitySaved}
            saving={saving}
            onToggleSave={handleToggleSave}
            metricDateRange={metricDateRange}
            onMetricDateRangeChange={setMetricDateRange}
            variant="overlay"
            visible={headerVisible}
            showDateRange={false}
            cityId={cityId}
            selectedDistrict={selectedDistrict}
            selectedAnomaly={selectedAnomaly}
            onAnomalySelect={handleAnomalySelect}
          />

          {/* Tabs Overlay */}
          <div className={`tabs-container-overlay ${headerVisible ? "visible" : "hidden"}`}>
            <button
              className="tab-btn active"
              onClick={() => setActiveTab("map")}
            >
              Map
            </button>
            <button
              className="tab-btn"
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              className="tab-btn"
              onClick={() => setActiveTab("anomalies")}
            >
              Alerts
            </button>
            {isAdmin && (
              <button
                className="tab-btn"
                onClick={() => setActiveTab("admin")}
              >
                Admin
              </button>
            )}
          </div>

          {/* District Navigation - Above Date Range */}
          <div className={`map-district-navigation-overlay ${headerVisible ? "visible" : "hidden"}`}>
            <DistrictNavigation
              selectedDistrict={selectedDistrict}
              leaders={mapLeaders.length > 0 ? mapLeaders : []}
              shapefiles={mapShapefiles}
              onDistrictSelect={(district) => {
                setSelectedDistrict(district);
                setDistrictGPSLocation(null); // Clear GPS when manually selecting district
              }}
              onGPSLocation={(location) => {
                setDistrictGPSLocation(location);
              }}
            />
          </div>

          {/* Date Range Selector - Top Left, below district navigation */}
          <div className={`map-date-range-overlay ${headerVisible ? "visible" : "hidden"}`}>
            <MetricDateRangeSelector
              value={metricDateRange}
              onChange={setMetricDateRange}
            />
          </div>
        </div>
      )}

      {/* Non-Map Tabs - Full Width Layout with Attached Header */}
      {activeTab !== "map" && (
        <div className={`tab-content-wrapper ${activeTab === "dashboard" ? "dashboard-tab" : activeTab === "anomalies" ? "anomalies-tab" : "admin-tab"}`}>
          {/* Header - Attached to top */}
          <CityHeader
            emoji={cityData.emoji || undefined}
            name={cityData.name}
            isCitySaved={isCitySaved}
            saving={saving}
            onToggleSave={handleToggleSave}
            metricDateRange={metricDateRange}
            onMetricDateRangeChange={setMetricDateRange}
            variant="overlay"
            visible={true}
            showDateRange={activeTab === "dashboard"}
            cityId={cityId}
            selectedDistrict={selectedDistrict}
            selectedAnomaly={selectedAnomaly}
            onAnomalySelect={handleAnomalySelect}
          />

          {/* Tabs - Below header */}
          <div className="tabs-container-overlay">
            <button
              className="tab-btn"
              onClick={() => setActiveTab("map")}
            >
              Map
            </button>
            <button
              className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={`tab-btn ${activeTab === "anomalies" ? "active" : ""}`}
              onClick={() => setActiveTab("anomalies")}
            >
              Alerts
            </button>
            {isAdmin && (
              <button
                className={`tab-btn ${activeTab === "admin" ? "active" : ""}`}
                onClick={() => setActiveTab("admin")}
              >
                Admin
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className={`tab-content active ${activeTab}-content`}>
            {activeTab === "dashboard" && (
              <DashboardMetricsSection 
                metrics={cityData.metrics || []} 
                cityId={cityId}
              />
            )}

            {activeTab === "anomalies" && (
              <div className="anomalies-section">
                <AnomaliesTabPanel
                  cityId={cityId}
                  initialDistrict={selectedDistrict}
                />
              </div>
            )}

            {activeTab === "admin" && isAdmin && (
              <div className="admin-section">
                <CityDataAdmin cityId={cityId} embedded />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
