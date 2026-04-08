"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { getSavedCities, unsaveCity, updatePlace, deletePlace, SavedCity, SavedDistrict, prefetchCity } from "@/lib/apiClient";
import { useSavedDistricts } from "@/lib/hooks/useCities";
import { SAVED_CITIES_CHANGED_EVENT } from "@/lib/uiEvents";
import Loader from "./Loader";
import styles from "./SidebarLists.module.css";

interface MyCitiesProps {
  onCityClick?: (cityId: number) => void;
  onDistrictClick?: (cityId: number, district: string) => void;
  /** User's saved places (optional). When set, shown under each city with districts. */
  userPlaces?: Array<{ id: number; city_id: number; label: string }>;
  /** Called when user clicks a saved place: open city with this place selected. */
  onPlaceClick?: (cityId: number, placeId: number) => void;
  /** Currently selected place id (for active state in sidebar). */
  activePlaceId?: number | null;
  /** Called after a place is renamed (so parent can refetch places). */
  onPlaceRenamed?: (placeId: number, newLabel: string) => void;
  /** Called after a place is deleted (so parent can refetch and clear selection). */
  onPlaceDeleted?: (placeId: number) => void;
  activeCityId?: number | null;
  activeDistrict?: string | null;
  /** Whether the section starts expanded (default true). */
  defaultExpanded?: boolean;
}

