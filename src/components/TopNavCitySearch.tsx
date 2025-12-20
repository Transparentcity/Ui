"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  searchPublicCities,
  type PublicCitySearchResult,
} from "@/lib/publicApiClient";

import styles from "./TopNavCitySearch.module.css";

type GeocodeAddress = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
  postcode?: string;
};

type GeocodeResult = {
  lat: string;
  lon: string;
  display_name?: string;
  address?: GeocodeAddress;
  cityName?: string | null;
  stateName?: string | null;
  countryName?: string | null;
};

function isLikelyZipcode(q: string): boolean {
  const s = q.trim();
  return /^\d{5}(-\d{4})?$/.test(s);
}

function isLikelyAddress(q: string): boolean {
  const s = q.trim();
  if (s.length < 4) return false;
  const hasDigits = /\d/.test(s);
  const hasLetters = /[a-zA-Z]/.test(s);
  if (!hasDigits || !hasLetters) return false;
  return s.includes(" ") || s.includes(",");
}

function extractCityName(addr?: GeocodeAddress): string | null {
  if (!addr) return null;
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.hamlet ||
    null
  );
}

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

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastRequestIdRef = useRef(0);
  const searchTimeoutRef = useRef<number | null>(null);

  const trimmed = useMemo(() => query.trim(), [query]);
  const queryIsGeo = useMemo(
    () => isLikelyZipcode(trimmed) || isLikelyAddress(trimmed),
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

    if (isLikelyZipcode(s) || isLikelyAddress(s)) {
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

  const resolveCityFromGeocode = async (geo: GeocodeResult) => {
    const cityName = geo.cityName || extractCityName(geo.address);
    const stateName = geo.stateName || geo.address?.state || null;

    if (!cityName) {
      throw new Error("Couldn't determine a city from that location.");
    }

    const cityQuery = stateName ? `${cityName}, ${stateName}` : cityName;
    const cityResults = await searchPublicCities(cityQuery, 10);
    const list = Array.isArray(cityResults) ? cityResults : [];
    if (!list.length) {
      throw new Error(`No matching city found for "${cityQuery}".`);
    }

    const normalized = cityName.trim().toLowerCase();
    const best =
      list.find((c) => (c.name || "").trim().toLowerCase() === normalized) ||
      list[0];
    
    console.log("GPS resolved city:", best);
    selectCity(best);
  };

  const handleGeocodeQuery = async () => {
    const s = trimmed;
    if (!s) return;
    setGeoLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(s)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Geocoding failed (${res.status})`);
      }
      const geo = (await res.json()) as GeocodeResult;
      await resolveCityFromGeocode(geo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geocoding failed");
    } finally {
      setGeoLoading(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation isn't available in this browser.");
      return;
    }

    setGeoLoading(true);
    setError(null);
    setDropdownOpen(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 30000,
        });
      });

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      
      // Notify parent about GPS location for map zooming
      if (onGPSLocation) {
        onGPSLocation({ lat, lng });
      }
      
      const res = await fetch(
        `/api/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Reverse geocoding failed (${res.status})`);
      }
      const geo = (await res.json()) as GeocodeResult;
      await resolveCityFromGeocode(geo);
    } catch (e) {
      console.error("GPS location error:", e);
      setError(e instanceof Error ? e.message : "Failed to use current location.");
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
              placeholder={placeholder}
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
                width="18"
                height="18"
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
            title="Use current location"
            aria-label="Use current location"
            onClick={() => void handleUseCurrentLocation()}
            disabled={geoLoading}
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


