"use client";

import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useTheme } from "@/contexts/ThemeContext";
import type { CityLeader, CityShapefile } from "@/lib/apiClient";
import { createPlace, type UserPlace } from "@/lib/apiClient";
import {
  isLikelyZipcode,
  isLikelyAddress,
  geocodeQuery,
  fetchAddressSuggestions,
  type AddressSuggestion,
  type GeocodeResult,
} from "@/lib/locationSearchUtils";
import LocationMapSave from "@/components/LocationMapSave";
import { DEFAULT_PLACE_RADIUS_M } from "@/lib/mapUtils";
import "./DistrictNavigation.css";

function normalizeDistrictValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function isLikelyDistrictNumber(q: string): boolean {
  const s = q.trim();
  // Match patterns like "District 1", "D1", "1", etc.
  return /^(district\s*)?[0-9]+$/i.test(s);
}

/** User-saved place for "My block" scope */
export interface UserPlaceForSelector {
  id: number;
  label: string;
  city_id: number;
}

interface DistrictNavigationProps {
  selectedDistrict: number | null;
  leaders: CityLeader[];
  shapefiles: CityShapefile[];
  onDistrictSelect: (district: number | null) => void;
  onGPSLocation?: (location: { lat: number; lng: number } | null) => void;
  /** Follower/subscriber counts per district; key = district as string ("0"=mayor, "1"-"11"=districts). */
  leaderFollowerCounts?: Record<string, number>;
  /** City ID for Follow button and follow API. If omitted, Follow is hidden. */
  cityId?: number | null;
  /** Public page path (e.g. `/c/san-francisco`) for the Share button. If omitted, Share is hidden. */
  publicPagePath?: string | null;
  /** When false, defers fetching follow state until e.g. city has loaded (improves slow-connection UX). */
  newsletterQueriesEnabled?: boolean;
  /** User's saved places for this city (enables "My block" in selector). */
  userPlaces?: UserPlaceForSelector[];
  /** Currently selected place ID when in "My block" scope. */
  selectedPlaceId?: number | null;
  /** Called when user selects a place (clears district). Call onDistrictSelect(null) when selecting a place. */
  onPlaceSelect?: (placeId: number | null) => void;
  /** Called after user saves a new place from this dialog; parent should refetch user places. */
  onPlaceSaved?: (place: UserPlace) => void;
  /** When this value changes and is > 0, open the modal (e.g. from Search Cities "Find your district"). */
  openTrigger?: number;
  /** When the batch place-refresh job last ran (ISO string); shown next to place name. */
  placeRefreshLastRunAt?: string | null;
}

// Helper function to check if a point is inside a polygon
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

// Find which district contains a GPS point
// Prioritizes shapefiles that match the primary geographic structure (used by leaders)
function findDistrictContainingPoint(
  lat: number,
  lng: number,
  shapefiles: CityShapefile[],
  leaders?: CityLeader[]
): { shapefile: CityShapefile; feature: any; identifier: string | number } | null {
  const point: [number, number] = [lng, lat];
  
  // Find the primary geographic structure (the one used by most leaders)
  let primaryGeographicStructureId: number | null = null;
  
  if (leaders && leaders.length > 0) {
    // Count which geographic_structure_id is used by most leaders
    const structureIdCounts = new Map<number, number>();
    leaders.forEach((leader) => {
      if (leader.geographic_structure_id) {
        const count = structureIdCounts.get(leader.geographic_structure_id) || 0;
        structureIdCounts.set(leader.geographic_structure_id, count + 1);
      }
    });
    
    // Find the most common geographic_structure_id
    let maxCount = 0;
    structureIdCounts.forEach((count, structureId) => {
      if (count > maxCount) {
        maxCount = count;
        primaryGeographicStructureId = structureId;
      }
    });
  }
  
  // Separate shapefiles into primary (matching primary structure) and others
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
    let geometryData = shapefile.geometry_data;
    
    // Handle case where geometry_data might be a string
    if (typeof geometryData === 'string') {
      try {
        geometryData = JSON.parse(geometryData);
      } catch (e) {
        console.error("Failed to parse geometry_data as JSON:", e);
        continue;
      }
    }
    
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
          const identifier = feature.properties?.[shapefile.identifier_field || ""] || "Unknown";
          return { shapefile, feature, identifier };
        }
      }
    }
  }
  
  return null;
}

