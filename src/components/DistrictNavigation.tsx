"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/contexts/ThemeContext";
import type { CityLeader, CityShapefile } from "@/lib/apiClient";
import "./DistrictNavigation.css";

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

function isLikelyDistrictNumber(q: string): boolean {
  const s = q.trim();
  // Match patterns like "District 1", "D1", "1", etc.
  return /^(district\s*)?[0-9]+$/i.test(s);
}

interface DistrictNavigationProps {
  selectedDistrict: number | null;
  leaders: CityLeader[];
  shapefiles: CityShapefile[];
  onDistrictSelect: (district: number | null) => void;
  onGPSLocation?: (location: { lat: number; lng: number } | null) => void;
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
}: DistrictNavigationProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const geoLoadingTimeoutRef = useRef<number | null>(null);

  const trimmed = useMemo(() => query.trim(), [query]);

  // Get current district representative (or mayor for district 0)
  const currentRepresentative = useMemo(() => {
    // Default to district 0 (citywide/mayor) if null
    const district = selectedDistrict === null ? 0 : selectedDistrict;
    
    // For district 0, look for mayor (district 0 or title contains "mayor")
    if (district === 0) {
      return leaders.find((leader) => 
        (leader.district === 0 || leader.district === null) &&
        (leader.title?.toLowerCase().includes("mayor") || 
         leader.name?.toLowerCase().includes("mayor"))
      ) || leaders.find((leader) => leader.district === 0 || leader.district === null) || null;
    }
    
    return leaders.find((leader) => leader.district === district) || null;
  }, [selectedDistrict, leaders]);
  
  // Check if current selection is district 0 (mayor/citywide)
  const isMayor = useMemo(() => {
    const district = selectedDistrict === null ? 0 : selectedDistrict;
    return district === 0;
  }, [selectedDistrict]);

  // Get all districts with representatives for search (including mayor for district 0)
  const districtOptions = useMemo(() => {
    // Find the mayor (district 0) from leaders
    const mayor = leaders.find((leader) => 
      (leader.district === 0 || leader.district === null) &&
      (leader.title?.toLowerCase().includes("mayor") || 
       leader.name?.toLowerCase().includes("mayor"))
    ) || leaders.find((leader) => leader.district === 0 || leader.district === null) || null;
    
    // Build options from all leaders (excluding district 0, we'll add it separately)
    const otherOptions = leaders
      .filter((leader) => leader.district !== null && leader.district !== undefined && leader.district !== 0)
      .map((leader) => ({
        district: leader.district!,
        name: leader.name,
        leader,
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
    setError(null);
    if (geoLoading) {
      setGeoLoading(false);
    }
    if (geoLoadingTimeoutRef.current) {
      window.clearTimeout(geoLoadingTimeoutRef.current);
      geoLoadingTimeoutRef.current = null;
    }
  };

  const handleDistrictSelect = (district: number) => {
    onDistrictSelect(district);
    closeModal();
  };

  const handleGeocodeQuery = async () => {
    const s = trimmed;
    if (!s) return;
    
    setLoading(true);
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
      const lat = parseFloat(geo.lat);
      const lng = parseFloat(geo.lon);
      
      if (isNaN(lat) || isNaN(lng)) {
        throw new Error("Invalid coordinates from geocoding");
      }
      
      // Find district containing this location
      // Prioritize shapefiles that match the primary geographic structure (supervisor districts)
      const districtResult = findDistrictContainingPoint(lat, lng, shapefiles, leaders);
      
      if (districtResult) {
        const districtNum = typeof districtResult.identifier === "number"
          ? districtResult.identifier
          : parseInt(String(districtResult.identifier), 10);
        
        if (!isNaN(districtNum)) {
          handleDistrictSelect(districtNum);
          
          // Notify parent about GPS location for map zooming
          if (onGPSLocation) {
            onGPSLocation({ lat, lng });
          }
          return;
        }
      }
      
      // If no district found, still set GPS location for map zooming
      if (onGPSLocation) {
        onGPSLocation({ lat, lng });
      }
      
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
      
      // Find district containing this location
      // Prioritize shapefiles that match the primary geographic structure (supervisor districts)
      const districtResult = findDistrictContainingPoint(lat, lng, shapefiles, leaders);
      
      if (districtResult) {
        const districtNum = typeof districtResult.identifier === "number"
          ? districtResult.identifier
          : parseInt(String(districtResult.identifier), 10);
        
        if (!isNaN(districtNum)) {
          handleDistrictSelect(districtNum);
          
          // Notify parent about GPS location for map zooming
          if (onGPSLocation) {
            onGPSLocation({ lat, lng });
          }
          return;
        }
      }
      
      // If no district found, still set GPS location for map zooming
      if (onGPSLocation) {
        onGPSLocation({ lat, lng });
      }
      
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

  // Determine display name and label
  const displayName = currentRepresentative
    ? currentRepresentative.name
    : isMayor
    ? "Mayor"
    : selectedDistrict !== null
    ? `District ${selectedDistrict}`
    : "Mayor"; // Default to "Mayor" for citywide view

  const labelText = isMayor ? "Mayor:" : "District Representative:";

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
        <span className="district-navigation-label">{labelText}</span>
        <span className="district-navigation-name">{displayName}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginLeft: "8px", opacity: 0.7 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
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
                <div className="district-navigation-search-box">
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
                  />
                  <button
                    className="district-navigation-search-button"
                    onClick={handleQuerySubmit}
                    disabled={!trimmed || loading}
                  >
                    {loading ? "..." : "Search"}
                  </button>
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
                      </button>
                    ))}
                  </div>
                )}

                {/* All Districts (when no query) */}
                {!trimmed && districtOptions.length > 0 && (
                  <div className="district-navigation-results">
                    <div className="district-navigation-results-header">
                      All Districts:
                    </div>
                    {districtOptions.map((option) => {
                      const isSelected = selectedDistrict === option.district || 
                        (selectedDistrict === null && option.district === 0);
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

