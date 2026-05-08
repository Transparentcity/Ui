"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useFocusTrap } from "@/lib/useFocusTrap";
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
  getCityLeaders,
  createPlace,
  runPlaceMetricsAndAnomaliesAsJob,
  followRepresentative,
  unfollowRepresentative,
  subscribeNewsletter,
  unsubscribeNewsletter,
  type CityDetail,
  type CityLeader,
} from "@/lib/apiClient";
import { usePlaceOnboarding } from "@/contexts/PlaceOnboardingContext";
import { findDistrictFromCoordinates } from "@/lib/findDistrictFromCoordinates";
import {
  DEFAULT_PLACE_RADIUS_M,
  MAX_PLACE_RADIUS_M,
  buildStaticMapUrl,
} from "@/lib/mapUtils";
import {
  mergeNewsletterPreferenceFields,
  readNewsletterPreferenceFields,
} from "@/lib/newsletterPreferences";
import { slugify } from "@/lib/utils";
import {
  stripUnsupportedHomeRequest,
} from "@/lib/onboardingHomeLocation";
import { recordProductEvent, useProductEvent } from "@/lib/productAnalytics";
import styles from "./WelcomeModal.module.css";
import Loader from "./Loader";

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when user finishes onboarding with a city (and optional place). Pass placeId to open place-level view. */
  onCitySelected: (cityId: number, district?: number | null, placeId?: number | null) => void;
  onComplete: (context: {
    cityId: number;
    cityName: string;
    homeCoordinates: { lat: number; lng: number } | null;
    hasPreciseLocation: boolean;
    district?: number | null;
    placeId?: number | null;
  }) => void;
  /** Called when the user's city is not found or not yet active. */
  onCityNotFound?: (cityName: string, state: string | null, country: string | null) => void;
}

type Step = "welcome" | "place" | "preferences";
type WelcomeLoadingAction = "search" | "gps" | null;

/** Default saved place label on onboarding step 2 (createPlace only when location is precise). */
const ONBOARDING_PLACE_LABEL_DEFAULT = "My place";

/** Mayor from a loaded leaders list — citywide (district null/0), preferring title containing "mayor". */
function pickMayorFromLeaders(leaders: CityLeader[]): CityLeader | null {
  const citywide = leaders.filter((l) => l.district === null || l.district === 0);
  return citywide.find((l) => l.title.toLowerCase().includes("mayor")) ?? citywide[0] ?? null;
}

/** District representative from a loaded leaders list for a specific district number. */
function pickRepFromLeaders(leaders: CityLeader[], district: number | null): CityLeader | null {
  if (!district || district <= 0) return null;
  return leaders.find((l) => l.district === district) ?? null;
}

