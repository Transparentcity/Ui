"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useCallback, useRef } from "react";
import CityDataAdmin from "@/components/CityDataAdmin";
import CityMapView from "@/components/CityMapView";
import CityHeader from "@/components/CityHeader";
import { CityDetail, getCity, getSavedCities, saveCity, unsaveCity } from "@/lib/apiClient";
import { emitSavedCitiesChanged, SAVED_CITIES_CHANGED_EVENT } from "@/lib/uiEvents";
import { getPresetMetricDateRange, getDefaultDateRangeFromMetrics, type MetricDateRange } from "@/lib/dateRange";
import Loader from "@/components/Loader";
import "./CityView.css";

interface CityViewProps {
  cityId: number;
  isAdmin: boolean;
  gpsLocation?: { lat: number; lng: number } | null; // GPS coordinates to zoom to
}

type TabType = "map" | "dashboard" | "admin";

export default function CityView({ cityId, isAdmin, gpsLocation }: CityViewProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cityData, setCityData] = useState<CityDetail | null>(null);
  const [isCitySaved, setIsCitySaved] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("map"); // Default to map tab
  const [saving, setSaving] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [metricDateRange, setMetricDateRange] = useState<MetricDateRange>(
    getPresetMetricDateRange("all")
  );
  const loadingRef = useRef<{ cityId: number | null; inProgress: boolean }>({ cityId: null, inProgress: false });
  const mapTabRef = useRef<HTMLDivElement | null>(null);

  const loadCityData = useCallback(async () => {
    // Prevent duplicate calls for the same cityId
    if (loadingRef.current.cityId === cityId && loadingRef.current.inProgress) {
      return;
    }
    
    loadingRef.current = { cityId, inProgress: true };
    
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();
      
      // Load city data and saved status in parallel for better performance
      const [city, savedCities] = await Promise.all([
        getCity(cityId, token),
        getSavedCities(token).catch(() => []), // Don't fail if saved cities check fails
      ]);
      
      setCityData(city);
      setIsCitySaved(savedCities.some((city) => city.id === cityId));
      
      // Set default date range based on most recent metric data date
      // Log metrics for debugging
      if (city.metrics && city.metrics.length > 0) {
        console.log("City metrics:", city.metrics.map(m => ({
          name: m.metric_name,
          most_recent_data_date: m.most_recent_data_date,
          last_execution_at: m.last_execution_at
        })));
      }
      const defaultDateRange = getDefaultDateRangeFromMetrics(city.metrics);
      console.log("Calculated default date range:", defaultDateRange);
      setMetricDateRange(defaultDateRange);
    } catch (err: any) {
      setError(err.message || "Failed to load city data");
      console.error("Error loading city data:", err);
    } finally {
      setLoading(false);
      loadingRef.current.inProgress = false;
    }
  }, [cityId, getAccessTokenSilently]);

  const checkCitySavedStatus = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const savedCities = await getSavedCities(token);
      setIsCitySaved(savedCities.some((city) => city.id === cityId));
    } catch (err) {
      console.error("Error checking saved status:", err);
    }
  }, [cityId, getAccessTokenSilently]);

  useEffect(() => {
    // Reset loading ref when cityId changes
    if (loadingRef.current.cityId !== cityId) {
      loadingRef.current = { cityId, inProgress: false };
      // Reset date range to "all" when switching cities
      // It will be updated once the new city data loads
      setMetricDateRange(getPresetMetricDateRange("all"));
    }
    
    // loadCityData now handles both city data and saved status in parallel
    loadCityData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]); // Only depend on cityId - callbacks are memoized and stable

  // Listen for saved cities changes to update status without refetching
  useEffect(() => {
    const handleSavedCitiesChanged = () => {
      // Only refetch if we need to update the saved status
      checkCitySavedStatus();
    };

    window.addEventListener(SAVED_CITIES_CHANGED_EVENT, handleSavedCitiesChanged);
    return () => {
      window.removeEventListener(SAVED_CITIES_CHANGED_EVENT, handleSavedCitiesChanged);
    };
  }, [checkCitySavedStatus]);

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
      const token = await getAccessTokenSilently();
      
      if (isCitySaved) {
        await unsaveCity(cityId, token);
      } else {
        await saveCity(cityId, token);
      }
      
      setIsCitySaved(!isCitySaved);
      emitSavedCitiesChanged();
    } catch (err: any) {
      console.error("Error toggling save city:", err);
      alert("Failed to update saved status. Please try again.");
    } finally {
      setSaving(false);
    }
  };

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
        <button onClick={loadCityData} className="retry-button">
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
            gpsLocation={gpsLocation}
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
            {isAdmin && (
              <button
                className="tab-btn"
                onClick={() => setActiveTab("admin")}
              >
                Admin
              </button>
            )}
          </div>
        </div>
      )}

      {/* Non-Map Tabs - Full Width Layout with Attached Header */}
      {activeTab !== "map" && (
        <div className={`tab-content-wrapper ${activeTab === "dashboard" ? "dashboard-tab" : "admin-tab"}`}>
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
              <div className="dashboard-section">
                <h2>Metrics</h2>
                {cityData.metrics && cityData.metrics.length > 0 ? (
                  <div className="metrics-list">
                    {cityData.metrics.map((metric) => (
                      <div key={metric.id} className="metric-item">
                        <span className="metric-name">{metric.metric_name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ytd-placeholder">
                    <p>No metrics defined for this city.</p>
                  </div>
                )}
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
