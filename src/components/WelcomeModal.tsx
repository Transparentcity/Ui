"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  searchPublicCities,
  type PublicCitySearchResult,
} from "@/lib/publicApiClient";
import {
  saveCity,
  updateUserPreferences,
  submitCityLeadInterest,
  getCity,
  getCityLeaders,
  getCityStructure,
  getCityShapeLayers,
  type CityDetail,
  type CityLeader,
  type CityStructureData,
  type CityShapefile,
  type CityShapeLayerListItem,
} from "@/lib/apiClient";
import styles from "./WelcomeModal.module.css";
import Loader from "./Loader";

// Helper function to check if a point is inside a polygon (ray casting algorithm)
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

// Find which district contains the GPS point
async function findDistrictFromCoordinates(
  lat: number,
  lng: number,
  cityId: number,
  token: string
): Promise<number | null> {
  try {
    // Get city structure and shapefiles
    const [cityStructure, shapeLayers] = await Promise.all([
      getCityStructure(cityId, token),
      getCityShapeLayers(cityId, token),
    ]);

    if (!cityStructure || !shapeLayers || shapeLayers.length === 0) {
      return null;
    }

    const point: [number, number] = [lng, lat];
    
    // Find the primary geographic structure (the one used by most leaders)
    let primaryGeographicStructureId: number | null = null;
    
    // Get leaders to determine primary structure
    const leaders = await getCityLeaders(cityId, token);
    if (leaders && leaders.length > 0) {
      const structureIdCounts = new Map<number, number>();
      leaders.forEach((leader) => {
        if (leader.geographic_structure_id) {
          const count = structureIdCounts.get(leader.geographic_structure_id) || 0;
          structureIdCounts.set(leader.geographic_structure_id, count + 1);
        }
      });
      
      let maxCount = 0;
      structureIdCounts.forEach((count, structureId) => {
        if (count > maxCount) {
          maxCount = count;
          primaryGeographicStructureId = structureId;
        }
      });
    }
    
    // If no clear winner, try to find by name
    if (!primaryGeographicStructureId && cityStructure.geographic_structures) {
      const districtStructure = cityStructure.geographic_structures.find(
        (gs) => gs.structure_name?.toLowerCase().includes('supervisor') ||
                gs.structure_name?.toLowerCase().includes('council') ||
                gs.structure_name?.toLowerCase().includes('ward') ||
                gs.structure_type?.toLowerCase().includes('supervisor') ||
                gs.structure_type?.toLowerCase().includes('council')
      );
      if (districtStructure && districtStructure.id !== undefined) {
        primaryGeographicStructureId = districtStructure.id;
      }
    }
    
    // Extract shapefile instances from shape layers
    const shapefiles: CityShapefile[] = shapeLayers
      .map((layer) => layer.instance)
      .filter((instance): instance is CityShapefile => instance !== null);
    
    // Separate shapefiles into primary and others
    const primaryShapefiles: CityShapefile[] = [];
    const otherShapefiles: CityShapefile[] = [];
    
    shapefiles.forEach((shapefile) => {
      if (primaryGeographicStructureId && shapefile.geographic_structure_id === primaryGeographicStructureId) {
        primaryShapefiles.push(shapefile);
      } else {
        otherShapefiles.push(shapefile);
      }
    });
    
    // Check primary shapefiles first
    const shapefilesToCheck = [...primaryShapefiles, ...otherShapefiles];
    
    for (const shapefile of shapefilesToCheck) {
      const geometryData = shapefile.geometry_data;
      if (!geometryData || geometryData.type !== "FeatureCollection") continue;
      
      for (const feature of geometryData.features) {
        if (!feature.geometry || !feature.geometry.coordinates) continue;
        
        let rings: [number, number][][] = [];
        
        if (feature.geometry.type === "Polygon") {
          rings = [feature.geometry.coordinates[0] as [number, number][]];
        } else if (feature.geometry.type === "MultiPolygon") {
          rings = feature.geometry.coordinates.map((poly: any) => poly[0] as [number, number][]);
        }
        
        for (const ring of rings) {
          if (pointInPolygon(point, ring)) {
            const identifier = feature.properties?.[shapefile.identifier_field || ""];
            if (identifier !== undefined && identifier !== null) {
              // Try to parse as number, or extract number from string
              const districtNum = typeof identifier === 'number' 
                ? identifier 
                : parseInt(String(identifier).replace(/\D/g, ''), 10);
              if (!isNaN(districtNum)) {
                return districtNum;
              }
            }
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error finding district from coordinates:", error);
    return null;
  }
}

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCitySelected: (cityId: number, district?: number | null) => void;
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
  const [trackBoth, setTrackBoth] = useState(true); // Default to tracking both
  const [homeCoordinates, setHomeCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  
  // Preferences state
  const [personalizedEmail, setPersonalizedEmail] = useState(true);
  const [anomalyAlerts, setAnomalyAlerts] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [monthlyReport, setMonthlyReport] = useState(true);
  const [reportScope, setReportScope] = useState<"district" | "city">("district");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [learningFocus, setLearningFocus] = useState("");
  const [newsletterDescription, setNewsletterDescription] = useState("");
  const [newsletterFrequency, setNewsletterFrequency] = useState<"weekly" | "monthly">("weekly");
  const [showMoreInterests, setShowMoreInterests] = useState(false);
  
  // City search state
  const [citySearchResults, setCitySearchResults] = useState<PublicCitySearchResult[]>([]);
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const searchTimeoutRef = useRef<number | null>(null);
  const citySearchRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("welcome");
      setLocationInput("");
      setLocationResult(null);
      setError(null);
      setLeadSubmitted(false);
      setTrackBoth(true);
      setHomeCoordinates(null);
      // Reset preferences
      setPersonalizedEmail(true);
      setAnomalyAlerts(true);
      setWeeklyDigest(false);
      setMonthlyReport(true);
      setReportScope("district");
      setSelectedCategories([]);
      setLearningFocus("");
      setNewsletterDescription("");
      setNewsletterFrequency("weekly");
      setShowMoreInterests(false);
    }
  }, [isOpen]);

  // Close city dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (citySearchRef.current && !citySearchRef.current.contains(e.target as Node)) {
        setShowCityDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

  const searchCities = async (query: string) => {
    if (query.length < 2) {
      setCitySearchResults([]);
      return;
    }

    setCitySearchLoading(true);
    try {
      const results = await searchPublicCities(query, 8);
      setCitySearchResults(results);
    } catch (err) {
      console.error("City search error:", err);
      setCitySearchResults([]);
    } finally {
      setCitySearchLoading(false);
    }
  };

  const handleCityInputChange = (value: string) => {
    setLocationInput(value);
    setShowCityDropdown(true);
    setError(null);

    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      searchCities(value);
    }, 300);
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

  const handleCitySelect = async (city: PublicCitySearchResult) => {
    setShowCityDropdown(false);
    setLocationInput(city.display_name);
    setLoading(true);
    setError(null);
    
    try {
      const result = await fetchCityDetailsAndLeaders(city, null);
      setLocationResult(result);
      
      if (result.isActive) {
        setStep("leader");
      } else {
        setStep("coming-soon");
      }
    } catch (err) {
      console.error("Error processing city:", err);
      setError("Failed to load city information. Please try again.");
    } finally {
      setLoading(false);
    }
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
    let searchQuery = stateName ? `${cityName}, ${stateName}` : cityName;
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
          setError("Location not found. Please try a different city name or ZIP code.");
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

  const handleGoToCity = async () => {
    if (!locationResult?.matchedCity) return;

    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      
      // Save the city
      await saveCity(locationResult.matchedCity.id, token);
      
      // Determine district to load
      const districtToLoad = locationResult.councilMember?.district ?? locationResult.district ?? null;
      
      // Save home location (coordinates and district) to preferences for future use
      const homeLocation = homeCoordinates
        ? {
            city_id: locationResult.matchedCity.id,
            district: districtToLoad,
            coordinates: homeCoordinates,
          }
        : districtToLoad !== null
        ? {
            city_id: locationResult.matchedCity.id,
            district: districtToLoad,
          }
        : null;
      
      // Mark onboarding complete and save home location
      await updateUserPreferences(
        {
          has_completed_onboarding: true,
          extra: homeLocation ? { home_location: homeLocation } : undefined,
        },
        token
      );
      
      // Navigate to city with district
      onCitySelected(locationResult.matchedCity.id, districtToLoad);
      onComplete();
      onClose();
    } catch (err) {
      console.error("Error saving city:", err);
      setError("Failed to save city. Please try again.");
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

  // Render step indicator
  const renderStepIndicator = () => {
    // Determine steps based on current flow
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
      
      <h1 className={styles.title}>Know your city</h1>
      <p className={styles.subtitle}>
        Find out who represents you and how your neighborhood is really doing.
      </p>
      
      <div className={styles.valuePropsCompact}>
        <div className={styles.valuePropCompact}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>Your representative</span>
        </div>
        <div className={styles.valuePropCompact}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>Crime &amp; safety</span>
        </div>
        <div className={styles.valuePropCompact}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <span>City performance</span>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Location Input Section */}
      <div className={styles.locationSection}>
        <div className={styles.inputGroup} ref={citySearchRef}>
          <div className={styles.inputWithGPS}>
            <input
              type="text"
              className={styles.input}
              placeholder="Enter your city or ZIP code"
              value={locationInput}
              onChange={(e) => handleCityInputChange(e.target.value)}
              onFocus={() => locationInput.length >= 2 && setShowCityDropdown(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddressSubmit();
                }
              }}
              disabled={loading}
            />
            <button
              className={styles.gpsButton}
              onClick={handleGPSLocation}
              disabled={loading}
              title="Use my location"
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
          
          {showCityDropdown && citySearchResults.length > 0 && (
            <div className={styles.dropdown}>
              {citySearchResults.map((city) => (
                <button
                  key={city.id}
                  className={styles.dropdownItem}
                  onClick={() => handleCitySelect(city)}
                >
                  {city.emoji && <span className={styles.cityEmoji}>{city.emoji}</span>}
                  <span>{city.display_name}</span>
                </button>
              ))}
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

  // Render leader step - show representative info
  const renderLeaderStep = () => {
    if (!locationResult) return null;

    const cityDisplayName = locationResult.state
      ? `${locationResult.cityName}, ${locationResult.state}`
      : locationResult.cityName;

    const { mayor, councilMember } = locationResult;

    return (
      <div className={styles.stepContent}>
        <div className={styles.successIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        
        <div className={styles.leadersContainer}>
          {mayor && (
            <div className={styles.leaderCard}>
              <div className={styles.leaderLabel}>Your Mayor</div>
              <div className={styles.leaderName}>{mayor.name}</div>
              <div className={styles.leaderTitle}>{mayor.title}</div>
            </div>
          )}
          
          {councilMember && (
            <div className={styles.leaderCard}>
              <div className={styles.leaderLabel}>Your Representative</div>
              <div className={styles.leaderName}>{councilMember.name}</div>
              <div className={styles.leaderTitle}>{councilMember.title}</div>
              {councilMember.district && (
                <div className={styles.leaderDistrict}>District {councilMember.district}</div>
              )}
            </div>
          )}
          
          {!mayor && !councilMember && (
            <p className={styles.stepDescription}>
              We have data for your city! Explore crime, safety, traffic, and more.
            </p>
          )}
        </div>

        <div className={styles.trackOptions}>
          <label className={styles.trackOption}>
            <input
              type="checkbox"
              checked={trackBoth}
              onChange={(e) => setTrackBoth(e.target.checked)}
            />
            <span className={styles.trackOptionText}>
              <strong>Track both my mayor and representative</strong>
              <span>See data for your district and citywide</span>
            </span>
          </label>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={() => setStep("preferences")}
            disabled={loading}
          >
            Continue
          </button>
          <button className={styles.backButton} onClick={() => setStep("welcome")}>
            Try a different city
          </button>
        </div>
      </div>
    );
  };

  // Handle saving preferences and moving to all-set step
  const handleSavePreferences = async () => {
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      
      if (!locationResult?.matchedCity) {
        setError("City information missing. Please try again.");
        setLoading(false);
        return;
      }
      
      // Save the city
      await saveCity(locationResult.matchedCity.id, token);
      
      // Determine district to load
      const districtToLoad = locationResult.councilMember?.district ?? locationResult.district ?? null;
      
      // Prepare preferences data
      const preferencesData: any = {
        has_completed_onboarding: true,
        extra: {
          communication_preferences: {
            personalized_email: personalizedEmail,
            anomaly_alerts: anomalyAlerts,
            weekly_digest: weeklyDigest,
            monthly_report: monthlyReport,
            report_scope: monthlyReport ? reportScope : null,
            newsletter_description: newsletterDescription || null,
            newsletter_frequency: personalizedEmail ? newsletterFrequency : null,
          },
          category_interests: selectedCategories,
          learning_focus: learningFocus || null,
        },
      };
      
      // Add home location if available
      if (homeCoordinates) {
        preferencesData.extra.home_location = {
          city_id: locationResult.matchedCity.id,
          district: districtToLoad,
          coordinates: homeCoordinates,
        };
      } else if (districtToLoad !== null) {
        preferencesData.extra.home_location = {
          city_id: locationResult.matchedCity.id,
          district: districtToLoad,
        };
      }
      
      // Save preferences
      await updateUserPreferences(preferencesData, token);
      
      // Move to all-set step
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

  // Render preferences step
  const renderPreferencesStep = () => {
    if (!locationResult) return null;

    const commonCategories = [
      "Crime & Safety",
      "Traffic & Transportation",
      "Housing & Development",
      "Budget & Finance",
      "Environment & Sustainability",
      "Public Health",
      "Education",
      "Infrastructure",
    ];

    const toggleCategory = (category: string) => {
      setSelectedCategories((prev) =>
        prev.includes(category)
          ? prev.filter((c) => c !== category)
          : [...prev, category]
      );
    };

    return (
      <div className={styles.stepContent}>
        <h2 className={styles.stepTitle}>Customize your experience</h2>
        <p className={styles.stepDescription}>
          Tell us how you&apos;d like to stay informed about your city.
        </p>

        {/* Communication Preferences */}
        <div className={styles.preferencesSection}>
          <h3 className={styles.sectionTitle}>Communication</h3>
          
          <label className={styles.preferenceOption}>
            <input
              type="checkbox"
              checked={personalizedEmail}
              onChange={(e) => setPersonalizedEmail(e.target.checked)}
            />
            <span className={styles.preferenceOptionText}>
              <strong>Personalized email</strong>
              <span>Custom newsletter tailored to your interests</span>
            </span>
          </label>

          {personalizedEmail && (
            <div className={styles.newsletterCustomization}>
              <label className={styles.textInputLabel}>
                Describe your ideal personalized newsletter
              </label>
              <textarea
                className={styles.newsletterDescriptionInput}
                placeholder="Create a weekly newsletter report for [City] ([District]). Focus on recent changes and trends in key metrics (crime, housing, permits, 311 calls, budget), notable anomalies or significant shifts, comparative analysis (this period vs. previous period, this district vs. city-wide), and actionable insights for residents. The report should be accessible to general public, data-driven with specific numbers and percentages, highlight both positive and concerning trends, and include visualizations where helpful."
                value={newsletterDescription}
                onChange={(e) => setNewsletterDescription(e.target.value)}
                rows={4}
              />
              <div className={styles.frequencySelector}>
                <label className={styles.frequencyLabel}>Frequency:</label>
                <label className={styles.frequencyOption}>
                  <input
                    type="radio"
                    name="newsletterFrequency"
                    checked={newsletterFrequency === "weekly"}
                    onChange={() => setNewsletterFrequency("weekly")}
                  />
                  <span>Weekly</span>
                </label>
                <label className={styles.frequencyOption}>
                  <input
                    type="radio"
                    name="newsletterFrequency"
                    checked={newsletterFrequency === "monthly"}
                    onChange={() => setNewsletterFrequency("monthly")}
                  />
                  <span>Monthly</span>
                </label>
              </div>
            </div>
          )}

          <label className={styles.preferenceOption}>
            <input
              type="checkbox"
              checked={anomalyAlerts}
              onChange={(e) => setAnomalyAlerts(e.target.checked)}
            />
            <span className={styles.preferenceOptionText}>
              <strong>Anomaly alerts</strong>
              <span>Get notified when significant changes are detected</span>
            </span>
          </label>

          <label className={styles.preferenceOption}>
            <input
              type="checkbox"
              checked={monthlyReport}
              onChange={(e) => setMonthlyReport(e.target.checked)}
            />
            <span className={styles.preferenceOptionText}>
              <strong>Monthly report</strong>
              <span>Comprehensive analysis of city performance</span>
            </span>
          </label>
        </div>

        {/* Category Interests - Optional second page */}
        {!showMoreInterests && (
          <div className={styles.preferencesSection}>
            <button
              className={styles.showMoreButton}
              onClick={() => setShowMoreInterests(true)}
            >
              Customize interests (optional)
            </button>
          </div>
        )}

        {showMoreInterests && (
          <div className={styles.preferencesSection}>
            <h3 className={styles.sectionTitle}>What interests you?</h3>
            <p className={styles.sectionDescription}>
              Select categories you&apos;d like to track (optional)
            </p>
            <div className={styles.categoryGrid}>
              {commonCategories.map((category) => (
                <label key={category} className={styles.categoryChip}>
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => toggleCategory(category)}
                  />
                  <span>{category}</span>
                </label>
              ))}
            </div>
            <button
              className={styles.hideMoreButton}
              onClick={() => setShowMoreInterests(false)}
            >
              Hide
            </button>
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={handleSavePreferences}
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

  // Render all-set step
  const renderAllSetStep = () => {
    if (!locationResult) return null;

    const cityDisplayName = locationResult.state
      ? `${locationResult.cityName}, ${locationResult.state}`
      : locationResult.cityName;

    return (
      <div className={styles.stepContent}>
        <div className={styles.successIcon}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        
        <h2 className={styles.stepTitle}>You&apos;re all set!</h2>
        <p className={styles.stepDescription}>
          Thanks for setting up your preferences. We&apos;ll keep you informed about {cityDisplayName}.
        </p>

        <div className={styles.allSetSummary}>
          {personalizedEmail && (
            <div className={styles.summaryItem}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>Personalized {newsletterFrequency} email enabled</span>
            </div>
          )}
          {anomalyAlerts && (
            <div className={styles.summaryItem}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>Anomaly alerts enabled</span>
            </div>
          )}
          {monthlyReport && (
            <div className={styles.summaryItem}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>Monthly report enabled</span>
            </div>
          )}
        </div>

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
        <h2 className={styles.stepTitle}>Coming Soon to {cityDisplayName}</h2>
        <p className={styles.stepDescription}>
          We&apos;re working to bring transparent.city to your area. Be the first to know when we launch!
        </p>

        {error && <div className={styles.error}>{error}</div>}

        {!leadSubmitted ? (
          <>
            <div className={styles.leadBenefits}>
              <p>When we launch in {locationResult.cityName}, you&apos;ll be able to:</p>
              <ul>
                <li>See who represents your neighborhood</li>
                <li>Track crime, safety, and traffic trends</li>
                <li>Get alerts on significant changes</li>
              </ul>
            </div>
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
              <button className={styles.skipButton} onClick={handleFinish}>
                Browse available cities
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
              You&apos;re on the list! We&apos;ll notify you when {cityDisplayName} launches.
            </div>
            <div className={styles.actions}>
              <button className={styles.primaryButton} onClick={handleFinish}>
                Browse available cities
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
    <div className={styles.overlay} onClick={handleSkip}>
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
