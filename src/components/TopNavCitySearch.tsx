"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

import styles from "./TopNavCitySearch.module.css";

export default function TopNavCitySearch({
  onCitySelect,
  onGPSLocation,
  placeholder = "Search cities…",
}: {
  onCitySelect: (cityId: number) => void;
  onGPSLocation?: (location: { lat: number; lng: number }) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [results, setResults] = useState<PublicCitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [storedGPSLocation, setStoredGPSLocation] = useState<{ lat: number; lng: number } | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastRequestIdRef = useRef(0);
  const searchTimeoutRef = useRef<number | null>(null);

  const trimmed = useMemo(() => query.trim(), [query]);
  const queryIsGeo = useMemo(
    () => isGeographicQuery(trimmed),
    [trimmed],
  );

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setDropdownOpen(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    };
  }, []);

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

  const selectCity = (city: PublicCitySearchResult) => {
    setQuery("");
    setDropdownOpen(false);
    setSelectedIndex(-1);
    setOpen(false);
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
      
      selectCity(city);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geocoding failed");
    } finally {
      setGeoLoading(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    // If we already have a stored GPS location, re-center the map on it
    // Create a new object reference to ensure React sees it as a change
    if (storedGPSLocation && onGPSLocation) {
      onGPSLocation({ lat: storedGPSLocation.lat, lng: storedGPSLocation.lng });
      return;
    }

    setGeoLoading(true);
    setError(null);
    setDropdownOpen(true);
    try {
      // Get current location using shared utility
      const location = await getCurrentLocation();
      
      // Store the GPS location for future re-centering
      setStoredGPSLocation(location);
      
      // Notify parent about GPS location for map zooming
      if (onGPSLocation) {
        onGPSLocation(location);
      }
      
      // Reverse geocode to get city
      const geo = await reverseGeocode(location.lat, location.lng);
      const { city } = await resolveCityFromGeocode(geo, searchPublicCities);
      
      selectCity(city);
      
      // Reset loading state after successful completion
      setGeoLoading(false);
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
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      {!open ? (
        <button
          type="button"
          className={styles.iconBtn}
          title="Search"
          aria-label="Search"
          onClick={() => {
            setOpen(true);
            setDropdownOpen(true);
          }}
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
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>
      ) : (
        <div className={styles.searchExpanded}>
          <div className={styles.inputWrap}>
            <svg
              className={styles.leadingIcon}
              width="14"
              height="14"
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
                setDropdownOpen(true);
                scheduleCitySearch(e.target.value);
              }}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDropdownOpen(false);
                  setSelectedIndex(-1);
                  setOpen(false);
                  return;
                }

                if (e.key === "Enter") {
                  e.preventDefault();
                  // Auto-trigger geocoding for zipcodes/addresses on Enter
                  if (queryIsGeo && trimmed.length > 0) {
                    void handleGeocodeQuery();
                    return;
                  }
                  // Select city if one is selected
                  if (selectedIndex >= 0 && results[selectedIndex]) {
                    selectCity(results[selectedIndex]);
                  }
                  return;
                }

                if (!dropdownOpen) return;

                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSelectedIndex((prev) =>
                    Math.min(prev + 1, results.length - 1),
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSelectedIndex((prev) => Math.max(prev - 1, -1));
                }
              }}
            />
            <button
              type="button"
              className={styles.iconBtn}
              title="Close search"
              aria-label="Close search"
              onClick={() => {
                setOpen(false);
                setDropdownOpen(false);
                setSelectedIndex(-1);
                setQuery("");
                setError(null);
              }}
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
                <path d="M18 6 6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            className={styles.gpsBtn}
            title={storedGPSLocation ? "Re-center map on your location" : "Use current location"}
            aria-label={storedGPSLocation ? "Re-center map on your location" : "Use current location"}
            onClick={() => void handleUseCurrentLocation()}
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

          {dropdownOpen && (
            <div className={styles.dropdown} role="listbox">
              {geoLoading ? (
                <div className={styles.option} role="option">
                  Locating…
                </div>
              ) : null}

              {!geoLoading && error ? (
                <div className={styles.option} role="option">
                  <div>Search unavailable</div>
                  <div className={styles.meta}>{error}</div>
                </div>
              ) : null}

              {!geoLoading && !error && queryIsGeo && trimmed.length > 0 ? (
                <button
                  type="button"
                  className={`${styles.option} ${styles.optionBtn}`}
                  role="option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleGeocodeQuery()}
                >
                  <div>Search address/ZIP</div>
                  <div className={styles.meta}>{trimmed}</div>
                </button>
              ) : null}

              {!geoLoading && !error && !queryIsGeo && loading ? (
                <div className={styles.option} role="option">
                  Searching…
                  <div className={styles.meta}>
                    Type at least 2 characters
                  </div>
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
                    className={`${styles.option} ${styles.optionBtn}`}
                    role="option"
                    aria-selected={idx === selectedIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => selectCity(city)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {city.emoji ? (
                        <span aria-hidden style={{ fontSize: 16 }}>
                          {city.emoji}
                        </span>
                      ) : null}
                      <div>{city.display_name}</div>
                    </div>
                    <div className={styles.meta}>Browse</div>
                  </button>
                ))}

              {!geoLoading &&
                !error &&
                !queryIsGeo &&
                !loading &&
                trimmed.length >= 2 &&
                results.length === 0 && (
                  <div className={styles.option} role="option">
                    No cities found
                    <div className={styles.meta}>
                      Try a different spelling — or enter a ZIP/address
                    </div>
                  </div>
                )}

              {!geoLoading && !error && trimmed.length < 2 ? (
                <div className={styles.option} role="option">
                  Search cities
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


