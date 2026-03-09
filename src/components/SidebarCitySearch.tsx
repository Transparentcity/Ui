"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";

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
  fetchAddressSuggestions,
  suggestionToGeocodeResult,
  type AddressSuggestion,
  type GeocodeResult,
} from "@/lib/locationSearchUtils";
import { saveCity, createPlace } from "@/lib/apiClient";
import LocationMapSave from "@/components/LocationMapSave";
import { DEFAULT_PLACE_RADIUS_M } from "@/lib/mapUtils";

import styles from "./SidebarCitySearch.module.css";

export default function SidebarCitySearch({
  onCitySelect,
  onGPSLocation,
  onFindDistrict,
  onPlaceSaved,
  placeholder = "Search cities…",
}: {
  onCitySelect: (cityId: number) => void;
  onGPSLocation?: (location: { lat: number; lng: number } | null) => void;
  /** Called when user clicks "Find your district" from the null state; parent may open district modal if a city is selected. */
  onFindDistrict?: () => void;
  /** Called after user saves a personalized place from the map step (so parent can refetch places). */
  onPlaceSaved?: (place: { id: number }) => void;
  placeholder?: string;
}) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
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
  /** When set, user resolved city + coordinates (GPS or address); show map save step before opening city. */
  const [pendingCityAndCoords, setPendingCityAndCoords] = useState<{
    city: PublicCitySearchResult;
    coords: { lat: number; lng: number };
  } | null>(null);
  const [savePlaceLoading, setSavePlaceLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastRequestIdRef = useRef(0);
  const searchTimeoutRef = useRef<number | null>(null);
  const addressSuggestTimeoutRef = useRef<number | null>(null);
  const geoLoadingTimeoutRef = useRef<number | null>(null);

  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSuggestionsLoading, setAddressSuggestionsLoading] = useState(false);

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
      if (addressSuggestTimeoutRef.current) window.clearTimeout(addressSuggestTimeoutRef.current);
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
    setAddressSuggestions([]);
    setError(null);
    setSelectedIndex(-1);
    setPendingCityAndCoords(null);
    if (geoLoading) {
      setGeoLoading(false);
    }
    setGpsActive(false);
    if (geoLoadingTimeoutRef.current) {
      window.clearTimeout(geoLoadingTimeoutRef.current);
      geoLoadingTimeoutRef.current = null;
    }
    if (addressSuggestTimeoutRef.current) {
      window.clearTimeout(addressSuggestTimeoutRef.current);
      addressSuggestTimeoutRef.current = null;
    }
  };

  const scheduleCitySearch = (q: string) => {
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = window.setTimeout(() => {
      void runCitySearch(q);
    }, 250);
  };

  const scheduleAddressSuggest = (q: string) => {
    if (addressSuggestTimeoutRef.current) window.clearTimeout(addressSuggestTimeoutRef.current);
    const s = q.trim();
    if (s.length < 2) {
      setAddressSuggestions([]);
      setAddressSuggestionsLoading(false);
      return;
    }
    setAddressSuggestionsLoading(true);
    addressSuggestTimeoutRef.current = window.setTimeout(async () => {
      const list = await fetchAddressSuggestions(s);
      setAddressSuggestions(list);
      setAddressSuggestionsLoading(false);
      setSelectedIndex(-1);
    }, 300);
  };

  const handleAddressSuggestionSelect = async (suggestion: AddressSuggestion) => {
    if (!suggestion.cityName) {
      setError("Could not determine city from this address.");
      return;
    }
    setGeoLoading(true);
    setError(null);
    setAddressSuggestions([]);
    try {
      const geo = suggestionToGeocodeResult(suggestion);
      const { city, coordinates } = await resolveCityFromGeocode(geo, searchPublicCities);
      if (coordinates) {
        setStoredGPSLocation(coordinates);
        if (onGPSLocation) onGPSLocation(coordinates);
        if (isAuthenticated) {
          showMapSaveStep(city, coordinates);
        } else {
          selectCity(city, true);
        }
      } else {
        selectCity(city, true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not find city for this address.");
    } finally {
      setGeoLoading(false);
    }
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
    onCitySelect(city.id);
  };

  const showMapSaveStep = (city: PublicCitySearchResult, coords: { lat: number; lng: number }) => {
    setPendingCityAndCoords({ city, coords });
    setError(null);
  };

  const handleSavePlaceAndOpen = async (opts: { label: string; radius_m: number }) => {
    if (!pendingCityAndCoords || !isAuthenticated) return;
    setSavePlaceLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      await saveCity(pendingCityAndCoords.city.id, token);
      const place = await createPlace(token, {
        city_id: pendingCityAndCoords.city.id,
        label: opts.label.trim() || "My block",
        lat: pendingCityAndCoords.coords.lat,
        lng: pendingCityAndCoords.coords.lng,
        radius_m: opts.radius_m,
      });
      onPlaceSaved?.(place);
      onCitySelect(pendingCityAndCoords.city.id);
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save place");
    } finally {
      setSavePlaceLoading(false);
    }
  };

  const handleJustOpenCity = () => {
    if (!pendingCityAndCoords) return;
    onCitySelect(pendingCityAndCoords.city.id);
    closeModal();
  };

  const handleGeocodeQuery = async () => {
    const s = trimmed;
    if (!s) return;
    setGeoLoading(true);
    setError(null);
    try {
      const geo = await geocodeQuery(s);
      const { city, coordinates } = await resolveCityFromGeocode(geo, searchPublicCities);
      if (coordinates) {
        setStoredGPSLocation(coordinates);
        if (onGPSLocation) onGPSLocation(coordinates);
        if (isAuthenticated) {
          showMapSaveStep(city, coordinates);
        } else {
          selectCity(city, true);
        }
      } else {
        selectCity(city, true);
      }
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
      
      const geo = await reverseGeocode(location.lat, location.lng);
      const { city } = await resolveCityFromGeocode(geo, searchPublicCities);
      if (isAuthenticated) {
        showMapSaveStep(city, location);
      } else {
        selectCity(city, true);
      }
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

    const listLength = addressSuggestions.length > 0 ? addressSuggestions.length : results.length;

    if (e.key === "Enter") {
      if (addressSuggestions.length > 0 && selectedIndex >= 0 && addressSuggestions[selectedIndex]) {
        e.preventDefault();
        void handleAddressSuggestionSelect(addressSuggestions[selectedIndex]);
        return;
      }
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
      setSelectedIndex((prev) => Math.min(prev + 1, listLength - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    }
  };

  const modalContent = (
    <div className={styles.modalOverlay} onClick={closeModal}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {pendingCityAndCoords ? "Save a personalized location" : "Search Cities"}
          </h2>
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

        {pendingCityAndCoords ? (
          <div className={styles.modalMapSaveStep}>
            <p className={styles.modalMapSaveCity}>
              {pendingCityAndCoords.city.emoji && (
                <span className={styles.modalMapSaveEmoji}>{pendingCityAndCoords.city.emoji}</span>
              )}
              {pendingCityAndCoords.city.display_name}
            </p>
            {error && <div className={styles.resultError} style={{ marginBottom: 12 }}><span>{error}</span></div>}
            <LocationMapSave
              cityId={pendingCityAndCoords.city.id}
              lat={pendingCityAndCoords.coords.lat}
              lng={pendingCityAndCoords.coords.lng}
              defaultRadiusM={DEFAULT_PLACE_RADIUS_M}
              onSave={handleSavePlaceAndOpen}
              saving={savePlaceLoading}
              saveButtonLabel="Save & open city"
              onCancel={handleJustOpenCity}
            />
          </div>
        ) : (
        <>
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
              placeholder="Enter address, city, or ZIP code"
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
                scheduleCitySearch(v);
                scheduleAddressSuggest(v);
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

          {!geoLoading && addressSuggestionsLoading && trimmed.length >= 2 ? (
            <div className={styles.resultItem}>
              <span className={styles.resultLoading}>Searching addresses…</span>
            </div>
          ) : null}

          {!geoLoading &&
            !error &&
            !addressSuggestionsLoading &&
            addressSuggestions.length > 0 &&
            addressSuggestions.map((suggestion, idx) => (
              <button
                key={`${suggestion.place_name}-${idx}`}
                type="button"
                className={`${styles.resultBtn} ${idx === selectedIndex ? styles.resultBtnSelected : ""}`}
                role="option"
                aria-selected={idx === selectedIndex}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => void handleAddressSuggestionSelect(suggestion)}
              >
                <span>{suggestion.place_name}</span>
                <span className={styles.resultMeta}>Address →</span>
              </button>
            ))}

          {!geoLoading &&
            !error &&
            addressSuggestions.length === 0 &&
            queryIsGeo &&
            trimmed.length > 0 ? (
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
            addressSuggestions.length === 0 &&
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
            addressSuggestions.length === 0 &&
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
            <>
              <div className={styles.resultItem}>
                <span className={styles.resultHint}>Type to search for cities, or enter a ZIP code</span>
              </div>
              {onFindDistrict && (
                <button
                  type="button"
                  className={styles.resultBtn}
                  onClick={() => {
                    closeModal();
                    onFindDistrict();
                  }}
                >
                  <span>Find your district</span>
                  <span className={styles.resultMeta}>Address, ZIP, or GPS →</span>
                </button>
              )}
            </>
          )}
        </div>
        </>
        )}
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
