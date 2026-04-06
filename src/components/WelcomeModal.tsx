"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
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
  submitCityLeadInterest,
  getCity,
  getCityLeaders,
  createPlace,
  followRepresentative,
  getCityMetrics,
  saveUserMetricOrdering,
  type CityDetail,
  type CityLeader,
  type MetricOrderingItem,
} from "@/lib/apiClient";
import { findDistrictFromCoordinates } from "@/lib/findDistrictFromCoordinates";
import { DEFAULT_PLACE_RADIUS_M } from "@/lib/mapUtils";
import {
  mergeNewsletterPreferenceFields,
  readNewsletterPreferenceFields,
} from "@/lib/newsletterPreferences";
import LocationMapSave from "./LocationMapSave";
import { CATEGORY_PRESETS } from "@/lib/feed/categoryPresets";
import styles from "./WelcomeModal.module.css";
import Loader from "./Loader";

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when user finishes onboarding with a city (and optional place). Pass placeId to open block-level view. */
  onCitySelected: (cityId: number, district?: number | null, placeId?: number | null) => void;
  onComplete: () => void;
}

type Step = "welcome" | "leader" | "preferences" | "all-set" | "coming-soon";

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
}: WelcomeModalProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState("");
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [homeCoordinates, setHomeCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [placeLabel, setPlaceLabel] = useState("My Block");
  const [placeRadius, setPlaceRadius] = useState(DEFAULT_PLACE_RADIUS_M);

  // Preferences state — weekly newsletter opt-in
  const [weeklyNewsletterOptIn, setWeeklyNewsletterOptIn] = useState(true);
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
      setLeadSubmitted(false);
      setHomeCoordinates(null);
      setPlaceLabel("My Block");
      setPlaceRadius(DEFAULT_PLACE_RADIUS_M);
      setAddressSuggestions([]);
      setShowAddressDropdown(false);
      // Reset preferences
      setWeeklyNewsletterOptIn(true);
      setNewsletterDescription("");
      setSelectedCategoryIds([]);

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

  if (!isOpen) return null;

  const handleSkip = async () => {
    try {
      const token = await getAccessTokenSilently();
      await updateUserPreferences({ has_completed_onboarding: true }, token);
      onComplete();
      onClose();
    } catch (err) {
      console.error("Error completing onboarding:", err);
      onClose();
    }
  };

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
      setError("We don’t have that city yet. Try another address or use the GPS button.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch city details, leaders, and determine if active
  const fetchCityDetailsAndLeaders = async (
    city: PublicCitySearchResult,
    district: number | null = null
  ): Promise<LocationResult> => {
    const token = await getAccessTokenSilently();
    
    let cityDetail: CityDetail | null = null;
    let leaders: CityLeader[] = [];
    let mayor: CityLeader | null = null;
    let councilMember: CityLeader | null = null;
    
    try {
      cityDetail = await getCity(city.id, token);
    } catch (err) {
      console.error("Error fetching city details:", err);
    }
    
    try {
      leaders = await getCityLeaders(city.id, token);
    } catch (err) {
      console.error("Error fetching leaders:", err);
    }
    
    // Find mayor (citywide leader)
    if (leaders.length > 0) {
      mayor = leaders.find(
        (l) => 
          l.title?.toLowerCase().includes("mayor") ||
          l.district === null ||
          l.district === 0
      ) || null;
    }
    
    // Find council member based on district
    if (district !== null && leaders.length > 0) {
      councilMember = leaders.find((l) => l.district === district) || null;
    }
    
    const isActive = cityDetail?.is_active ?? false;
    
    return {
      cityName: city.name,
      state: city.state || null,
      country: city.country || null,
      matchedCity: city,
      cityDetail,
      leaders,
      mayor,
      councilMember,
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
      setLocationResult({
        cityName,
        state: stateName,
        country: countryName,
        matchedCity: null,
        cityDetail: null,
        leaders: [],
        mayor: null,
        councilMember: null,
        district,
        isActive: false,
      });
      setStep("coming-soon");
      return;
    }
    
    // If we have coordinates but no district, try to determine district from coordinates
    let finalDistrict = district;
    if (coordinates && !finalDistrict && matchedCity) {
      try {
        const token = await getAccessTokenSilently();
        finalDistrict = await findDistrictFromCoordinates(
          coordinates.lat,
          coordinates.lng,
          matchedCity.id,
          token
        );
      } catch (error) {
        console.error("Error determining district from coordinates:", error);
        // Continue without district if lookup fails
      }
    }
    
    const result = await fetchCityDetailsAndLeaders(matchedCity, finalDistrict);
    setLocationResult(result);
    
    if (result.isActive) {
      setStep("leader");
    } else {
      setStep("coming-soon");
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

  const handleNotifyMe = async () => {
    if (!locationResult) return;

    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      
      await submitCityLeadInterest(
        {
          city_name: locationResult.cityName,
          state: locationResult.state,
          country: locationResult.country,
        },
        token
      );
      
      setLeadSubmitted(true);
      
      // Mark onboarding complete
      await updateUserPreferences({ has_completed_onboarding: true }, token);
    } catch (err) {
      console.error("Error submitting interest:", err);
      setError("Failed to submit interest. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    try {
      const token = await getAccessTokenSilently();
      await updateUserPreferences({ has_completed_onboarding: true }, token);
      onComplete();
      onClose();
    } catch (err) {
      console.error("Error completing onboarding:", err);
      onClose();
    }
  };

  /** After notify-me success, send user to an active city instead of an empty dashboard. */
  const handleBrowseActiveCity = async () => {
    try {
      const token = await getAccessTokenSilently();
      await updateUserPreferences({ has_completed_onboarding: true }, token);
    } catch {
      // non-blocking
    }
    onComplete();
    onClose();
    // Navigate to the first active city (San Francisco as default)
    if (typeof window !== "undefined") {
      window.location.href = "/c/san-francisco";
    }
  };

  // Render step indicator
  const renderStepIndicator = () => {
    // Determine steps based on current flow (no separate "preferences" step)
    let steps: string[] = [];
    if (step === "coming-soon") {
      steps = ["welcome", "coming-soon"];
    } else {
      steps = ["welcome", "leader", "preferences", "all-set"];
    }
    
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

      <h1 className={styles.title}>Where do you live?</h1>
      <p className={styles.subtitle}>
        We&apos;ll show you who represents you and what&apos;s happening in your neighborhood.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.locationSection}>
        <p className={styles.locationHint}>
          Enter your address or tap GPS. You can adjust your exact spot next.
        </p>
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
              className={styles.gpsButton}
              onClick={handleGPSLocation}
              disabled={loading}
              title="Use my current location"
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

  // Advance from leader step — city is saved in the final preferences step to avoid duplicates
  const handleLeaderContinue = () => {
    if (!locationResult?.matchedCity) return;
    setStep("preferences");
  };

  // Render leader step - show representative info
  const renderLeaderStep = () => {
    if (!locationResult) return null;

    const cityDisplayName = locationResult.state
      ? `${locationResult.cityName}, ${locationResult.state}`
      : locationResult.cityName;

    const { mayor, councilMember } = locationResult;
    const showMapAndPlace = homeCoordinates != null && locationResult.matchedCity != null;

    return (
      <div className={`${styles.stepContent} ${styles.leaderStepContent}`}>
        <div className={styles.successIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>

        <h2 className={styles.stepTitle}>
          {locationResult.matchedCity?.emoji && (
            <span className={styles.titleEmoji}>{locationResult.matchedCity.emoji}</span>
          )}
          {cityDisplayName}
        </h2>

        {/* Mayor & Rep above the map */}
        {(mayor || councilMember) && (
          <div className={styles.leadersContainerCompact}>
            {mayor && (
              <div className={styles.leaderCardCompact}>
                <div className={styles.leaderLabel}>Your Mayor</div>
                <div className={styles.leaderName}>{mayor.name}</div>
                <div className={styles.leaderTitle}>{mayor.title}</div>
              </div>
            )}
            {councilMember && (
              <div className={styles.leaderCardCompact}>
                <div className={styles.leaderLabel}>Your Representative</div>
                <div className={styles.leaderName}>{councilMember.name}</div>
                <div className={styles.leaderTitle}>{councilMember.title}</div>
                {councilMember.district && (
                  <div className={styles.leaderDistrict}>District {councilMember.district}</div>
                )}
              </div>
            )}
          </div>
        )}
        {!mayor && !councilMember && (
          <p className={styles.stepDescription}>
            We have data for your city! Explore crime, safety, traffic, and more.
          </p>
        )}
        {(mayor || councilMember) && (
          <p className={styles.locationHint}>
            Flag stories to {councilMember ? councilMember.name : "your rep"} or applaud good work.
          </p>
        )}

        {showMapAndPlace && (
          <div className={styles.leaderStepMapSection}>
            <LocationMapSave
              cityId={locationResult.matchedCity!.id}
              lat={homeCoordinates!.lat}
              lng={homeCoordinates!.lng}
              valueLabel={placeLabel}
              valueRadiusM={placeRadius}
              onLabelChange={setPlaceLabel}
              onRadiusChange={setPlaceRadius}
              defaultLabel="My Block"
              defaultRadiusM={DEFAULT_PLACE_RADIUS_M}
              className={styles.leaderStepLocationMapSave}
            />
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={handleLeaderContinue}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.buttonLoader}>
                <Loader size="sm" color="white" />
              </span>
            ) : (
              "Continue"
            )}
          </button>
          <button className={styles.backButton} onClick={() => setStep("welcome")}>
            Try a different city
          </button>
        </div>
      </div>
    );
  };

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

  /** Toggle a category pill; updates selection and derived newsletter prompt. */
  const handleCategoryPillToggle = (presetId: string) => {
    const next = selectedCategoryIds.includes(presetId)
      ? selectedCategoryIds.filter((id) => id !== presetId)
      : [...selectedCategoryIds, presetId];
    setSelectedCategoryIds(next);
    setNewsletterDescription(buildPromptFromSelection(next));
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
              onChange={() => setWeeklyNewsletterOptIn(!weeklyNewsletterOptIn)}
            />
            <div>
              <span className={styles.emailOptInTitle}>Weekly digest</span>
              <span className={styles.emailOptInDesc}>A personalized email based on your topics</span>
            </div>
          </label>
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
              "Continue"
            )}
          </button>
          <button className={styles.backButton} onClick={() => setStep("leader")}>
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

      const districtToLoad = locationResult.councilMember?.district ?? locationResult.district ?? null;
      if (districtToLoad !== null && districtToLoad !== undefined) {
        try {
          await followRepresentative(cityId, String(districtToLoad), token);
        } catch {
          // ignore
        }
      }

      if (homeCoordinates) {
        try {
          await createPlace(token, {
            city_id: cityId,
            label: placeLabel?.trim() || "My Block",
            lat: homeCoordinates.lat,
            lng: homeCoordinates.lng,
            radius_m: placeRadius ?? DEFAULT_PLACE_RADIUS_M,
          });
        } catch {
          // ignore
        }
      }

      // Personalized metric order: selected pills (in preset order) → preferred categories first for dashboard and map
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
          // Don't block onboarding; user can customize later in Settings
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
            personalized_email: weeklyNewsletterOptIn,
            weekly_digest: weeklyNewsletterOptIn,
          },
        },
      };

      if (homeCoordinates) {
        preferencesData.extra.home_location = {
          city_id: cityId,
          district: districtToLoad,
          coordinates: homeCoordinates,
        };
      } else if (districtToLoad !== null) {
        preferencesData.extra.home_location = {
          city_id: cityId,
          district: districtToLoad,
        };
      }

      await updateUserPreferences(preferencesData, token);
      setStep("all-set");
    } catch (err) {
      console.error("Error saving preferences:", err);
      setError("Failed to save preferences. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle final navigation to city
  const handleFinalNavigation = () => {
    if (!locationResult?.matchedCity) return;
    
    const districtToLoad = locationResult.councilMember?.district ?? locationResult.district ?? null;
    onCitySelected(locationResult.matchedCity.id, districtToLoad);
    onComplete();
    onClose();
  };

  // Render all-set step
  const renderAllSetStep = () => {
    if (!locationResult) return null;

    const cityDisplayName = locationResult.state
      ? `${locationResult.cityName}, ${locationResult.state}`
      : locationResult.cityName;

    return (
      <div className={styles.stepContent}>
        <div className={styles.successIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>

        <h2 className={styles.stepTitle}>You&apos;re all set!</h2>
        <p className={styles.stepDescription}>
          You&apos;re set up for {cityDisplayName}.
        </p>

        <div className={styles.allSetSummary}>
          {selectedCategoryIds.length > 0 && (
            <div className={styles.summaryItem}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>Tracking: {selectedCategoryIds.map(id => EMAIL_PRESETS.find(p => p.id === id)?.label).filter(Boolean).join(", ")}</span>
            </div>
          )}
          {weeklyNewsletterOptIn && (
            <div className={styles.summaryItem}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span>Personalized {newsletterFrequency} email</span>
            </div>
          )}
        </div>
        <p className={styles.disclaimer}>
          You can change these anytime in Settings.
        </p>

        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={handleFinalNavigation}
            disabled={loading}
          >
            Take me to my city
          </button>
        </div>
      </div>
    );
  };

  // Render coming soon step
  const renderComingSoonStep = () => {
    if (!locationResult) return null;

    const cityDisplayName = locationResult.state
      ? `${locationResult.cityName}, ${locationResult.state}`
      : locationResult.cityName;

    return (
      <div className={styles.stepContent}>
        <div className={styles.comingSoonIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h2 className={styles.stepTitle}>{cityDisplayName} is coming soon</h2>
        <p className={styles.stepDescription}>
          We don&apos;t have your city yet. Sign up to be notified when we launch there.
        </p>

        {error && <div className={styles.error}>{error}</div>}

        {!leadSubmitted ? (
          <>
            <div className={styles.actions}>
              <button
                className={styles.primaryButton}
                onClick={handleNotifyMe}
                disabled={loading}
              >
                {loading ? "Submitting..." : "Notify me when available"}
              </button>
              <button className={styles.backButton} onClick={() => setStep("welcome")}>
                Try a different city
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.successMessage}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              You&apos;re on the list! We&apos;ll email you when {cityDisplayName} launches.
            </div>
            <div className={styles.actions}>
              <button className={styles.primaryButton} onClick={handleBrowseActiveCity}>
                Explore an active city
              </button>
              <button className={styles.backButton} onClick={() => setStep("welcome")}>
                Try a different city
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={handleSkip} title="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {renderStepIndicator()}

        {step === "welcome" && renderWelcomeStep()}
        {step === "leader" && renderLeaderStep()}
        {step === "preferences" && renderPreferencesStep()}
        {step === "all-set" && renderAllSetStep()}
        {step === "coming-soon" && renderComingSoonStep()}
      </div>
    </div>
  );
}
