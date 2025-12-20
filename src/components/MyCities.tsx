"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { getSavedCities, unsaveCity, SavedCity, prefetchCity } from "@/lib/apiClient";
import { SAVED_CITIES_CHANGED_EVENT } from "@/lib/uiEvents";
import Loader from "./Loader";
import styles from "./SidebarLists.module.css";

interface MyCitiesProps {
  onCityClick?: (cityId: number) => void;
  activeCityId?: number | null;
}

export default function MyCities({ onCityClick, activeCityId }: MyCitiesProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [cities, setCities] = useState<SavedCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const prefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPrefetchedCityId = useRef<number | null>(null);

  useEffect(() => {
    loadCities();
    
    // Cleanup prefetch timeout on unmount
    return () => {
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current);
      }
    };
  }, []);

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
      }
    };

    if (openMenuId !== null) {
      document.addEventListener("click", handleClickOutside);
      return () => {
        document.removeEventListener("click", handleClickOutside);
      };
    }
  }, [openMenuId]);

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

    if (!confirm(`Remove ${cityName} from My Cities?`)) {
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
        <span>My Cities</span>
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
            cities.map((city) => (
              <div
                key={city.id}
                className={`${styles.item} ${activeCityId === city.id ? styles.itemActive : ""}` }
                data-city-id={city.id}
                onMouseEnter={() => handleCityHover(city.id)}
                onClick={() => handleCityClick(city.id)}
              >
                <div className={styles.content}>
                  <div className={styles.myCitiesItemWrapper}>
                    {city.emoji && (
                      <span className={styles.myCitiesEmoji}>{city.emoji}</span>
                    )}
                    <div className={styles.myCitiesName}>{city.display_name}</div>
                  </div>
                </div>
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
                  className={`${styles.menu} ${openMenuId === city.id ? styles.menuShow : ""}` }
                  id={`city-menu-${city.id}`}
                >
                  <div
                    className={`${styles.menuItem} ${styles.menuItemDelete}` }
                    onClick={(e) =>
                      handleUnsaveCity(e, city.id, city.display_name)
                    }
                  >
                    🗑️ Remove from My Cities
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}


