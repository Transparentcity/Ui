"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { emitSavedCitiesChanged } from "@/lib/uiEvents";
import {
  searchPublicCities,
  type PublicCitySearchResult,
} from "@/lib/publicApiClient";
import {
  fetchAddressSuggestions,
  type AddressSuggestion,
} from "@/lib/locationSearchUtils";
import {
  saveCity,
  updateUserPreferences,
  getUserPreferences,
  getCity,
  createPlace,
  getCityMetrics,
  saveUserMetricOrdering,
  runPlaceMetricsAndAnomaliesAsJob,
  type CityDetail,
  type CityLeader,
  type MetricOrderingItem,
} from "@/lib/apiClient";
import { usePlaceOnboarding } from "@/contexts/PlaceOnboardingContext";
import { findDistrictFromCoordinates } from "@/lib/findDistrictFromCoordinates";
import { DEFAULT_PLACE_RADIUS_M } from "@/lib/mapUtils";
import {
  mergeNewsletterPreferenceFields,
  readNewsletterPreferenceFields,
} from "@/lib/newsletterPreferences";
import { CATEGORY_PRESETS } from "@/lib/feed/categoryPresets";
import { slugify } from "@/lib/utils";
import styles from "./WelcomeModal.module.css";
import Loader from "./Loader";

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when user finishes onboarding with a city (and optional place). Pass placeId to open block-level view. */
  onCitySelected: (cityId: number, district?: number | null, placeId?: number | null) => void;
  onComplete: (context: {
    cityId: number;
    cityName: string;
    homeCoordinates: { lat: number; lng: number } | null;
    hasPreciseLocation: boolean;
  }) => void;
  /** Called when the user's city is not found or not yet active. */
  onCityNotFound?: (cityName: string, state: string | null, country: string | null) => void;
}

type Step = "welcome" | "preferences";

interface LocationResult {
  cityName: string;
  state: string | null;
  country: string | null;
  matchedCity: PublicCitySearchResult | null;
  cityDetail: CityDetail | null;
  leaders: CityLeader[];
  mayor: CityLeader | null;
  councilMember: CityLeader | null;
  district: number | null;
  isActive: boolean;
}

