"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  searchPublicCities,
  type PublicCitySearchResult,
} from "@/lib/publicApiClient";
import {
  isLikelyZipcode,
  isLikelyAddress,
  isGeographicQuery,
  geocodeQuery,
  reverseGeocode,
  getCurrentLocation,
  resolveCityFromGeocode,
  type GeocodeResult,
} from "@/lib/locationSearchUtils";

import styles from "./SidebarCitySearch.module.css";

export default function SidebarCitySearch({
  onCitySelect,
  onGPSLocation,
  placeholder = "Search cities…",
}: {
  onCitySelect: (cityId: number) => void;
  onGPSLocation?: (location: { lat: number; lng: number } | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicCitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [storedGPSLocation, setStoredGPSLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsActive, setGpsActive] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastRequestIdRef = useRef(0);
  const searchTimeoutRef = useRef<number | null>(null);
  const geoLoadingTimeoutRef = useRef<number | null>(null);

  const trimmed = useMemo(() => query.trim(), [query]);
  const queryIsGeo = useMemo(
    () => isGeographicQuery(trimmed),
    [trimmed],
  );

  // For portal rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
      if (geoLoadingTimeoutRef.current) window.clearTimeout(geoLoadingTimeoutRef.current);
    };
  }, []);

  // Close on escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const closeModal = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setError(null);
    setSelectedIndex(-1);
    // Reset GPS loading state when modal closes to prevent stuck states
    if (geoLoading) {
      setGeoLoading(false);
    }
    setGpsActive(false);
    
    // Clear any GPS timeout
    if (geoLoadingTimeoutRef.current) {
      window.clearTimeout(geoLoadingTimeoutRef.current);
      geoLoadingTimeoutRef.current = null;
    }
  };

  const scheduleCitySearch = (q: string) => {
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = window.setTimeout(() => {
      void runCitySearch(q);
    }, 250);
  };

  const runCitySearch = async (q: string) => {
    const s = q.trim();
    if (s.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      setSelectedIndex(-1);
      return;
    }

    // Don't run city search for zipcodes/addresses - they need geocoding
    if (isGeographicQuery(s)) {
      setResults([]);
      setLoading(false);
      setError(null);
      setSelectedIndex(-1);
      return;
    }

    const requestId = ++lastRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const r = await searchPublicCities(s, 10);
      if (lastRequestIdRef.current !== requestId) return;
      setResults(Array.isArray(r) ? r : []);
      setSelectedIndex(-1);
      setLoading(false);
    } catch (e) {
      if (lastRequestIdRef.current !== requestId) return;
      setResults([]);
      setSelectedIndex(-1);
      setLoading(false);
      setError(e instanceof Error ? e.message : "City search failed");
    }
  };

  const selectCity = (city: PublicCitySearchResult, fromGPS: boolean = false) => {
    closeModal();
    // If selecting from GPS, we'll preserve GPS location in the dashboard
    // If selecting manually, GPS location should be cleared (handled by dashboard)
    onCitySelect(city.id);
  };

  const handleGeocodeQuery = async () => {
    const s = trimmed;
    if (!s) return;
    setGeoLoading(true);
    setError(null);
    try {
      const geo = await geocodeQuery(s);
      const { city, coordinates } = await resolveCityFromGeocode(geo, searchPublicCities);
      
      // Store GPS location if we have coordinates
      if (coordinates) {
        setStoredGPSLocation(coordinates);
        if (onGPSLocation) {
          onGPSLocation(coordinates);
        }
      }
      
      selectCity(city, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geocoding failed");
    } finally {
      setGeoLoading(false);
    }
  };

  const handleUseCurrentLocation = async (e?: React.MouseEvent, openModal: boolean = false) => {
    if (e) {
      e.stopPropagation();
    }
    
    // Set active state for visual feedback
    setGpsActive(true);
    
    // If we already have a stored GPS location, toggle it off (clear it)
    if (storedGPSLocation) {
      setStoredGPSLocation(null);
      // Clear GPS location in parent (pass null to remove marker and zoom out)
      if (onGPSLocation) {
        onGPSLocation(null);
      }
      // Reset all states immediately
      setGeoLoading(false);
      setGpsActive(false);
      setError(null);
      return;
    }
    
    setGeoLoading(true);
    setError(null);
    
    // Clear any existing timeout
    if (geoLoadingTimeoutRef.current) {
      window.clearTimeout(geoLoadingTimeoutRef.current);
    }
    
    // Safety timeout: reset loading state after 15 seconds if it gets stuck
    geoLoadingTimeoutRef.current = window.setTimeout(() => {
      console.warn("GPS loading timeout - resetting state");
      setGeoLoading(false);
      setGpsActive(false);
      setError("Location request timed out. Please try again.");
    }, 15000);
    
    // Only open modal if explicitly requested (from within modal)
    if (openModal) {
      setOpen(true);
    }
    
    try {
      // Get current location using shared utility
      const location = await getCurrentLocation();
      
      // Clear timeout since we got a response
      if (geoLoadingTimeoutRef.current) {
        window.clearTimeout(geoLoadingTimeoutRef.current);
        geoLoadingTimeoutRef.current = null;
      }
      
      // Store the GPS location for future re-centering
      setStoredGPSLocation(location);
      
      // Notify parent about GPS location for map zooming
      if (onGPSLocation) {
        onGPSLocation(location);
      }
      
      // Reverse geocode to get city
      const geo = await reverseGeocode(location.lat, location.lng);
      const { city } = await resolveCityFromGeocode(geo, searchPublicCities);
      
      selectCity(city, true);
      
      // Reset states after city is resolved
      setGeoLoading(false);
      setGpsActive(false);
      
      // Clear timeout
      if (geoLoadingTimeoutRef.current) {
        window.clearTimeout(geoLoadingTimeoutRef.current);
        geoLoadingTimeoutRef.current = null;
      }
    } catch (e) {
      console.error("GPS location error:", e);
      const errorMessage = e instanceof Error ? e.message : "Failed to use current location.";
      
      // Handle specific geolocation errors
      if (errorMessage.includes("denied")) {
        setError("Location access denied. Please enter your city manually.");
      } else if (errorMessage.includes("timeout")) {
        setError("Location request timed out. Please try again.");
      } else {
        setError(errorMessage);
      }
      
      setGeoLoading(false);
      setGpsActive(false);
      
      // Clear timeout
      if (geoLoadingTimeoutRef.current) {
        window.clearTimeout(geoLoadingTimeoutRef.current);
        geoLoadingTimeoutRef.current = null;
      }
      
      // Only show error in modal if modal is open
      if (openModal && !open) {
        setOpen(true);
      }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closeModal();
      return;
    }

    if (e.key === "Enter") {
      if (queryIsGeo) {
        e.preventDefault();
        void handleGeocodeQuery();
        return;
      }
      if (selectedIndex >= 0 && results[selectedIndex]) {
        e.preventDefault();
        selectCity(results[selectedIndex]);
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        Math.min(prev + 1, results.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    }
  };

  const modalContent = (
    <div className={styles.modalOverlay} onClick={closeModal}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Search Cities</h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={closeModal}
            aria-label="Close search"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.modalSearch}>
          <div className={styles.inputWrap}>
            <svg
              className={styles.leadingIcon}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              className={styles.input}
              value={query}
              placeholder="Enter city, ZIP code, or address"
              onChange={(e) => {
                setQuery(e.target.value);
                scheduleCitySearch(e.target.value);
              }}
              onKeyDown={handleInputKeyDown}
            />
          </div>
          <button
            type="button"
            className={styles.modalGpsBtn}
            title={storedGPSLocation ? "Re-center map on your location" : "Use current location"}
            aria-label={storedGPSLocation ? "Re-center map on your location" : "Use current location"}
            onClick={() => void handleUseCurrentLocation(undefined, true)}
            disabled={geoLoading && !storedGPSLocation}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3" />
              <path d="M12 19v3" />
              <path d="M2 12h3" />
              <path d="M19 12h3" />
            </svg>
            <span>Use my location</span>
          </button>
        </div>

        <div className={styles.modalResults} role="listbox">
          {geoLoading ? (
            <div className={styles.resultItem}>
              <span className={styles.resultLoading}>Locating…</span>
            </div>
          ) : null}

          {!geoLoading && error ? (
            <div className={styles.resultItem}>
              <div className={styles.resultError}>
                <span>Search unavailable</span>
                <span className={styles.resultMeta}>{error}</span>
              </div>
            </div>
          ) : null}

          {!geoLoading && !error && queryIsGeo && trimmed.length > 0 ? (
            <button
              type="button"
              className={styles.resultBtn}
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void handleGeocodeQuery()}
            >
              <span>Search address/ZIP</span>
              <span className={styles.resultMeta}>{trimmed}</span>
            </button>
          ) : null}

          {!geoLoading && !error && !queryIsGeo && loading ? (
            <div className={styles.resultItem}>
              <span className={styles.resultLoading}>Searching…</span>
            </div>
          ) : null}

          {!geoLoading &&
            !error &&
            !queryIsGeo &&
            !loading &&
            trimmed.length >= 2 &&
            results.map((city, idx) => (
              <button
                key={`${city.id}-${city.display_name}`}
                type="button"
                className={`${styles.resultBtn} ${idx === selectedIndex ? styles.resultBtnSelected : ""}`}
                role="option"
                aria-selected={idx === selectedIndex}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => selectCity(city)}
              >
                <div className={styles.resultCityRow}>
                  {city.emoji ? (
                    <span className={styles.resultEmoji}>{city.emoji}</span>
                  ) : null}
                  <span className={styles.resultCityName}>{city.display_name}</span>
                </div>
                <span className={styles.resultMeta}>Browse →</span>
              </button>
            ))}

          {!geoLoading &&
            !error &&
            !queryIsGeo &&
            !loading &&
            trimmed.length >= 2 &&
            results.length === 0 && (
              <div className={styles.resultItem}>
                <div className={styles.resultEmpty}>
                  <span>No cities found</span>
                  <span className={styles.resultMeta}>
                    Try a different spelling — or enter a ZIP/address
                  </span>
                </div>
              </div>
            )}

          {!geoLoading && !error && !loading && trimmed.length < 2 && (
            <div className={styles.resultItem}>
              <span className={styles.resultHint}>Type to search for cities, or enter a ZIP code</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar button - styled like New Chat / New Research Report */}
      <div className={styles.navItemContainer}>
        <button
          type="button"
          className={styles.navItem}
          onClick={() => setOpen(true)}
        >
          <span className={styles.navIcon}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <span className={styles.navLabel}>Search Cities</span>
        </button>
        <button
          type="button"
          className={`${styles.gpsBtn} ${gpsActive ? styles.gpsBtnActive : ""} ${storedGPSLocation ? styles.gpsBtnOn : ""}`}
          title={storedGPSLocation ? "Turn off GPS location" : "Use current location"}
          aria-label={storedGPSLocation ? "Turn off GPS location" : "Use current location"}
          onClick={(e) => {
            e.stopPropagation();
            void handleUseCurrentLocation(e, false);
          }}
          disabled={geoLoading && !storedGPSLocation}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3" />
            <path d="M12 19v3" />
            <path d="M2 12h3" />
            <path d="M19 12h3" />
          </svg>
        </button>
      </div>

      {/* Modal portal */}
      {mounted && open && createPortal(modalContent, document.body)}
    </>
  );
}
