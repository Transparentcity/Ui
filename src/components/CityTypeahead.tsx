"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { searchPublicCities, type PublicCitySearchResult } from "@/lib/publicApiClient";
import { getSavedCities, saveCity, unsaveCity } from "@/lib/apiClient";
import { emitSavedCitiesChanged, SAVED_CITIES_CHANGED_EVENT } from "@/lib/uiEvents";
import "./CityTypeahead.css";

interface CityTypeaheadProps {
  onCitySelect: (cityId: number) => void;
  placeholder?: string;
  className?: string;
  activeCityId?: number | null;
}

export default function CityTypeahead({
  onCitySelect,
  placeholder = "Search cities...",
  className = "",
  activeCityId = null,
}: CityTypeaheadProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [cityQuery, setCityQuery] = useState("");
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [cityResults, setCityResults] = useState<PublicCitySearchResult[]>([]);
  const [suggestedCities, setSuggestedCities] = useState<PublicCitySearchResult[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [savedCityIds, setSavedCityIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [hoveredCityId, setHoveredCityId] = useState<number | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const lastRequestIdRef = useRef(0);
  const cityPickerRef = useRef<HTMLDivElement | null>(null);

  const normalizedCityQuery = useMemo(() => cityQuery.trim(), [cityQuery]);

  // Normalize country names for comparison (handles variations like "United States" vs "USA")
  const normalizeCountryName = (country: string | null | undefined): string => {
    if (!country) return "";
    const normalized = country.trim().toLowerCase();
    // Handle common variations
    if (normalized === "united states" || normalized === "united states of america" || normalized === "us" || normalized === "usa") {
      return "united states";
    }
    if (normalized === "united kingdom" || normalized === "uk" || normalized === "great britain") {
      return "united kingdom";
    }
    return normalized;
  };

  // Get user's country from browser locale
  const getUserCountry = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const locale = navigator.language || (navigator as any).userLanguage;
      // Extract country code from locale (e.g., "en-US" -> "US")
      const countryCode = locale.split("-")[1]?.toUpperCase();
      
      // Map common country codes to normalized country names
      const countryCodeMap: Record<string, string> = {
        US: "united states",
        CA: "canada",
        GB: "united kingdom",
        AU: "australia",
        NZ: "new zealand",
        IE: "ireland",
        DE: "germany",
        FR: "france",
        ES: "spain",
        IT: "italy",
        NL: "netherlands",
        BE: "belgium",
        CH: "switzerland",
        AT: "austria",
        SE: "sweden",
        NO: "norway",
        DK: "denmark",
        FI: "finland",
        PL: "poland",
        PT: "portugal",
        GR: "greece",
        JP: "japan",
        KR: "south korea",
        CN: "china",
        IN: "india",
        BR: "brazil",
        MX: "mexico",
        AR: "argentina",
        CL: "chile",
        CO: "colombia",
        ZA: "south africa",
        // Add more as needed
      };
      
      return countryCode ? countryCodeMap[countryCode] || null : null;
    } catch {
      return null;
    }
  }, []);

  const sortCitiesByCountry = (cities: PublicCitySearchResult[]): PublicCitySearchResult[] => {
    const userCountry = getUserCountry;
    
    return [...cities].sort((a, b) => {
      const aCountry = normalizeCountryName(a.country);
      const bCountry = normalizeCountryName(b.country);
      
      // If user country is set, prioritize it
      if (userCountry) {
        const aIsUserCountry = aCountry === userCountry;
        const bIsUserCountry = bCountry === userCountry;
        
        if (aIsUserCountry && !bIsUserCountry) return -1;
        if (!aIsUserCountry && bIsUserCountry) return 1;
      }
      
      // Then sort by country name alphabetically
      if (aCountry !== bCountry) {
        return aCountry.localeCompare(bCountry);
      }
      
      // Within same country, sort by display name
      return a.display_name.localeCompare(b.display_name);
    });
  };

  const slugify = (text: string): string => {
    const slug = text.trim().toLowerCase();
    return slug
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const runCitySearch = async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setCityResults([]);
      setCityError(null);
      setCityLoading(false);
      setSelectedIndex(-1);
      return;
    }

    const requestId = ++lastRequestIdRef.current;
    setCityLoading(true);
    setCityError(null);

    try {
      const results = await searchPublicCities(q, 10);
      if (lastRequestIdRef.current !== requestId) return; // stale
      const sortedResults = sortCitiesByCountry(Array.isArray(results) ? results : []);
      setCityResults(sortedResults);
      setSelectedIndex(-1);
      setCityLoading(false);
    } catch (e) {
      if (lastRequestIdRef.current !== requestId) return; // stale
      setCityResults([]);
      setSelectedIndex(-1);
      setCityLoading(false);
      setCityError(e instanceof Error ? e.message : "City search failed");
    }
  };

  const loadSuggestedCities = async () => {
    // Load popular cities, sorted by country with user's country first
    try {
      const results = await searchPublicCities("San Francisco", 10);
      const sortedResults = sortCitiesByCountry(Array.isArray(results) ? results : []);
      setSuggestedCities(sortedResults);
      setCityResults(sortedResults);
      setCityError(null);
      setCityLoading(false);
      setSelectedIndex(-1);
    } catch (e) {
      setSuggestedCities([]);
      setCityResults([]);
      setCityError(e instanceof Error ? e.message : "City search failed");
      setCityLoading(false);
      setSelectedIndex(-1);
    }
  };

  const scheduleCitySearch = (query: string) => {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = window.setTimeout(() => {
      void runCitySearch(query);
    }, 300);
  };

  const selectCity = (city: PublicCitySearchResult) => {
    setCityQuery("");
    setCityDropdownOpen(false);
    setSelectedIndex(-1);
    setHoveredCityId(null);
    onCitySelect(city.id);
  };

  const loadSavedCities = async () => {
    try {
      const token = await getAccessTokenSilently();
      const savedCities = await getSavedCities(token);
      setSavedCityIds(new Set(savedCities.map((city) => city.id)));
    } catch (err) {
      console.error("Error loading saved cities:", err);
    }
  };

  const handleToggleSave = async (cityId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const isSaved = savedCityIds.has(cityId);
    
    try {
      setSaving(true);
      const token = await getAccessTokenSilently();
      
      if (isSaved) {
        await unsaveCity(cityId, token);
        setSavedCityIds((prev) => {
          const next = new Set(prev);
          next.delete(cityId);
          return next;
        });
      } else {
        await saveCity(cityId, token);
        setSavedCityIds((prev) => {
          const next = new Set(prev);
          next.add(cityId);
          return next;
        });
      }
      
      emitSavedCitiesChanged();
    } catch (err: any) {
      console.error("Error toggling save city:", err);
      alert("Failed to update saved status. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Load saved cities on mount only (cache handles deduplication)
  useEffect(() => {
    void loadSavedCities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only load once on mount - cache will handle deduplication

  // Listen for saved cities changes to update local state
  useEffect(() => {
    const handleSavedCitiesChanged = () => {
      void loadSavedCities();
    };

    window.addEventListener(SAVED_CITIES_CHANGED_EVENT, handleSavedCitiesChanged);
    return () => {
      window.removeEventListener(SAVED_CITIES_CHANGED_EVENT, handleSavedCitiesChanged);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (cityPickerRef.current && !cityPickerRef.current.contains(target)) {
        setCityDropdownOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  return (
    <div className={`city-typeahead ${className}`} ref={cityPickerRef}>
      <div className="city-typeahead-input-wrapper">
        <svg
          className="city-typeahead-search-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <input
          className="city-typeahead-input"
          value={cityQuery}
          placeholder={placeholder}
          onChange={(e) => {
            setCityQuery(e.target.value);
            setCityDropdownOpen(true);
            scheduleCitySearch(e.target.value);
          }}
          onFocus={() => {
            setCityDropdownOpen(true);
            const q = cityQuery.trim();
            if (q.length < 2) {
              if (suggestedCities.length) {
                setCityResults(suggestedCities);
                setSelectedIndex(-1);
              } else {
                setCityLoading(true);
                void loadSuggestedCities();
              }
              return;
            }
            scheduleCitySearch(cityQuery);
          }}
          onKeyDown={(e) => {
            if (!cityDropdownOpen) return;
            if (!cityResults.length) return;

            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelectedIndex((prev) => Math.min(prev + 1, cityResults.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelectedIndex((prev) => Math.max(prev - 1, -1));
            } else if (e.key === "Enter" && selectedIndex >= 0) {
              e.preventDefault();
              const city = cityResults[selectedIndex];
              if (city) selectCity(city);
            } else if (e.key === "Escape") {
              setCityDropdownOpen(false);
              setSelectedIndex(-1);
            }
          }}
        />
      </div>

      {cityDropdownOpen && (
        <div
          className="city-typeahead-dropdown"
          role="listbox"
          aria-label="City options"
        >
          {cityLoading && (
            <div className="city-typeahead-option" role="option" aria-selected={false}>
              <div>Searching…</div>
              <div className="city-typeahead-meta">Type at least 2 characters</div>
            </div>
          )}

          {!cityLoading && cityError && (
            <div className="city-typeahead-option" role="option" aria-selected={false}>
              <div>City search unavailable</div>
              <div className="city-typeahead-meta">{cityError}</div>
            </div>
          )}

          {!cityLoading && !cityError && normalizedCityQuery.length < 2 && (
            <>
              {cityResults.length ? null : (
                <div
                  className="city-typeahead-option"
                  role="option"
                  aria-selected={false}
                >
                  <div>Start with San Francisco</div>
                  <div className="city-typeahead-meta">
                    Or search by city, state, or country
                  </div>
                </div>
              )}
            </>
          )}

          {!cityLoading &&
            !cityError &&
            normalizedCityQuery.length >= 2 &&
            cityResults.map((city, idx) => (
              <div
                key={`${city.id}-${city.display_name}`}
                className="city-typeahead-option"
                role="option"
                aria-selected={idx === selectedIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCity(city);
                }}
                onMouseEnter={() => {
                  setHoveredCityId(city.id);
                }}
                onMouseLeave={() => setHoveredCityId(null)}
                style={{
                  background:
                    idx === selectedIndex ? "rgba(17, 24, 39, 0.05)" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {city.emoji ? (
                    <span aria-hidden style={{ fontSize: 18 }}>
                      {city.emoji}
                    </span>
                  ) : null}
                  <div>{city.display_name}</div>
                </div>
                <button
                  className="city-typeahead-save-btn"
                  onClick={(e) => handleToggleSave(city.id, e)}
                  disabled={saving}
                  title={savedCityIds.has(city.id) ? "Remove from My Cities" : "Save to My Cities"}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill={savedCityIds.has(city.id) ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
              </div>
            ))}

          {/* Suggested cities (shown before typing) */}
          {!cityLoading &&
            !cityError &&
            normalizedCityQuery.length < 2 &&
            cityResults.map((city, idx) => (
              <div
                key={`${city.id}-${city.display_name}`}
                className="city-typeahead-option"
                role="option"
                aria-selected={idx === selectedIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCity(city);
                }}
                onMouseEnter={() => {
                  setHoveredCityId(city.id);
                }}
                onMouseLeave={() => setHoveredCityId(null)}
                style={{
                  background:
                    idx === selectedIndex
                      ? "rgba(17, 24, 39, 0.05)"
                      : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {city.emoji ? (
                    <span aria-hidden style={{ fontSize: 18 }}>
                      {city.emoji}
                    </span>
                  ) : null}
                  <div>{city.display_name}</div>
                </div>
                <button
                  className="city-typeahead-save-btn"
                  onClick={(e) => handleToggleSave(city.id, e)}
                  disabled={saving}
                  title={savedCityIds.has(city.id) ? "Remove from My Cities" : "Save to My Cities"}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill={savedCityIds.has(city.id) ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
              </div>
            ))}

          {!cityLoading &&
            !cityError &&
            normalizedCityQuery.length >= 2 &&
            cityResults.length === 0 && (
              <div className="city-typeahead-option" role="option" aria-selected={false}>
                <div>No cities found</div>
                <div className="city-typeahead-meta">Try a different search term</div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