/** Two-letter initials from "First Last" or "Last, First" formats. */
function leaderInitials(name: string): string {
  const parts = name.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? "?";
}

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
  const focusTrapRef = useFocusTrap(isOpen);
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<WelcomeLoadingAction>(null);
  const [leadersLoading, setLeadersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState("");
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const [homeCoordinates, setHomeCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [hasPreciseLocation, setHasPreciseLocation] = useState(false);
  const [placeLabel, setPlaceLabel] = useState(ONBOARDING_PLACE_LABEL_DEFAULT);
  const [placeRadius, setPlaceRadius] = useState(DEFAULT_PLACE_RADIUS_M);

  // Leader follow toggles (default: follow both, applied at submit)
  const [mayorFollowed, setMayorFollowed] = useState(true);
  const [repFollowed, setRepFollowed] = useState(true);

  // Preferences state — two opt-ins: alerts + custom weekly newsletter
  const alertsOptIn = false; // anomaly alerts not available at launch
  const [weeklyNewsletterOptIn, setWeeklyNewsletterOptIn] = useState(true);
  const [showDigestNudge, setShowDigestNudge] = useState(false);
  const [newsletterDescription, setNewsletterDescription] = useState("");
  const newsletterFrequency = "weekly" as const;
  const [showAdvancedNewsletterSettings, setShowAdvancedNewsletterSettings] = useState(false);

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
      setLoading(false);
      setLoadingAction(null);
      setLocationInput("");
      setLocationResult(null);
      setError(null);

      setHomeCoordinates(null);
      setHasPreciseLocation(false);
      setPlaceLabel(ONBOARDING_PLACE_LABEL_DEFAULT);
      setPlaceRadius(DEFAULT_PLACE_RADIUS_M);
      setMayorFollowed(true);
      setRepFollowed(true);
      setLeadersLoading(false);
      setAddressSuggestions([]);
      setShowAddressDropdown(false);
      // Reset preferences
      setWeeklyNewsletterOptIn(true);
      setNewsletterDescription("");
      setShowAdvancedNewsletterSettings(false);

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

  // Fire step-view analytics whenever the active step changes
  useEffect(() => {
    if (!isOpen) return;
    const eventMap: Record<Step, string> = {
      welcome: "onboarding_step1_viewed",
      place: "onboarding_step2_viewed",
      preferences: "onboarding_step3_viewed",
    };
    recordProductEvent(eventMap[step]);
  }, [isOpen, step]);

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

    // Only street addresses / POIs are "precise" for street-level home.
    // Postcode suggestions use centroid for district inference only (no saved place).
    const types = suggestion.place_types ?? [];
    const isPrecisePick = types.includes("address") || types.includes("poi");
    const isPostcodePick = types.includes("postcode");
    if (isPrecisePick) {
      setHomeCoordinates({ lat: suggestion.lat, lng: suggestion.lon });
      setHasPreciseLocation(true);
    } else {
      setHomeCoordinates(null);
      setHasPreciseLocation(false);
    }
    const coordsForDistrict =
      isPrecisePick || isPostcodePick ? { lat: suggestion.lat, lng: suggestion.lon } : null;
    try {
      await processLocationAndFindCity(
        cityName,
        suggestion.stateName,
        suggestion.countryName,
        null,
        coordsForDistrict,
        isPrecisePick,
        isPostcodePick && !isPrecisePick,
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

    const isActive = cityDetail?.is_launched ?? false;

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
    coordinates: { lat: number; lng: number } | null = null,
    /** Pass explicitly to avoid stale closure reads of hasPreciseLocation state */
    isPrecise: boolean = false,
    /**
     * When geocode/suggest is postcode-level (ZIP centroid), infer council district
     * for nav/follows without treating the home as a street-level saved place.
     */
    allowDistrictFromPostcodeCentroid: boolean = false,
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
    
    const token = await getAccessTokenSilently();

    let finalDistrict = district;
    const shouldInferDistrict =
      (isPrecise || allowDistrictFromPostcodeCentroid) &&
      coordinates &&
      matchedCity &&
      (finalDistrict === null || finalDistrict === undefined);

    const cityDetailPromise = getCity(matchedCity.id, token)
      .catch((err) => { console.error("Error fetching city details:", err); return null; });

    // Fast-path for precise locations (address/GPS): confirm city is active, then
    // transition to step 2 immediately while leaders + district load in the background.
    if (isPrecise && coordinates) {
      const cityDetail = await cityDetailPromise;

      if (!cityDetail) {
        setError("Something went wrong loading city data. Please try again.");
        setLoading(false);
        return;
      }

      const isActive = cityDetail.is_launched ?? false;
      if (!isActive) {
        if (onCityNotFound) {
          onCityNotFound(
            matchedCity.name,
            matchedCity.state || null,
            matchedCity.country || null
          );
          onClose();
        }
        return;
      }

      // Advance to step 2 immediately with partial data; leaders fill in shortly after.
      const partialResult: LocationResult = {
        cityName: matchedCity.name,
        state: matchedCity.state || null,
        country: matchedCity.country || null,
        matchedCity,
        cityDetail,
        leaders: [],
        mayor: null,
        councilMember: null,
        district: null,
        isActive: true,
      };
      setLocationResult(partialResult);
      setStep("place");
      setLeadersLoading(true);

      // Analytics: location confirmed
      recordProductEvent("onboarding_location_confirmed", {
        city_id: matchedCity.id,
        city_name: matchedCity.name,
        is_precise: true,
      });

      // Pre-save partial location so we capture it if the user bails
      void (async () => {
        try {
          await updateUserPreferences({
            extra: {
              home_location: {
                city_id: matchedCity.id,
                coordinates,
              },
            },
          }, token);
        } catch {
          // non-blocking
        }
      })();

      // Load leaders + district in the background (don't block the caller's finally block).
      void (async () => {
        try {
          const districtPromise = shouldInferDistrict
            ? findDistrictFromCoordinates(coordinates.lat, coordinates.lng, matchedCity.id, token)
                .catch((err) => { console.error("District lookup error:", err); return null; })
            : Promise.resolve(null);
          const leadersPromise = getCityLeaders(matchedCity.id, token);

          const [districtResult, leaders] = await Promise.all([districtPromise, leadersPromise]);

          if (districtResult != null) finalDistrict = districtResult;
          const mayor = pickMayorFromLeaders(leaders);
          const councilMember = pickRepFromLeaders(leaders, finalDistrict);

          setLocationResult({
            ...partialResult,
            leaders,
            mayor,
            councilMember,
            district: finalDistrict,
          });
        } catch (err) {
          console.error("Background leader/district load error:", err);
        } finally {
          setLeadersLoading(false);
        }
      })();

      return;
    }

    // Standard path (city-level / postcode): wait for all data before advancing.
    const districtPromise = shouldInferDistrict
      ? findDistrictFromCoordinates(coordinates!.lat, coordinates!.lng, matchedCity.id, token)
          .catch((error) => {
            console.error("Error determining district from coordinates:", error);
            return null;
          })
      : Promise.resolve(null);

    const leadersPromise = getCityLeaders(matchedCity.id, token);

    const [districtResult, cityDetail, leaders] = await Promise.all([
      districtPromise,
      cityDetailPromise,
      leadersPromise,
    ]);

    if (districtResult != null) finalDistrict = districtResult;

    if (!cityDetail) {
      setError("Something went wrong loading city data. Please try again.");
      setLoading(false);
      return;
    }

    const isActive = cityDetail.is_launched ?? false;
    const mayor = pickMayorFromLeaders(leaders);
    const councilMember = pickRepFromLeaders(leaders, finalDistrict);

    const result: LocationResult = {
      cityName: matchedCity.name,
      state: matchedCity.state || null,
      country: matchedCity.country || null,
      matchedCity,
      cityDetail,
      leaders,
      mayor,
      councilMember,
      district: finalDistrict,
      isActive,
    };
    setLocationResult(result);

    if (result.isActive) {
      recordProductEvent("onboarding_location_confirmed", {
        city_id: result.matchedCity?.id,
        city_name: result.cityName,
        is_precise: false,
      });
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
    setLoadingAction("search");
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

      // Extract coordinates from geocode result (used only when result is a precise point)
      const coordinates = geocodeData.lat && geocodeData.lon
        ? { lat: parseFloat(geocodeData.lat), lng: parseFloat(geocodeData.lon) }
        : null;

      // Only mark as precise if the geocode result is an actual address or POI (not city/region/ZIP centroid).
      const placeTypes: string[] = geocodeData.place_type || [];
      const isPrecise = !!(coordinates && (placeTypes.includes("address") || placeTypes.includes("poi")));
      const allowDistrictFromPostcodeCentroid = !!(
        coordinates &&
        placeTypes.includes("postcode")
      );
      if (isPrecise) {
        setHomeCoordinates(coordinates);
        setHasPreciseLocation(true);
      } else {
        setHomeCoordinates(null);
        setHasPreciseLocation(false);
      }

      await processLocationAndFindCity(
        cityName,
        stateName,
        countryName,
        null,
        coordinates,
        isPrecise,
        allowDistrictFromPostcodeCentroid,
      );
    } catch (err) {
      console.error("Location lookup error:", err);
      setError("Failed to look up location. Please try again.");
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  const handleGPSLocation = async () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not available in your browser.");
      return;
    }

    setLoading(true);
    setLoadingAction("gps");
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
      await processLocationAndFindCity(
        cityName,
        stateName,
        countryName,
        null,
        { lat: latitude, lng: longitude },
        true,
      );
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
      setLoadingAction(null);
    }
  };

  // Render step indicator
  const renderStepIndicator = () => {
    const steps = ["welcome", "place", "preferences"];
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

  const locationGpsIcon = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
    </svg>
  );

  // Render combined welcome + location step
  const renderWelcomeStep = () => (
    <div className={styles.stepContent}>
      <div className={styles.brandLogo}>
        <Loader size="lg" color="purple" className="loaderStatic" />
      </div>

      <h1 className={styles.title}>Discover your place</h1>
      <p className={styles.subtitle}>
        Transparent.city monitors your city&apos;s public data to give you the most timely and personalized view of your
        city, block and district.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.locationSection}>
        <button
          type="button"
          className={styles.gpsHeroButton}
          onClick={handleGPSLocation}
          disabled={loading}
          aria-busy={loading}
          aria-label="Use my current location"
        >
          {loadingAction === "gps" ? (
            <Loader size="sm" color="white" />
          ) : (
            <>
              {locationGpsIcon}
              Use my current location
            </>
          )}
        </button>

        <div className={styles.locationDivider} aria-hidden="true">
          <span className={styles.locationDividerLine} />
          <span className={styles.locationDividerText}>or search</span>
          <span className={styles.locationDividerLine} />
        </div>

        <div className={styles.inputGroup} ref={locationInputRef}>
          <div className={styles.inputWithGPS}>
            <input
              type="text"
              className={styles.input}
              placeholder="Enter city, zip or address"
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
          type="button"
          className={styles.primaryButton}
          onClick={handleAddressSubmit}
          disabled={loading || !locationInput.trim()}
        >
          {loadingAction === "search" ? (
            <span className={styles.buttonLoader}>
              <Loader size="sm" color="white" />
            </span>
          ) : (
            "Continue"
          )}
        </button>

      </div>
    </div>
  );

  // Render step 2: Welcome to Transparent City — location confirm, place name, radius
  const renderPlaceStep = () => {
    if (!locationResult) return null;
    const cityDisplayName = locationResult.state
      ? `${locationResult.cityName}, ${locationResult.state}`
      : locationResult.cityName;
    const searchedLabel = locationInput.trim() || (hasPreciseLocation ? "your location" : cityDisplayName);
    // Dynamic zoom so the circle always fits comfortably in the frame
    const mapZoom = homeCoordinates
      ? Math.max(12, Math.floor(15.5 - Math.log2(placeRadius / 100)))
      : 15;

    // Build grey radius circle URL using light-v11 (matches the rest of the product)
    const buildRadiusMapUrl = (): string | null => {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token || !homeCoordinates) return null;
      const { lat, lng } = homeCoordinates;
      const pts = 32;
      const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
      const latDeg = placeRadius / 111320;
      const lngDeg = placeRadius / (111320 * cosLat);
      const ring: [number, number][] = [];
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * 2 * Math.PI;
        ring.push([lng + lngDeg * Math.cos(a), lat + latDeg * Math.sin(a)]);
      }
      const geojson = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
            properties: { fill: "#6b7280", "fill-opacity": 0.12, stroke: "#6b7280", "stroke-width": 1.5, "stroke-opacity": 0.45 },
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: {},
          },
        ],
      };
      const encoded = encodeURIComponent(JSON.stringify(geojson));
      return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/geojson(${encoded})/${lng},${lat},${mapZoom}/400x180@2x?access_token=${token}`;
    };
    const mapUrl = buildRadiusMapUrl();

    return (
      <div className={`${styles.stepContent} ${styles.emailPersonalizationStep}`}>
        <h2 className={styles.stepTitle}>Welcome to Transparent City</h2>

        <div className={styles.goodNewsBanner}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.15" />
            <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Good news — transparent.city covers {searchedLabel}!
        </div>

        <p className={styles.tagline}>
          {locationResult.cityName} publishes the data. We turn it into useful updates for your block and your city.
          Pick your location and coverage area.
        </p>

        {/* Name input above the map */}
        <div className={styles.placeNameAboveMap}>
          <label className={styles.placeNameAboveLabel} htmlFor="place-step-name">Name your place</label>
          <input
            id="place-step-name"
            type="text"
            className={styles.placeNameAboveInput}
            value={placeLabel}
            onChange={(e) => setPlaceLabel(e.target.value)}
            autoComplete="off"
          />
        </div>

        {/* Grey radius circle map — zoom adjusts with slider */}
        {mapUrl && (
          <div className={styles.coverageMapFull}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mapUrl} alt={`Map of ${locationResult.cityName}`} width={400} height={180} />
          </div>
        )}

        {/* Distance slider below map */}
        <div className={styles.placeSetupCard}>
          <div className={styles.placeSetupRow}>
            <span className={styles.placeSetupLabel}>Distance</span>
            <div className={styles.radiusSliderRow}>
              <input
                type="range"
                min={50}
                max={MAX_PLACE_RADIUS_M}
                step={50}
                value={placeRadius}
                onChange={(e) => setPlaceRadius(Number(e.target.value))}
                className={styles.radiusSliderInput}
                aria-label="Place radius in metres"
              />
              <span className={styles.radiusSliderValue}>{placeRadius}m</span>
            </div>
          </div>
          <p className={styles.placeSetupHint}>
            100m ≈ 1 block &nbsp;·&nbsp; 300m ≈ 3 blocks &nbsp;·&nbsp; 700m ≈ 7 blocks
          </p>
        </div>

        <p className={styles.placeNameHint}>
          Tell us how wide an area to search for stories around your location.
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={() => {
              recordProductEvent("onboarding_place_step_next", {
                city_id: locationResult.matchedCity?.id,
                place_label: placeLabel,
                radius_m: placeRadius,
              });
              setStep("preferences");
            }}
          >
            Next
          </button>
          <button className={styles.backButton} onClick={() => setStep("welcome")}>
            Back
          </button>
        </div>
      </div>
    );
  };

  // Render step 3: Almost done — coverage summary + personalize + let's go
  const renderPreferencesStep = () => {
    if (!locationResult) return null;
    const cityDisplayName = locationResult.state
      ? `${locationResult.cityName}, ${locationResult.state}`
      : locationResult.cityName;

    const mayor = locationResult.mayor;
    const rep = locationResult.councilMember;

    const checkIcon = (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );

    // What the user searched — used in the good-news banner
    const searchedLabel = locationInput.trim() || (hasPreciseLocation ? "your location" : cityDisplayName);

    // Simple pin thumbnail for the "My place" row (no radius circle)
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const mapThumbUrl =
      hasPreciseLocation && homeCoordinates && mapboxToken
        ? `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-s+ad35fa(${homeCoordinates.lng},${homeCoordinates.lat})/${homeCoordinates.lng},${homeCoordinates.lat},15/400x140@2x?access_token=${mapboxToken}`
        : null;

    return (
      <div className={`${styles.stepContent} ${styles.emailPersonalizationStep}`}>
        <h2 className={styles.stepTitle}>Almost done</h2>
        <p className={styles.tagline}>
          Your weekly update is sourced entirely from {locationResult.cityName}&apos;s public data. It covers:
        </p>

        {/* Coverage section — district + city only (place was set in previous step) */}
        <label className={styles.coverageSectionHeader}>
          <input
            type="checkbox"
            checked={weeklyNewsletterOptIn}
            onChange={() => {
              const next = !weeklyNewsletterOptIn;
              setWeeklyNewsletterOptIn(next);
              if (!next) setShowDigestNudge(true);
              else setShowDigestNudge(false);
            }}
            className={styles.coverageCheckbox}
          />
          <span className={styles.leaderSectionLabel} style={{ margin: 0 }}>Weekly Update</span>
        </label>
        <div className={styles.coverageSection}>

          {/* My place summary row — shown if place was set in step 2 */}
          {hasPreciseLocation && (
            <div className={styles.coverageRowWrap}>
              <div className={styles.coverageRow}>
                <span className={styles.coverageRowIcon} aria-hidden>
                  <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                    <path d="M6 0C2.686 0 0 2.686 0 6c0 4.5 6 8 6 8s6-3.5 6-8c0-3.314-2.686-6-6-6zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="currentColor" />
                  </svg>
                </span>
                <div className={styles.coverageRowContent}>
                  <span className={styles.coverageRowTitle}>{placeLabel || "My place"}</span>
                  <span className={styles.coverageRowSubtitle}>{locationInput.trim() || "Your location"} · {placeRadius}m</span>
                </div>
              </div>
              <p className={styles.coverageRowDesc}>Public data updates about what is happening near {locationInput.trim() || "your location"}.</p>
            </div>
          )}

          {/* My district row — only shown while loading or when district data exists */}
          {(leadersLoading || rep) && (
            <div className={styles.coverageRowWrap}>
              <div className={styles.coverageRow}>
                <span className={styles.coverageRowIcon} aria-hidden>
                  {rep?.district
                    ? <span className={styles.districtBadge}>D{rep.district}</span>
                    : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.5"/><rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor"/><rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor"/><rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.5"/></svg>
                  }
                </span>
                {leadersLoading ? (
                  <span className={styles.coverageRowLoading}>
                    <Loader size="sm" color="purple" />
                  </span>
                ) : (
                  <>
                    <div className={styles.coverageRowContent}>
                      <span className={styles.coverageRowTitle}>
                        {rep!.district ? `District ${rep!.district}` : cityDisplayName}
                      </span>
                      <span className={styles.coverageRowSubtitle}>{rep!.title} {rep!.name}</span>
                    </div>
                    <button
                      type="button"
                      className={repFollowed ? styles.leaderFollowBtnActive : styles.leaderFollowBtnIdle}
                      onClick={() => setRepFollowed((v) => !v)}
                      aria-pressed={repFollowed}
                      aria-label={`${repFollowed ? "Unfollow" : "Follow"} ${rep!.name}`}
                    >
                      {repFollowed && checkIcon}
                      {repFollowed ? "Following" : "Follow"}
                    </button>
                  </>
                )}
              </div>
              <p className={styles.coverageRowDesc}>Public data updates about what is happening in your district.</p>
            </div>
          )}

          {/* My city row */}
          <div className={`${styles.coverageRowWrap} ${styles.coverageRowWrapLast}`}>
            <div className={styles.coverageRow}>
              <span className={styles.coverageRowIcon} aria-hidden>
                {locationResult.matchedCity?.emoji
                  ? <span className={styles.cityEmoji}>{locationResult.matchedCity.emoji}</span>
                  : <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="5" y="1" width="4" height="13" rx="0.5" fill="currentColor" opacity="0.4"/>
                      <rect x="1" y="4" width="4" height="10" rx="0.5" fill="currentColor"/>
                      <rect x="9" y="4" width="4" height="10" rx="0.5" fill="currentColor"/>
                      <rect x="6" y="4" width="2" height="2" rx="0.3" fill="white"/>
                      <rect x="6" y="8" width="2" height="2" rx="0.3" fill="white"/>
                    </svg>
                }
              </span>
            {leadersLoading ? (
              <span className={styles.coverageRowLoading}>
                <Loader size="sm" color="purple" />
              </span>
            ) : mayor ? (
              <>
                <div className={styles.coverageRowContent}>
                  <span className={styles.coverageRowTitle}>{locationResult.cityName}</span>
                  <span className={styles.coverageRowSubtitle}>{mayor.title} {mayor.name}</span>
                </div>
                <button
                  type="button"
                  className={mayorFollowed ? styles.leaderFollowBtnActive : styles.leaderFollowBtnIdle}
                  onClick={() => setMayorFollowed((v) => !v)}
                  aria-pressed={mayorFollowed}
                  aria-label={`${mayorFollowed ? "Unfollow" : "Follow"} ${mayor.name}`}
                >
                  {mayorFollowed && checkIcon}
                  {mayorFollowed ? "Following" : "Follow"}
                </button>
              </>
            ) : (
              <span className={styles.coverageRowEmpty}>{locationResult.cityName}</span>
            )}
            </div>
            <p className={styles.coverageRowDesc}>Public data updates about what is happening citywide in {locationResult.cityName}.</p>
          </div>

        </div>

        {showDigestNudge && (
          <div className={styles.digestNudge}>
            <span>No problem — you can turn the weekly update on later in Settings.</span>
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

        <div className={styles.advancedNewsletterSection}>
          <button
            type="button"
            className={styles.advancedNewsletterToggle}
            onClick={() => setShowAdvancedNewsletterSettings((v) => !v)}
            aria-expanded={showAdvancedNewsletterSettings}
          >
            {showAdvancedNewsletterSettings ? "Hide personalization options" : "Personalize your weekly update (optional)"}
          </button>
          {showAdvancedNewsletterSettings && (
            <div className={styles.advancedNewsletterPanel}>
              <p className={styles.personalizationIntro}>
                Share a few things you care about and we&apos;ll use them to tailor what we send.
              </p>
              <label className={styles.textInputLabel} htmlFor="welcome-newsletter-personalization">
                In your own words (optional)
              </label>
              <textarea
                id="welcome-newsletter-personalization"
                className={styles.newsletterDescriptionInput}
                rows={3}
                value={newsletterDescription}
                onChange={(e) => setNewsletterDescription(e.target.value)}
                placeholder="e.g. street safety, transit delays, new restaurants, anything near my block."
              />
              {hasPreciseLocation && (
                <div className={styles.radiusSliderRow}>
                  <span className={styles.radiusSliderLabel}>Place radius</span>
                  <input
                    type="range"
                    min={50}
                    max={MAX_PLACE_RADIUS_M}
                    step={50}
                    value={placeRadius}
                    onChange={(e) => setPlaceRadius(Number(e.target.value))}
                    className={styles.radiusSliderInput}
                    aria-label="Place radius in metres"
                  />
                  <span className={styles.radiusSliderValue}>{placeRadius}m</span>
                </div>
              )}
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
              "Let’s go"
            )}
          </button>
          <button
            className={styles.backButton}
            onClick={() => {
              setStep(hasPreciseLocation ? "place" : "welcome");
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  };
  // Save from email-personalization: city + comm prefs.
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
      const homeLocationLabelSnapshot = locationInput.trim();
      const homeDistrictSnapshot = locationResult.district ?? null;

      // Create the user's saved place before navigation so My Places can list city → district → place
      // while the feed is selected (place id is passed to the dashboard shell).
      let createdPlaceId: number | null = null;
      if (hasPreciseLocation && homeCoordinates) {
        try {
          const place = await createPlace(token, {
            city_id: cityId,
            label: placeLabel?.trim() || ONBOARDING_PLACE_LABEL_DEFAULT,
            lat: homeCoordinates.lat,
            lng: homeCoordinates.lng,
            radius_m: placeRadius,
          });
          createdPlaceId = place?.id ?? null;
          if (createdPlaceId) {
            try {
              const { job_id } = await runPlaceMetricsAndAnomaliesAsJob(
                createdPlaceId,
                token,
                {
                  ...(homeDistrictSnapshot != null && homeDistrictSnapshot > 0
                    ? { district: homeDistrictSnapshot }
                    : {}),
                  weekly_newsletter: weeklyNewsletterOptIn,
                }
              );
              startJob(createdPlaceId, job_id);
            } catch {
              // Non-blocking
            }
          }
        } catch {
          // User can add a saved place later from the map flow
        }
      }

      await saveCity(cityId, token);
      emitSavedCitiesChanged();

      // Fire leader follows/unfollows in the background based on onboarding toggle state.
      void (async () => {
        const mayor = locationResult?.mayor ?? null;
        const rep = locationResult?.councilMember ?? null;
        try {
          if (mayor) {
            if (mayorFollowed) await followRepresentative(cityId, "0", token);
            else await unfollowRepresentative(cityId, "0", token);
          }
          if (rep && rep.district != null && rep.district > 0) {
            const districtKey = String(rep.district);
            if (repFollowed) await followRepresentative(cityId, districtKey, token);
            else await unfollowRepresentative(cityId, districtKey, token);
          }
        } catch {
          // Non-blocking; user can manage follows in settings
        }
      })();

      // Start city-level loading banner before navigating to the feed.
      // If the user has a precise address, startJob() will override this
      // with detailed place-level phases once the place is created.
      const cityDisplayName = locationResult.matchedCity.display_name
        || locationResult.matchedCity.name
        || "your city";
      startCityLoading(cityDisplayName);

      // Navigate to the feed immediately; save remaining preferences in the background
      handleFinalNavigation(createdPlaceId);

      // Background: metric ordering, communication prefs, and welcome email
      void (async () => {
        try {
          const latest = await getUserPreferences(token);
          const currentExtra = latest.extra || {};
          const communicationPreferences = mergeNewsletterPreferenceFields(
            currentExtra,
            {
              newsletterDescription,
              newsletterFrequency,
            }
          );
          const extraBase = stripUnsupportedHomeRequest(
            currentExtra as Record<string, unknown>
          );

          const preferencesData: any = {
            has_completed_onboarding: true,
            extra: {
              ...extraBase,
              communication_preferences: {
                ...communicationPreferences,
                anomaly_alerts: alertsOptIn,
                personalized_email: weeklyNewsletterOptIn,
                weekly_digest: weeklyNewsletterOptIn,
              },
            },
          };

          // Always persist home_location with city_id so the feed knows the
          // user's home city on subsequent logins. Include coordinates only
          // when a precise address was provided; include district/label when known.
          preferencesData.extra.home_location = {
            city_id: cityId,
            ...(homeDistrictSnapshot != null
              ? { district: homeDistrictSnapshot }
              : {}),
            ...(hasPreciseLocation && homeCoordinates
              ? { coordinates: homeCoordinates }
              : {}),
            ...(homeLocationLabelSnapshot
              ? { location_label: homeLocationLabelSnapshot }
              : {}),
          };

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

          try {
            const newsletterEmail = user?.email || "";
            if (weeklyNewsletterOptIn) {
              await subscribeNewsletter(cityId, "0", newsletterFrequency, newsletterEmail, token);
            } else {
              await unsubscribeNewsletter(cityId, "0", newsletterFrequency, newsletterEmail, token);
            }
          } catch (subscriptionErr) {
            console.error("Newsletter subscription sync failed:", subscriptionErr);
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
  const handleFinalNavigation = (createdPlaceId: number | null = null) => {
    if (!locationResult?.matchedCity) return;

    const districtToLoad = locationResult.district ?? null;
    onCitySelected(locationResult.matchedCity.id, districtToLoad, createdPlaceId);
    onComplete({
      cityId: locationResult.matchedCity.id,
      cityName: locationResult.matchedCity.display_name
        || locationResult.matchedCity.name
        || "your city",
      homeCoordinates,
      hasPreciseLocation,
      district: districtToLoad,
      placeId: createdPlaceId,
    });
    onClose();
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Welcome" ref={focusTrapRef}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {renderStepIndicator()}

        {step === "welcome" && renderWelcomeStep()}
        {step === "place" && renderPlaceStep()}
        {step === "preferences" && renderPreferencesStep()}
      </div>
    </div>
  );
}