export default function DistrictNavigation({
  selectedDistrict,
  leaders,
  shapefiles,
  onDistrictSelect,
  onGPSLocation,
  leaderFollowerCounts,
  cityId,
  publicPagePath,
  newsletterQueriesEnabled = true,
  userPlaces = [],
  selectedPlaceId = null,
  onPlaceSelect,
  onPlaceSaved,
  openTrigger,
  placeRefreshLastRunAt,
}: DistrictNavigationProps) {
  const normalizedSelectedDistrict = useMemo(() => {
    const normalized = normalizeDistrictValue(selectedDistrict);
    return normalized ?? 0;
  }, [selectedDistrict]);
  const district = normalizedSelectedDistrict;
  const isPlaceScope = selectedPlaceId != null && selectedPlaceId > 0;
  const selectedPlace = userPlaces.find((p) => p.id === selectedPlaceId);
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  /** Point resolved from address/zip geocode or GPS; show map + save when set. */
  const [pendingPoint, setPendingPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [saveBlockLoading, setSaveBlockLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const shareFeedbackRef = useRef<number | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const geoLoadingTimeoutRef = useRef<number | null>(null);
  const addressSuggestTimeoutRef = useRef<number | null>(null);
  const addressSuggestContainerRef = useRef<HTMLDivElement | null>(null);

  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSuggestionsLoading, setAddressSuggestionsLoading] = useState(false);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);

  const trimmed = useMemo(() => query.trim(), [query]);

  // Get current district representative (or mayor for district 0)
  const currentRepresentative = useMemo(() => {
    // For district 0, look for mayor (district 0 or title contains "mayor")
    if (district === 0) {
      return leaders.find((leader) => 
        ((normalizeDistrictValue(leader.district) ?? 0) === 0) &&
        (leader.title?.toLowerCase().includes("mayor") || 
         leader.name?.toLowerCase().includes("mayor"))
      ) || leaders.find((leader) => (normalizeDistrictValue(leader.district) ?? 0) === 0) || null;
    }
    
    return leaders.find((leader) => normalizeDistrictValue(leader.district) === district) || null;
  }, [district, leaders]);
  
  // Check if current selection is district 0 (mayor/citywide)
  const isMayor = useMemo(() => {
    return district === 0;
  }, [district]);

  // Get all districts with representatives for search (including mayor for district 0)
  const districtOptions = useMemo(() => {
    // Find the mayor (district 0) from leaders
    const mayor = leaders.find((leader) => 
      ((normalizeDistrictValue(leader.district) ?? 0) === 0) &&
      (leader.title?.toLowerCase().includes("mayor") || 
       leader.name?.toLowerCase().includes("mayor"))
    ) || leaders.find((leader) => (normalizeDistrictValue(leader.district) ?? 0) === 0) || null;
    
    // Build options from all leaders (excluding district 0, we'll add it separately)
    const otherOptions = leaders
      .map((leader) => ({
        leader,
        district: normalizeDistrictValue(leader.district),
      }))
      .filter(
        (item): item is { leader: CityLeader; district: number } =>
          item.district !== null && item.district !== 0,
      )
      .map((leader) => ({
        district: leader.district,
        name: leader.leader.name,
        leader: leader.leader,
        isMayor: false,
      }))
      .sort((a, b) => a.district - b.district);
    
    // Always include district 0 (citywide/mayor) as the first entry
    const citywideOption = {
      district: 0,
      name: mayor?.name || "Mayor",
      leader: mayor || null,
      isMayor: true,
    };
    
    // Return citywide first, then all other districts
    return [citywideOption, ...otherOptions];
  }, [leaders]);

  // Filter districts based on query
  const filteredDistricts = useMemo(() => {
    if (!trimmed) return districtOptions;
    
    const lowerQuery = trimmed.toLowerCase();
    const filtered = districtOptions.filter(
      (option) =>
        option.name.toLowerCase().includes(lowerQuery) ||
        String(option.district).includes(trimmed) ||
        `district ${option.district}`.toLowerCase().includes(lowerQuery) ||
        `d${option.district}`.toLowerCase().includes(lowerQuery) ||
        (option.district === 0 && (
          "citywide".includes(lowerQuery) ||
          "mayor".includes(lowerQuery)
        ))
    );
    
    // Ensure citywide (district 0) is always first in filtered results
    const citywide = filtered.find(opt => opt.district === 0);
    const others = filtered.filter(opt => opt.district !== 0);
    
    return citywide ? [citywide, ...others] : filtered;
  }, [trimmed, districtOptions]);

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
      if (shareFeedbackRef.current) window.clearTimeout(shareFeedbackRef.current);
    };
  }, []);

  useEffect(() => {
    if (openTrigger != null && openTrigger > 0) setOpen(true);
  }, [openTrigger]);

  const handleShare = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!publicPagePath || typeof window === "undefined") return;
    const url = window.location.origin + publicPagePath;
    const title = "View on Transparent.city";
    if (navigator.share) {
      navigator
        .share({ url, title })
        .then(() => {
          setShareFeedback("Shared");
          if (shareFeedbackRef.current) window.clearTimeout(shareFeedbackRef.current);
          shareFeedbackRef.current = window.setTimeout(() => {
            setShareFeedback(null);
            shareFeedbackRef.current = null;
          }, 1500);
        })
        .catch(() => {
          copyAndFeedback(url);
        });
    } else {
      copyAndFeedback(url);
    }
  };

  function copyAndFeedback(url: string) {
    navigator.clipboard.writeText(url).then(
      () => {
        setShareFeedback("Link copied!");
        if (shareFeedbackRef.current) window.clearTimeout(shareFeedbackRef.current);
        shareFeedbackRef.current = window.setTimeout(() => {
          setShareFeedback(null);
          shareFeedbackRef.current = null;
        }, 1500);
      },
      () => { setShareFeedback(""); }
    );
  }

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

  // Address suggest: run when modal is open and query changes
  useEffect(() => {
    if (!open) {
      setAddressSuggestions([]);
      setShowAddressDropdown(false);
      return () => {
        if (addressSuggestTimeoutRef.current) {
          window.clearTimeout(addressSuggestTimeoutRef.current);
        }
      };
    }
    scheduleAddressSuggest(query);
    return () => {
      if (addressSuggestTimeoutRef.current) {
        window.clearTimeout(addressSuggestTimeoutRef.current);
      }
    };
  }, [open, query]);

  // Close address dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        addressSuggestContainerRef.current &&
        !addressSuggestContainerRef.current.contains(e.target as Node)
      ) {
        setShowAddressDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const closeModal = () => {
    setOpen(false);
    setQuery("");
    setError(null);
    setPendingPoint(null);
    setAddressSuggestions([]);
    setShowAddressDropdown(false);
    if (geoLoading) {
      setGeoLoading(false);
    }
    if (geoLoadingTimeoutRef.current) {
      window.clearTimeout(geoLoadingTimeoutRef.current);
      geoLoadingTimeoutRef.current = null;
    }
    if (addressSuggestTimeoutRef.current) {
      window.clearTimeout(addressSuggestTimeoutRef.current);
      addressSuggestTimeoutRef.current = null;
    }
  };

  const scheduleAddressSuggest = (q: string) => {
    if (addressSuggestTimeoutRef.current) {
      window.clearTimeout(addressSuggestTimeoutRef.current);
    }
    const s = q.trim();
    if (s.length < 2) {
      setAddressSuggestions([]);
      setAddressSuggestionsLoading(false);
      setShowAddressDropdown(false);
      return;
    }
    setShowAddressDropdown(true);
    setAddressSuggestionsLoading(true);
    addressSuggestTimeoutRef.current = window.setTimeout(async () => {
      const list = await fetchAddressSuggestions(s);
      setAddressSuggestions(list);
      setAddressSuggestionsLoading(false);
    }, 300);
  };

  const handleAddressSuggestionSelect = (suggestion: AddressSuggestion) => {
    setShowAddressDropdown(false);
    setAddressSuggestions([]);
    setError(null);
    setPendingPoint({ lat: suggestion.lat, lng: suggestion.lon });

    const districtResult = findDistrictContainingPoint(
      suggestion.lat,
      suggestion.lon,
      shapefiles,
      leaders
    );

    if (districtResult) {
      const districtNum =
        typeof districtResult.identifier === "number"
          ? districtResult.identifier
          : parseInt(String(districtResult.identifier), 10);

      if (!isNaN(districtNum)) {
        onDistrictSelect(districtNum);
        onPlaceSelect?.(null);
        if (onGPSLocation) onGPSLocation({ lat: suggestion.lat, lng: suggestion.lon });
        closeModal();
        return;
      }
    }

    if (onGPSLocation) onGPSLocation({ lat: suggestion.lat, lng: suggestion.lon });
    setError("Location found but not within any known district");
  };

  const handleDistrictSelect = (district: number | string) => {
    const normalizedDistrict = normalizeDistrictValue(district);
    if (normalizedDistrict === null) {
      setError("Invalid district selection");
      return;
    }
    onDistrictSelect(normalizedDistrict);
    onPlaceSelect?.(null);
    closeModal();
  };

  const handlePlaceSelect = (placeId: number | null) => {
    onPlaceSelect?.(placeId);
    // Do not call onDistrictSelect(null) here: parent's onPlaceSelect already sets
    // selectedPlaceId and selectedDistrict=null; calling onDistrictSelect(null) would
    // trigger parent's onDistrictChange which clears selectedPlaceId.
    closeModal();
  };

  const handleSavePlace = async (opts: { label: string; radius_m: number }) => {
    if (!pendingPoint || cityId == null || !isAuthenticated) return;
    setError(null);
    setSaveBlockLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const place = await createPlace(token, {
        city_id: cityId,
        label: opts.label.trim() || "My Block",
        lat: pendingPoint.lat,
        lng: pendingPoint.lng,
        radius_m: opts.radius_m,
      });
      onPlaceSaved?.(place);
      setPendingPoint(null);
      onPlaceSelect?.(place.id);
      // Do not call onDistrictSelect(null): parent's onPlaceSelect already sets district to null
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save place");
    } finally {
      setSaveBlockLoading(false);
    }
  };

  const handleGeocodeQuery = async () => {
    const s = trimmed;
    if (!s) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Use the shared geocodeQuery utility which handles zipcode formatting internally
      const geo = await geocodeQuery(s);
      const lat = parseFloat(geo.lat);
      const lng = parseFloat(geo.lon);
      
      if (isNaN(lat) || isNaN(lng)) {
        throw new Error("Invalid coordinates from geocoding");
      }

      setPendingPoint({ lat, lng });

      // Find district containing this location
      const districtResult = findDistrictContainingPoint(lat, lng, shapefiles, leaders);

      if (districtResult) {
        const districtNum = typeof districtResult.identifier === "number"
          ? districtResult.identifier
          : parseInt(String(districtResult.identifier), 10);

        if (!isNaN(districtNum)) {
          onDistrictSelect(districtNum);
          onPlaceSelect?.(null);
          if (onGPSLocation) onGPSLocation({ lat, lng });
          return;
        }
      }

      if (onGPSLocation) onGPSLocation({ lat, lng });
      setError("Location found but not within any known district");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geocoding failed");
    } finally {
      setLoading(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation isn't available in this browser.");
      return;
    }

    setGeoLoading(true);
    setError(null);
    
    // Set timeout for GPS request
    geoLoadingTimeoutRef.current = window.setTimeout(() => {
      if (geoLoading) {
        setGeoLoading(false);
        setError("GPS request timed out. Please try again.");
      }
    }, 12000);

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 30000,
        });
      });

      // Clear timeout since we got a response
      if (geoLoadingTimeoutRef.current) {
        window.clearTimeout(geoLoadingTimeoutRef.current);
        geoLoadingTimeoutRef.current = null;
      }

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      setPendingPoint({ lat, lng });

      const districtResult = findDistrictContainingPoint(lat, lng, shapefiles, leaders);

      if (districtResult) {
        const districtNum = typeof districtResult.identifier === "number"
          ? districtResult.identifier
          : parseInt(String(districtResult.identifier), 10);

        if (!isNaN(districtNum)) {
          onDistrictSelect(districtNum);
          onPlaceSelect?.(null);
          if (onGPSLocation) onGPSLocation({ lat, lng });
          return;
        }
      }

      if (onGPSLocation) onGPSLocation({ lat, lng });
      setError("Your location is not within any known district");
    } catch (e) {
      console.error("GPS location error:", e);
      if (geoLoadingTimeoutRef.current) {
        window.clearTimeout(geoLoadingTimeoutRef.current);
        geoLoadingTimeoutRef.current = null;
      }
      setError(e instanceof Error ? e.message : "Failed to use current location.");
    } finally {
      setGeoLoading(false);
    }
  };

  const handleQuerySubmit = () => {
    if (!trimmed) return;
    
    // Check if it's a district number
    if (isLikelyDistrictNumber(trimmed)) {
      const districtMatch = trimmed.match(/(\d+)/);
      if (districtMatch) {
        const districtNum = parseInt(districtMatch[1], 10);
        const found = districtOptions.find((opt) => opt.district === districtNum);
        if (found) {
          handleDistrictSelect(districtNum);
          return;
        }
        setError(`District ${districtNum} not found`);
        return;
      }
    }
    
    // Check if it's an address or zipcode
    if (isLikelyZipcode(trimmed) || isLikelyAddress(trimmed)) {
      handleGeocodeQuery();
      return;
    }
    
    // Check if it matches a representative name
    const matchingDistrict = filteredDistricts.find(
      (opt) => opt.name.toLowerCase() === trimmed.toLowerCase()
    );
    
    if (matchingDistrict) {
      handleDistrictSelect(matchingDistrict.district);
      return;
    }
    
    // If multiple matches, show error
    if (filteredDistricts.length > 1) {
      setError("Multiple districts match. Please be more specific.");
      return;
    }
    
    // If single match, select it
    if (filteredDistricts.length === 1) {
      handleDistrictSelect(filteredDistricts[0].district);
      return;
    }
    
    // Try geocoding as fallback
    handleGeocodeQuery();
  };

  if (!mounted) return null;

  // Determine display name and label (place scope overrides district)
  // When place is selected but selectedPlace not yet loaded (userPlaces still fetching), show "My block" to avoid flashing "Citywide"
  const displayName = isPlaceScope
    ? (selectedPlace ? selectedPlace.label : "My Block")
    : currentRepresentative
    ? currentRepresentative.name
    : isMayor
    ? "Mayor"
    : district > 0
    ? `District ${district}`
    : "Mayor";
  const labelText = isPlaceScope ? "My block:" : isMayor ? "Mayor:" : "District Representative:";

  return (
    <>
      {/* District Header - Clickable */}
      <div
        className="district-navigation-header"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-label="Select district"
      >
        <div className="district-navigation-content">
          <div className="district-navigation-title-row">
            <span className="district-navigation-label">{labelText}</span>
            <span className="district-navigation-name">{displayName}</span>
            {isPlaceScope && placeRefreshLastRunAt && (
              <span className="district-navigation-refresh">
                (refreshed {new Date(placeRefreshLastRunAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })})
              </span>
            )}
          </div>
        </div>
        <div className="district-navigation-actions">
          {publicPagePath != null && (
            <button
              type="button"
              className="district-navigation-share"
              onClick={handleShare}
              aria-label="Share public page"
            >
              {shareFeedback ? shareFeedback : (
                <>
                  <span className="district-navigation-share-text">Share</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </>
              )}
            </button>
          )}
          <svg
            className="district-navigation-chevron"
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
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Search Modal */}
      {open &&
        createPortal(
          <div
            className="district-navigation-modal-backdrop"
            onClick={closeModal}
          >
            <div
              className="district-navigation-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="district-navigation-modal-header">
                <h2>Find Your District</h2>
                <button
                  className="district-navigation-modal-close"
                  onClick={closeModal}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="district-navigation-modal-body">
                <div
                  className="district-navigation-search-box"
                  ref={addressSuggestContainerRef}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleQuerySubmit();
                      }
                    }}
                    placeholder="Search by address, zipcode, district number, or representative name..."
                    className="district-navigation-input"
                    autoComplete="off"
                  />
                  <button
                    className="district-navigation-search-button"
                    onClick={handleQuerySubmit}
                    disabled={!trimmed || loading}
                  >
                    {loading ? "..." : "Search"}
                  </button>
                  {showAddressDropdown && (addressSuggestions.length > 0 || addressSuggestionsLoading) && (
                    <div className="district-navigation-address-dropdown" role="listbox">
                      {addressSuggestionsLoading ? (
                        <div className="district-navigation-address-item" style={{ color: "var(--text-secondary, #6b7280)" }}>
                          Searching addresses…
                        </div>
                      ) : (
                        addressSuggestions.map((suggestion, idx) => (
                          <button
                            key={`${suggestion.place_name}-${idx}`}
                            type="button"
                            className="district-navigation-address-item"
                            role="option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleAddressSuggestionSelect(suggestion)}
                          >
                            {suggestion.place_name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* GPS Button */}
                <button
                  className="district-navigation-gps-button"
                  onClick={handleUseCurrentLocation}
                  disabled={geoLoading}
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
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  {geoLoading ? "Locating..." : "Use Current Location"}
                </button>

                {/* Error Message */}
                {error && (
                  <div className="district-navigation-error">{error}</div>
                )}

                {/* Same map + save experience as onboarding and sidebar */}
                {pendingPoint !== null && isAuthenticated && cityId != null && (
                  <LocationMapSave
                    cityId={cityId}
                    lat={pendingPoint.lat}
                    lng={pendingPoint.lng}
                    defaultRadiusM={DEFAULT_PLACE_RADIUS_M}
                    onSave={handleSavePlace}
                    saving={saveBlockLoading}
                    saveButtonLabel="Save as my block"
                    onCancel={() => setPendingPoint(null)}
                    className="district-navigation-location-map-save"
                  />
                )}

                {/* District List */}
                {trimmed && filteredDistricts.length > 0 && (
                  <div className="district-navigation-results">
                    <div className="district-navigation-results-header">
                      Matching Districts:
                    </div>
                    {filteredDistricts.map((option) => (
                      <button
                        key={option.district}
                        className="district-navigation-result-item"
                        onClick={() => handleDistrictSelect(option.district)}
                      >
                        <div className="district-navigation-result-name">
                          {option.name}
                        </div>
                        <div className="district-navigation-result-district">
                          {option.district === 0 ? "Mayor (Citywide)" : `District ${option.district}`}
                        </div>
                        {leaderFollowerCounts != null && (leaderFollowerCounts[String(option.district)] ?? 0) > 0 && (
                            <div className="district-navigation-result-subscribers">
                              {leaderFollowerCounts[String(option.district)]}
                            </div>
                          )}
                      </button>
                    ))}
                  </div>
                )}

                {/* My block (user places) – shown first */}
                {!trimmed && userPlaces.length > 0 && (
                  <div className="district-navigation-results">
                    <div className="district-navigation-results-header">
                      My block:
                      {placeRefreshLastRunAt && (
                        <span className="district-navigation-results-refresh">
                          {" "}Last refreshed {new Date(placeRefreshLastRunAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      )}
                    </div>
                    {userPlaces.map((place) => {
                      const isSelected = selectedPlaceId === place.id;
                      return (
                        <button
                          key={place.id}
                          className={`district-navigation-result-item ${isSelected ? "selected" : ""}`}
                          onClick={() => handlePlaceSelect(place.id)}
                        >
                          <div className="district-navigation-result-name">
                            {place.label}
                          </div>
                          <div className="district-navigation-result-district">
                            Block
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* All Districts (when no query) */}
                {!trimmed && districtOptions.length > 0 && (
                  <div className="district-navigation-results">
                    <div className="district-navigation-results-header">
                      All Districts:
                    </div>
                    {districtOptions.map((option) => {
                      const isSelected =
                        !isPlaceScope && normalizedSelectedDistrict === option.district;
                      return (
                        <button
                          key={option.district}
                          className={`district-navigation-result-item ${
                            isSelected ? "selected" : ""
                          }`}
                          onClick={() => handleDistrictSelect(option.district)}
                        >
                          <div className="district-navigation-result-name">
                            {option.name}
                          </div>
                          <div className="district-navigation-result-district">
                            {option.district === 0 ? "Mayor (Citywide)" : `District ${option.district}`}
                          </div>
                          {leaderFollowerCounts != null && (leaderFollowerCounts[String(option.district)] ?? 0) > 0 && (
                              <div className="district-navigation-result-subscribers">
                                {leaderFollowerCounts[String(option.district)]}
                              </div>
                            )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