export default function WelcomeModal({
  isOpen,
  onClose,
  onCitySelected,
  onComplete,
  onCityNotFound,
}: WelcomeModalProps) {
  const { getAccessTokenSilently, user } = useAuth0();
  const { startJob, startCityLoading } = usePlaceOnboarding();
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState("");
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const [homeCoordinates, setHomeCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [hasPreciseLocation, setHasPreciseLocation] = useState(false);
  const [placeLabel, setPlaceLabel] = useState("My Block");
  const [placeRadius, setPlaceRadius] = useState(DEFAULT_PLACE_RADIUS_M);

  // Preferences state — two opt-ins: alerts + custom weekly newsletter
  const alertsOptIn = false; // anomaly alerts not available at launch
  const [weeklyNewsletterOptIn, setWeeklyNewsletterOptIn] = useState(true);
  const [showDigestNudge, setShowDigestNudge] = useState(false);
  const [newsletterDescription, setNewsletterDescription] = useState("");
  const newsletterFrequency = "weekly" as const;
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);


  // Address autocomplete state
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSuggestionsLoading, setAddressSuggestionsLoading] = useState(false);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const addressSuggestTimeoutRef = useRef<number | null>(null);
  const locationInputRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    let cancelled = false;

    if (isOpen) {
      setStep("welcome");
      setLocationInput("");
      setLocationResult(null);
      setError(null);

      setHomeCoordinates(null);
      setHasPreciseLocation(false);
      setPlaceLabel("My Block");
      setPlaceRadius(DEFAULT_PLACE_RADIUS_M);
      setAddressSuggestions([]);
      setShowAddressDropdown(false);
      // Reset preferences
      setWeeklyNewsletterOptIn(true);
      setNewsletterDescription("");
      setSelectedCategoryIds(["crime-safety", "government-budget"]);

      const loadSavedNewsletterPreferences = async () => {
        try {
          const token = await getAccessTokenSilently();
          const preferences = await getUserPreferences(token);
          if (cancelled) return;

          const { newsletterDescription } =
            readNewsletterPreferenceFields(preferences.extra);
          setNewsletterDescription(newsletterDescription);
        } catch (err) {
          console.error("Error loading saved newsletter preferences:", err);
        }
      };

      void loadSavedNewsletterPreferences();
    }

    return () => {
      cancelled = true;
    };
  }, [getAccessTokenSilently, isOpen]);

  // Close address dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (locationInputRef.current && !locationInputRef.current.contains(e.target as Node)) {
        setShowAddressDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clear address suggest timeout on unmount
  useEffect(() => {
    return () => {
      if (addressSuggestTimeoutRef.current) {
        window.clearTimeout(addressSuggestTimeoutRef.current);
      }
    };
  }, []);

  /** Fire-and-forget: send welcome email with story previews */
  const sendWelcomeEmail = (opts?: {
    cityId?: number;
    citySlug?: string;
    cityName?: string;
  }) => {
    const email = user?.email;
    if (!email) return;
    fetch("/api/welcome-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ...opts }),
    }).then((res) => {
      if (!res.ok) console.error("[WelcomeModal] welcome email returned", res.status);
    }).catch((err) => console.error("[WelcomeModal] welcome email failed:", err));
  };

  if (!isOpen) return null;

  const fetchSuggestions = async (query: string) => {
    if (query.trim().length < 2) {
      setAddressSuggestions([]);
      return;
    }
    setAddressSuggestionsLoading(true);
    try {
      const suggestions = await fetchAddressSuggestions(query);
      setAddressSuggestions(suggestions);
      setShowAddressDropdown(true);
    } catch (err) {
      console.error("Address suggest error:", err);
      setAddressSuggestions([]);
    } finally {
      setAddressSuggestionsLoading(false);
    }
  };

  const handleLocationInputChange = (value: string) => {
    setLocationInput(value);
    setError(null);

    if (addressSuggestTimeoutRef.current) {
      window.clearTimeout(addressSuggestTimeoutRef.current);
    }

    if (value.trim().length < 2) {
      setAddressSuggestions([]);
      setShowAddressDropdown(false);
      return;
    }

    setShowAddressDropdown(true);
    addressSuggestTimeoutRef.current = window.setTimeout(() => {
      fetchSuggestions(value);
    }, 300);
  };

  const handleAddressSuggestionSelect = async (suggestion: AddressSuggestion) => {
    setShowAddressDropdown(false);
    setLocationInput(suggestion.place_name);
    setAddressSuggestions([]);
    setLoading(true);
    setError(null);

    const cityName =
      suggestion.cityName?.trim() ||
      null;
    if (!cityName) {
      setError("Could not determine city from this address. Please try another or use the GPS button.");
      setLoading(false);
      return;
    }

    setHomeCoordinates({ lat: suggestion.lat, lng: suggestion.lon });
    setHasPreciseLocation(true);
    try {
      await processLocationAndFindCity(
        cityName,
        suggestion.stateName,
        suggestion.countryName,
        null,
        { lat: suggestion.lat, lng: suggestion.lon }
      );
    } catch (err) {
      console.error("Error processing address suggestion:", err);
      if (onCityNotFound) {
        onCityNotFound(cityName, suggestion.stateName, suggestion.countryName);
        onClose();
        return;
      }
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch city details and determine if active (leaders deferred to post-onboarding)
  const fetchCityDetailsAndLeaders = async (
    city: PublicCitySearchResult,
    district: number | null = null
  ): Promise<LocationResult> => {
    const token = await getAccessTokenSilently();

    let cityDetail: CityDetail | null = null;

    try {
      cityDetail = await getCity(city.id, token);
    } catch (err) {
      console.error("Error fetching city details:", err);
    }

    const isActive = cityDetail?.is_active ?? false;

    return {
      cityName: city.name,
      state: city.state || null,
      country: city.country || null,
      matchedCity: city,
      cityDetail,
      leaders: [],
      mayor: null,
      councilMember: null,
      district,
      isActive,
    };
  };

  const processLocationAndFindCity = async (
    cityName: string,
    stateName: string | null,
    countryName: string | null,
    district: number | null = null,
    coordinates: { lat: number; lng: number } | null = null
  ) => {
    // Search for the city in our database - try multiple search strategies
    const normalizedCityName = cityName.trim().toLowerCase();
    
    // First try: city + state
    const searchQuery = stateName ? `${cityName}, ${stateName}` : cityName;
    let cities = await searchPublicCities(searchQuery, 10);
    
    // If no results and we have state, try just the city name
    if (cities.length === 0 && stateName) {
      cities = await searchPublicCities(cityName, 10);
    }
    
    // Find the best matching city
    let matchedCity = cities.find(
      (c) => (c.name || "").trim().toLowerCase() === normalizedCityName
    );
    
    // If no exact match, try partial match
    if (!matchedCity) {
      matchedCity = cities.find(
        (c) => 
          (c.name || "").toLowerCase().includes(normalizedCityName) ||
          normalizedCityName.includes((c.name || "").toLowerCase()) ||
          (c.display_name || "").toLowerCase().includes(normalizedCityName)
      );
    }
    
    // If still no match, use the first result if available
    if (!matchedCity && cities.length > 0) {
      matchedCity = cities[0];
    }
    
    if (!matchedCity) {
      // City not found in our database
      if (onCityNotFound) {
        onCityNotFound(cityName, stateName, countryName);
        onClose();
      }
      return;
    }
    
    // Run district lookup (only for precise locations) and city detail fetch in parallel
    const token = await getAccessTokenSilently();

    let finalDistrict = district;
    const districtPromise =
      coordinates && hasPreciseLocation && !finalDistrict && matchedCity
        ? findDistrictFromCoordinates(coordinates.lat, coordinates.lng, matchedCity.id, token)
            .catch((error) => { console.error("Error determining district from coordinates:", error); return null; })
        : Promise.resolve(null);

    const cityDetailPromise = getCity(matchedCity.id, token)
      .catch((err) => { console.error("Error fetching city details:", err); return null; });

    const [districtResult, cityDetail] = await Promise.all([districtPromise, cityDetailPromise]);

    if (districtResult != null) finalDistrict = districtResult;

    // If the city detail fetch failed entirely, show a retry error
    // instead of incorrectly telling the user we don't have their city
    if (!cityDetail) {
      setError("Something went wrong loading city data. Please try again.");
      setLoading(false);
      return;
    }

    const isActive = cityDetail.is_active ?? false;

    const result: LocationResult = {
      cityName: matchedCity.name,
      state: matchedCity.state || null,
      country: matchedCity.country || null,
      matchedCity,
      cityDetail,
      leaders: [],
      mayor: null,
      councilMember: null,
      district: finalDistrict,
      isActive,
    };
    setLocationResult(result);
    
    if (result.isActive) {
      setStep("preferences");
    } else if (onCityNotFound) {
      onCityNotFound(
        matchedCity.name,
        matchedCity.state || null,
        matchedCity.country || null
      );
      onClose();
    }
  };

  // Helper to detect if input is a zipcode
  const isLikelyZipcode = (q: string): boolean => {
    const s = q.trim();
    // US zipcode format: 5 digits optionally followed by -4 digits
    return /^\d{5}(-\d{4})?$/.test(s);
  };

  const handleAddressSubmit = async () => {
    if (!locationInput.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // For zipcodes, format the query to help Nominatim find the right location
      let query = locationInput.trim();
      if (isLikelyZipcode(query)) {
        // For US zipcodes, add ", USA" to help Nominatim
        // For other countries, we could detect based on format, but for now assume US
        query = `${query}, USA`;
      }

      const geocodeRes = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      
      if (!geocodeRes.ok) {
        if (geocodeRes.status === 404) {
          setError("Location not found. Try a different address or use the GPS button.");
          setLoading(false);
          return;
        }
        throw new Error("Geocoding failed");
      }

      const geocodeData = await geocodeRes.json();
      
      // Extract city name - try multiple fields from the address
      const address = geocodeData.address;
      const cityName = 
        geocodeData.cityName ||
        address?.city ||
        address?.town ||
        address?.village ||
        address?.municipality ||
        address?.county || // Sometimes zipcodes return county as the primary location
        null;
      
      const stateName = geocodeData.stateName || address?.state || null;
      const countryName = geocodeData.countryName || address?.country || null;

      if (!cityName) {
        setError("Could not determine city from this location. Please try entering a city name directly.");
        setLoading(false);
        return;
      }

      // Extract coordinates from geocode result to determine district
      const coordinates = geocodeData.lat && geocodeData.lon
        ? { lat: parseFloat(geocodeData.lat), lng: parseFloat(geocodeData.lon) }
        : null;
      
      // Store home coordinates if available
      if (coordinates) {
        setHomeCoordinates(coordinates);
      }

      // Only mark as precise if the geocode result is an actual address (not just a city name)
      const placeTypes: string[] = geocodeData.place_type || [];
      if (coordinates && (placeTypes.includes("address") || placeTypes.includes("poi"))) {
        setHasPreciseLocation(true);
      }

      await processLocationAndFindCity(cityName, stateName, countryName, null, coordinates);
    } catch (err) {
      console.error("Location lookup error:", err);
      setError("Failed to look up location. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGPSLocation = async () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not available in your browser.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        });
      });

      const { latitude, longitude } = position.coords;
      
      // Store home coordinates
      setHomeCoordinates({ lat: latitude, lng: longitude });
      setHasPreciseLocation(true);

      const reverseRes = await fetch(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`);
      
      if (!reverseRes.ok) {
        throw new Error("Reverse geocoding failed");
      }

      const reverseData = await reverseRes.json();
      const cityName = reverseData.cityName;
      const stateName = reverseData.stateName;
      const countryName = reverseData.countryName;

      if (!cityName) {
        setError("Could not determine your city. Please enter it manually.");
        setLoading(false);
        return;
      }

      // Pass GPS coordinates to determine district
      await processLocationAndFindCity(cityName, stateName, countryName, null, { lat: latitude, lng: longitude });
    } catch (err: any) {
      console.error("GPS error:", err);
      if (err.code === 1) {
        setError("Location access denied. Please enter your city manually.");
      } else if (err.code === 2) {
        setError("Could not determine your location. Please enter your city.");
      } else if (err.code === 3) {
        setError("Location request timed out. Please try again.");
      } else {
        setError("Failed to get your location. Please enter your city.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Render step indicator
  const renderStepIndicator = () => {
    const steps = ["welcome", "preferences"];
    const currentIndex = steps.indexOf(step);

    return (
      <div className={styles.stepIndicator}>
        {steps.map((s, i) => (
          <div
            key={s}
            className={`${styles.stepDot} ${i === currentIndex ? styles.stepDotActive : ""} ${i < currentIndex ? styles.stepDotComplete : ""}`}
          />
        ))}
      </div>
    );
  };

  // Render combined welcome + location step
  const renderWelcomeStep = () => (
    <div className={styles.stepContent}>
      <div className={styles.brandLogo}>
        <Loader size="lg" color="purple" className="loaderStatic" />
      </div>

      <h1 className={styles.title}>Find out what&apos;s happening near you</h1>
      <p className={styles.subtitle}>
        Enter your city, zip, address or location.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.locationSection}>
        <div className={styles.inputGroup} ref={locationInputRef}>
          <div className={styles.inputWithGPS}>
            <input
              type="text"
              className={styles.input}
              placeholder="Enter your address"
              value={locationInput}
              onChange={(e) => handleLocationInputChange(e.target.value)}
              onFocus={() => locationInput.trim().length >= 2 && setShowAddressDropdown(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddressSubmit();
                }
              }}
              disabled={loading}
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={showAddressDropdown && addressSuggestions.length > 0}
            />
            <button
              className={styles.gpsInlineButton}
              onClick={handleGPSLocation}
              disabled={loading}
              title="Use my location"
              type="button"
            >
              {loading ? (
                <Loader size="sm" color="purple" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                  <line x1="12" y1="2" x2="12" y2="4" />
                  <line x1="12" y1="20" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="4" y2="12" />
                  <line x1="20" y1="12" x2="22" y2="12" />
                </svg>
              )}
            </button>
          </div>

          {showAddressDropdown && (addressSuggestions.length > 0 || addressSuggestionsLoading) && (
            <div className={styles.dropdown} role="listbox">
              {addressSuggestionsLoading ? (
                <div className={styles.dropdownItem}>
                  <Loader size="sm" color="purple" /> Searching…
                </div>
              ) : (
                addressSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.place_name}-${index}`}
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => handleAddressSuggestionSelect(suggestion)}
                    role="option"
                  >
                    <span>{suggestion.place_name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button
          className={styles.primaryButton}
          onClick={handleAddressSubmit}
          disabled={loading || !locationInput.trim()}
        >
          {loading ? (
            <span className={styles.buttonLoader}>
              <Loader size="sm" color="white" />
            </span>
          ) : (
            "Find my city"
          )}
        </button>
      </div>
    </div>
  );

  // One-click preset prompts for personalized newsletter; shared with settings page
  const EMAIL_PRESETS = CATEGORY_PRESETS;

  /** Build newsletter prompt from selected preset ids; used to keep prompt and pills in sync. */
  const buildPromptFromSelection = (ids: string[]): string => {
    if (ids.length === 0) return "";
    const labels = ids
      .map((id) => EMAIL_PRESETS.find((p) => p.id === id)?.label)
      .filter(Boolean) as string[];
    if (labels.length === 0) return "";
    return `Create a ${newsletterFrequency} newsletter for this city and district. Focus on: ${labels.join(", ")}. Include recent changes and trends, notable anomalies, comparative analysis (this period vs. previous, district vs. city-wide), and actionable insights for residents. Be data-driven with specific numbers; highlight both positive and concerning trends.`;
  };

  /** Toggle a category pill; updates selection only (newsletter_description stays blank). */
  const handleCategoryPillToggle = (presetId: string) => {
    const next = selectedCategoryIds.includes(presetId)
      ? selectedCategoryIds.filter((id) => id !== presetId)
      : [...selectedCategoryIds, presetId];
    setSelectedCategoryIds(next);
    // Newsletter description is intentionally left blank — users set it in Settings
    // so the weekly newsletter can use it as custom instructions.
  };

  // Render combined preferences step (topics + notification toggles)
  const renderPreferencesStep = () => {
    if (!locationResult) return null;
    const cityDisplayName = locationResult.state
      ? `${locationResult.cityName}, ${locationResult.state}`
      : locationResult.cityName;

    return (
      <div className={`${styles.stepContent} ${styles.emailPersonalizationStep}`}>
        <h2 className={styles.stepTitle}>What do you care about?</h2>
        <p className={styles.stepDescription}>
          Pick topics to shape your feed for {cityDisplayName}.
        </p>

        <div className={styles.presetChips}>
          {EMAIL_PRESETS.map((preset) => {
            const isActive = selectedCategoryIds.includes(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                className={
                  isActive ? `${styles.presetChip} ${styles.presetChipActive}` : styles.presetChip
                }
                onClick={() => handleCategoryPillToggle(preset.id)}
                aria-pressed={isActive}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className={styles.emailOptIns}>
          <label className={styles.emailOptInOption}>
            <input
              type="checkbox"
              checked={weeklyNewsletterOptIn}
              onChange={() => {
                const next = !weeklyNewsletterOptIn;
                setWeeklyNewsletterOptIn(next);
                if (!next) setShowDigestNudge(true);
                else setShowDigestNudge(false);
              }}
            />
            <div>
              <span className={styles.emailOptInTitle}>
                Weekly digest <span className={styles.recommendedBadge}>Recommended</span>
              </span>
              <span className={styles.emailOptInDesc}>A personalized email based on your topics</span>
            </div>
          </label>
          {showDigestNudge && (
            <div className={styles.digestNudge}>
              <span>Are you sure? You can unsubscribe at any time, and this is the best way to keep up.</span>
              <button
                type="button"
                className={styles.digestNudgeDismiss}
                onClick={() => setShowDigestNudge(false)}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={handleSaveFromEmailPersonalization}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.buttonLoader}>
                <Loader size="sm" color="white" />
              </span>
            ) : (
              "Let\u2019s go"
            )}
          </button>
          <button className={styles.backButton} onClick={() => setStep("welcome")}>
            Back
          </button>
        </div>
      </div>
    );
  };

  /** Build user metric ordering from selected category pills: preferred categories first, then rest. Used for dashboard and map column order. */
  const buildUserMetricOrdering = (
    metrics: Array<{ id: number; category?: string | null; subcategory?: string | null; sub_category?: string | null }>,
    preferredCategoryOrder: string[]
  ): MetricOrderingItem[] => {
    const categoryToMetrics = new Map<string, Array<{ id: number; subcategory: string | null }>>();
    for (const m of metrics) {
      const cat = (m.category && m.category.trim()) || "Uncategorized";
      const sub = (m.subcategory ?? m.sub_category ?? null) && String(m.subcategory ?? m.sub_category).trim() ? String(m.subcategory ?? m.sub_category).trim() : null;
      if (!categoryToMetrics.has(cat)) categoryToMetrics.set(cat, []);
      categoryToMetrics.get(cat)!.push({ id: m.id, subcategory: sub });
    }
    const allCategories = Array.from(categoryToMetrics.keys());
    const preferredSet = new Set(preferredCategoryOrder);
    const preferredOrdered = preferredCategoryOrder.filter((c) => categoryToMetrics.has(c));
    const otherCategories = allCategories.filter((c) => !preferredSet.has(c)).sort((a, b) => a.localeCompare(b));
    const sortedCategories = [...preferredOrdered, ...otherCategories];

    const orderings: MetricOrderingItem[] = [];
    sortedCategories.forEach((categoryName, catIndex) => {
      const categoryOrder = (catIndex + 1) * 100;
      const items = categoryToMetrics.get(categoryName)!;
      const bySub = new Map<string | null, number[]>();
      items.forEach(({ id, subcategory }) => {
        if (!bySub.has(subcategory)) bySub.set(subcategory, []);
        bySub.get(subcategory)!.push(id);
      });
      const subcats = Array.from(bySub.keys()).sort((a, b) => (a == null ? -1 : b == null ? 1 : a.localeCompare(b)));
      let metricOrder = 0;
      subcats.forEach((sub) => {
        (bySub.get(sub) ?? []).forEach((metricId) => {
          metricOrder += 10;
          orderings.push({
            category_name: categoryName,
            category_order: categoryOrder,
            subcategory_name: sub ?? undefined,
            metric_id: metricId,
            metric_order: metricOrder,
          });
        });
      });
    });
    return orderings;
  };

  // Save from email-personalization: city + comm prefs + user metric ordering (from selected pills).
  // Saves the city and navigates immediately; remaining preferences are saved in the background.
  const handleSaveFromEmailPersonalization = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();

      if (!locationResult?.matchedCity) {
        setError("City information missing. Please try again.");
        setLoading(false);
        return;
      }

      const cityId = locationResult.matchedCity.id;
      await saveCity(cityId, token);
      emitSavedCitiesChanged();

      // Start city-level loading banner before navigating to the feed.
      // If the user has a precise address, startJob() will override this
      // with detailed place-level phases once the place is created.
      const cityDisplayName = locationResult.matchedCity.display_name
        || locationResult.matchedCity.name
        || "your city";
      startCityLoading(cityDisplayName);

      // Navigate to the feed immediately; save remaining preferences in the background
      handleFinalNavigation();

      // Background: save place, metric ordering, communication prefs, and welcome email
      void (async () => {
        try {
          // District rep follow is deferred to post-onboarding for speed

          if (hasPreciseLocation && homeCoordinates) {
            try {
              const place = await createPlace(token, {
                city_id: cityId,
                label: placeLabel?.trim() || "My Block",
                lat: homeCoordinates.lat,
                lng: homeCoordinates.lng,
                radius_m: placeRadius ?? DEFAULT_PLACE_RADIUS_M,
              });
              // Start the place metrics job now that the place exists
              if (place?.id) {
                try {
                  const { job_id } = await runPlaceMetricsAndAnomaliesAsJob(place.id, token);
                  startJob(place.id, job_id);
                } catch {
                  // Non-blocking
                }
              }
            } catch {
              // ignore
            }
          }

          // Personalized metric order: selected pills (in preset order)
          if (selectedCategoryIds.length > 0) {
            try {
              const metrics = (await getCityMetrics(cityId, token)) || [];
              const preferredOrder: string[] = [];
              for (const preset of EMAIL_PRESETS) {
                if (!selectedCategoryIds.includes(preset.id) || !preset.metricCategories) continue;
                for (const c of preset.metricCategories) {
                  if (!preferredOrder.includes(c)) preferredOrder.push(c);
                }
              }
              const orderings = buildUserMetricOrdering(metrics, preferredOrder);
              if (orderings.length > 0) {
                await saveUserMetricOrdering(cityId, orderings, token);
              }
            } catch (err) {
              console.error("Error saving metric ordering:", err);
            }
          }

          const latest = await getUserPreferences(token);
          const currentExtra = latest.extra || {};
          const communicationPreferences = mergeNewsletterPreferenceFields(
            currentExtra,
            {
              newsletterDescription,
              newsletterFrequency,
            }
          );
          const preferencesData: any = {
            has_completed_onboarding: true,
            extra: {
              ...currentExtra,
              selected_category_ids: selectedCategoryIds,
              communication_preferences: {
                ...communicationPreferences,
                anomaly_alerts: alertsOptIn,
                personalized_email: weeklyNewsletterOptIn,
                weekly_digest: weeklyNewsletterOptIn,
              },
            },
          };

          if (hasPreciseLocation && homeCoordinates) {
            preferencesData.extra.home_location = {
              city_id: cityId,
              coordinates: homeCoordinates,
            };
          }

          // Save preferences with one retry on failure
          try {
            await updateUserPreferences(preferencesData, token);
          } catch (prefErr) {
            console.warn("Preferences save failed, retrying once:", prefErr);
            try {
              await new Promise((r) => setTimeout(r, 1500));
              await updateUserPreferences(preferencesData, token);
            } catch (retryErr) {
              console.error("Preferences save failed after retry:", retryErr);
            }
          }

          // Send welcome email with stories from their city
          const welcomeCityName = locationResult?.matchedCity?.name ?? locationResult?.cityName ?? "";
          sendWelcomeEmail({
            cityId,
            citySlug: slugify(welcomeCityName),
            cityName: welcomeCityName,
          });
        } catch (err) {
          console.error("Error saving preferences in background:", err);
        }
      })();
    } catch (err) {
      console.error("Error saving city:", err);
      setError("Failed to save your city. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle final navigation to city — skip the all-set screen, land directly in feed
  const handleFinalNavigation = () => {
    if (!locationResult?.matchedCity) return;

    const districtToLoad = locationResult.district ?? null;
    onCitySelected(locationResult.matchedCity.id, districtToLoad);
    onComplete({
      cityId: locationResult.matchedCity.id,
      cityName: locationResult.matchedCity.display_name
        || locationResult.matchedCity.name
        || "your city",
      homeCoordinates,
      hasPreciseLocation,
    });
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {renderStepIndicator()}

        {step === "welcome" && renderWelcomeStep()}
        {step === "preferences" && renderPreferencesStep()}
      </div>
    </div>
  );
}