export default function MyCities({ onCityClick, onDistrictClick, userPlaces = [], onPlaceClick, activePlaceId, onPlaceRenamed, onPlaceDeleted, activeCityId, activeDistrict, defaultExpanded = true }: MyCitiesProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [cities, setCities] = useState<SavedCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [openPlaceMenuId, setOpenPlaceMenuId] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const prefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPrefetchedCityId = useRef<number | null>(null);

  const { data: savedDistricts = [] } = useSavedDistricts();

  const districtsByCityId = savedDistricts
    .filter((d) => d.district !== "0")
    .reduce<Record<number, SavedDistrict[]>>((acc, d) => {
      if (!acc[d.city_id]) acc[d.city_id] = [];
      acc[d.city_id].push(d);
      return acc;
    }, {});

  const placesByCityId = userPlaces.reduce<Record<number, Array<{ id: number; city_id: number; label: string }>>>((acc, p) => {
    if (!acc[p.city_id]) acc[p.city_id] = [];
    acc[p.city_id].push(p);
    return acc;
  }, {});

  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Always load cities on mount so the section renders even when collapsed
    if (!hasLoadedRef.current || expanded) {
      loadCities();
      hasLoadedRef.current = true;
    }

    // Cleanup prefetch timeout on unmount
    return () => {
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current);
      }
    };
  }, [expanded]);

  useEffect(() => {
    const handleSavedCitiesChanged = () => {
      loadCities();
    };

    window.addEventListener(
      SAVED_CITIES_CHANGED_EVENT,
      handleSavedCitiesChanged
    );
    return () => {
      window.removeEventListener(
        SAVED_CITIES_CHANGED_EVENT,
        handleSavedCitiesChanged
      );
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpenMenuId(null);
        setOpenPlaceMenuId(null);
      }
    };

    if (openMenuId !== null || openPlaceMenuId !== null) {
      document.addEventListener("click", handleClickOutside);
      return () => {
        document.removeEventListener("click", handleClickOutside);
      };
    }
  }, [openMenuId, openPlaceMenuId]);

  const loadCities = async () => {
    try {
      setLoading(true);
      const token = await getAccessTokenSilently();
      const savedCities = await getSavedCities(token);
      setCities(savedCities);
    } catch (error) {
      console.error("Error loading saved cities:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCityClick = (cityId: number) => {
    if (onCityClick) {
      onCityClick(cityId);
    }
  };

  const handleCityHover = (cityId: number) => {
    // Debounce prefetch to avoid excessive requests
    // Only prefetch if different city and after a short delay
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current);
    }

    // Skip if we just prefetched this city
    if (lastPrefetchedCityId.current === cityId) {
      return;
    }

    prefetchTimeoutRef.current = setTimeout(async () => {
      try {
        const token = await getAccessTokenSilently();
        prefetchCity(cityId, token);
        lastPrefetchedCityId.current = cityId;
      } catch (error) {
        // Silently fail on prefetch errors
      }
    }, 300); // 300ms debounce
  };

  const handleMenuToggle = (event: React.MouseEvent, cityId: number) => {
    event.stopPropagation();
    setOpenMenuId(openMenuId === cityId ? null : cityId);
  };

  const handleUnsaveCity = async (
    event: React.MouseEvent,
    cityId: number,
    cityName: string
  ) => {
    event.stopPropagation();
    setOpenMenuId(null);

    if (!confirm(`Remove ${cityName} from My Places?`)) {
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      await unsaveCity(cityId, token);
      // Remove city from local state
      setCities((prev) => prev.filter((city) => city.id !== cityId));
    } catch (error) {
      console.error("Error removing saved city:", error);
      alert("Failed to remove city. Please try again.");
    }
  };

  const handlePlaceMenuToggle = (event: React.MouseEvent, placeId: number) => {
    event.stopPropagation();
    setOpenPlaceMenuId((prev) => (prev === placeId ? null : placeId));
  };

  const handleRenamePlace = async (
    event: React.MouseEvent,
    place: { id: number; city_id: number; label: string }
  ) => {
    event.stopPropagation();
    setOpenPlaceMenuId(null);
    const newLabel = prompt("Rename place", place.label);
    if (newLabel == null || newLabel.trim() === "" || newLabel.trim() === place.label) {
      return;
    }
    try {
      const token = await getAccessTokenSilently();
      await updatePlace(place.id, token, { label: newLabel.trim() });
      onPlaceRenamed?.(place.id, newLabel.trim());
    } catch (error) {
      console.error("Error renaming place:", error);
      alert("Failed to rename place. Please try again.");
    }
  };

  const handleDeletePlace = async (
    event: React.MouseEvent,
    place: { id: number; city_id: number; label: string }
  ) => {
    event.stopPropagation();
    setOpenPlaceMenuId(null);
    if (!confirm(`Remove "${place.label}" from your saved places?`)) {
      return;
    }
    try {
      const token = await getAccessTokenSilently();
      await deletePlace(place.id, token);
      onPlaceDeleted?.(place.id);
    } catch (error) {
      console.error("Error removing place:", error);
      alert("Failed to remove place. Please try again.");
    }
  };

  // Don't render if no cities
  if (!loading && cities.length === 0) {
    return null;
  }

  return (
    <div ref={rootRef} id="my-cities-section" style={{ display: "block" }}>
      <div
        className={`${styles.sectionHeader} ${styles.sectionCollapsible}` }
        id="my-cities-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span>My Places</span>
        <span id="my-cities-chevron" className={styles.sectionChevron}>
          {expanded ? "▼" : "▶"}
        </span>
      </div>
      {expanded && (
        <div id="my-cities-list">
          {loading ? (
            <div className={styles.emptyState} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
              <Loader size="sm" color="dark" />
              <span>Loading cities...</span>
            </div>
          ) : cities.length === 0 ? (
            <div className={styles.emptyState}>No saved cities</div>
          ) : (
            cities.map((city) => {
              const cityDistricts = districtsByCityId[city.id] || [];
              return (
                <div key={city.id}>
                  <div
                    className={styles.itemRow}
                    data-city-id={city.id}
                  >
                    <button
                      type="button"
                      className={`${styles.item} ${styles.itemButton} ${activeCityId === city.id && !activeDistrict && !activePlaceId ? styles.itemActive : ""}`}
                      onMouseEnter={() => handleCityHover(city.id)}
                      onClick={() => handleCityClick(city.id)}
                      aria-label={`Select city ${city.display_name}`}
                    >
                      <div className={styles.content}>
                        <div className={styles.myCitiesItemWrapper}>
                          {city.emoji && (
                            <span className={styles.myCitiesEmoji}>{city.emoji}</span>
                          )}
                        <div className={styles.myCitiesName}>{city.display_name}</div>
                      </div>
                    </div>
                    </button>
                    <button
                      className={styles.menuBtn}
                      onClick={(e) => handleMenuToggle(e, city.id)}
                      title="Options"
                    >
                      ⋮
                    </button>
                    <div
                      ref={(el) => {
                        menuRefs.current[city.id] = el;
                      }}
                      className={`${styles.menu} ${openMenuId === city.id ? styles.menuShow : ""}`}
                      id={`city-menu-${city.id}`}
                    >
                      <div
                        className={`${styles.menuItem} ${styles.menuItemDelete}`}
                        onClick={(e) =>
                          handleUnsaveCity(e, city.id, city.display_name)
                        }
                      >
                        🗑️ Remove from My Places
                      </div>
                    </div>
                  </div>
                  {cityDistricts.length > 0 && (
                    <div className={styles.districtSubList}>
                      {cityDistricts.map((d) => {
                        const isDistrictActive =
                          activeCityId === d.city_id && String(activeDistrict) === d.district;
                        return (
                          <button
                            type="button"
                            key={`${d.city_id}-${d.district}`}
                            className={`${styles.districtSubItem} ${isDistrictActive ? styles.districtSubItemActive : ""}`}
                            onClick={() => onDistrictClick?.(d.city_id, d.district)}
                            aria-label={`Select District ${d.district}, ${d.display_name}`}
                            aria-current={isDistrictActive ? "true" : undefined}
                          >
                            <span className={styles.districtNumber}>D{d.district}</span>
                            <span className={styles.districtName}>{d.display_name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {(placesByCityId[city.id]?.length ?? 0) > 0 && (
                    <div className={styles.placeSubList}>
                      {placesByCityId[city.id].map((place) => {
                        const isPlaceActive = activeCityId === city.id && activePlaceId === place.id;
                        return (
                          <div
                            key={`place-${place.id}`}
                            className={styles.placeSubItemRow}
                            data-place-id={place.id}
                          >
                            <button
                              type="button"
                              className={`${styles.placeSubItem} ${isPlaceActive ? styles.placeSubItemActive : ""}`}
                              onClick={() => onPlaceClick?.(city.id, place.id)}
                              aria-label={`Select place ${place.label}`}
                              aria-current={isPlaceActive ? "true" : undefined}
                            >
                              <span className={styles.placeSubItemIcon} aria-hidden title="Saved place">
                                <svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Place">
                                  <path d="M6 0C2.686 0 0 2.686 0 6c0 4.5 6 8 6 8s6-3.5 6-8c0-3.314-2.686-6-6-6zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="currentColor" />
                                </svg>
                              </span>
                              <span className={styles.placeSubItemLabel}>{place.label}</span>
                            </button>
                            <button
                              type="button"
                              className={styles.placeMenuBtn}
                              onClick={(e) => handlePlaceMenuToggle(e, place.id)}
                              title="Place options"
                              aria-label={`Options for ${place.label}`}
                            >
                              ⋮
                            </button>
                            <div
                              className={`${styles.menu} ${styles.placeMenu} ${openPlaceMenuId === place.id ? styles.menuShow : ""}`}
                              id={`place-menu-${place.id}`}
                            >
                              <div
                                className={styles.menuItem}
                                onClick={(e) => handleRenamePlace(e, place)}
                              >
                                Rename
                              </div>
                              <div
                                className={`${styles.menuItem} ${styles.menuItemDelete}`}
                                onClick={(e) => handleDeletePlace(e, place)}
                              >
                                Remove place
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}


