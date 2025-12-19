"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useCallback, useRef } from "react";
import CityDataAdmin from "@/components/CityDataAdmin";
import CityMapView from "@/components/CityMapView";
import { CityDetail, getCity, getSavedCities, saveCity, unsaveCity } from "@/lib/apiClient";
import { emitSavedCitiesChanged, SAVED_CITIES_CHANGED_EVENT } from "@/lib/uiEvents";
import Loader from "@/components/Loader";
import "./CityView.css";

interface CityViewProps {
  cityId: number;
  isAdmin: boolean;
}

type TabType = "map" | "dashboard" | "admin";

export default function CityView({ cityId, isAdmin }: CityViewProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cityData, setCityData] = useState<CityDetail | null>(null);
  const [isCitySaved, setIsCitySaved] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("map"); // Default to map tab
  const [saving, setSaving] = useState(false);
  const loadingRef = useRef<{ cityId: number | null; inProgress: boolean }>({ cityId: null, inProgress: false });

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
    <div className={`city-view ${activeTab === "map" ? "map-view-active" : ""}`}>
      {/* Map Tab - Full Screen with Overlays */}
      {activeTab === "map" && (
        <div className="tab-content active map-tab-fullscreen" id="map-tab">
          <CityMapView cityId={cityId} isAdmin={isAdmin} cityData={cityData} />
          
          {/* Header Overlay */}
          <div className="city-header-overlay">
            <div className="city-header-left">
              {cityData.emoji && (
                <span className="city-emoji-icon">{cityData.emoji}</span>
              )}
              <h1 className="city-name">{cityData.name}</h1>
            </div>
            <div className="city-header-right">
              <button
                id="save-city-btn"
                className={`save-city-btn ${isCitySaved ? "saved" : ""}`}
                onClick={handleToggleSave}
                disabled={saving}
                title={isCitySaved ? "Remove from My Cities" : "Save to My Cities"}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill={isCitySaved ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
            </div>
          </div>

          {/* Tabs Overlay */}
          <div className="tabs-container-overlay">
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

      {/* Non-Map Tabs - Standard Layout */}
      {activeTab !== "map" && (
        <>
          {/* Header */}
          <div className="city-header">
            <div className="city-header-left">
              {cityData.emoji && (
                <span className="city-emoji-icon">{cityData.emoji}</span>
              )}
              <h1 className="city-name">{cityData.name}</h1>
            </div>
            <div className="city-header-right">
              <button
                id="save-city-btn"
                className={`save-city-btn ${isCitySaved ? "saved" : ""}`}
                onClick={handleToggleSave}
                disabled={saving}
                title={isCitySaved ? "Remove from My Cities" : "Save to My Cities"}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill={isCitySaved ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs-container">
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
        </>
      )}

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && (
        <div className="tab-content active" id="dashboard-tab">
          <div className="dashboard-section">
            <h2>Year-to-Date Changes</h2>
            <div className="ytd-placeholder">
              <p>YTD metrics dashboard coming soon...</p>
              <p className="text-secondary">
                This will show year-to-date changes in key metrics for this city.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Admin Tab */}
      {activeTab === "admin" && isAdmin && (
        <div className="tab-content active" id="admin-tab">
          <div className="admin-section">
            <CityDataAdmin cityId={cityId} />
          </div>
        </div>
      )}
    </div>
  );
}
