"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { cityKeys } from "@/lib/hooks/useCities";
import { searchPublicCities, type PublicCitySearchResult } from "@/lib/publicApiClient";
import {
  geocodeQuery,
  getCurrentLocation,
  resolveCityFromGeocode,
} from "@/lib/locationSearchUtils";
import {
  saveCity,
  updateUserPreferences,
  getUserPreferences,
  createPlace,
  followRepresentative,
} from "@/lib/apiClient";
import { findDistrictFromCoordinates } from "@/lib/findDistrictFromCoordinates";
import { emitSavedCitiesChanged } from "@/lib/uiEvents";
import LocationMapSave from "@/components/LocationMapSave";
import { DEFAULT_PLACE_RADIUS_M } from "@/lib/mapUtils";
import Loader from "@/components/Loader";
import searchStyles from "./SidebarCitySearch.module.css";

export interface EditHomeLocationModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after home location and My places are updated so parent can refresh. */
  onSaved?: () => void;
}

export default function EditHomeLocationModal({
  open,
  onClose,
  onSaved,
}: EditHomeLocationModalProps) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"search" | "map">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicCitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);

  /** When set, we have city (and optionally coords) for the map step. */
  const [pending, setPending] = useState<{
    city: PublicCitySearchResult;
    coords: { lat: number; lng: number } | null;
    district: number | null;
  } | null>(null);

  const [placeLabel, setPlaceLabel] = useState("My block");
  const [placeRadius, setPlaceRadius] = useState(DEFAULT_PLACE_RADIUS_M);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);

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
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const closeModal = () => {
    setStep("search");
    setQuery("");
    setResults([]);
    setError(null);
    setPending(null);
    setSelectedIndex(-1);
    setPlaceLabel("My block");
    setPlaceRadius(DEFAULT_PLACE_RADIUS_M);
    if (geoLoading) setGeoLoading(false);
    onClose();
  };

  const scheduleSearch = (q: string) => {
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    const t = q.trim();
    if (!t) {
      setResults([]);
      return;
    }
    searchTimeoutRef.current = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await searchPublicCities(t, 10);
        setResults(list);
        setSelectedIndex(-1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleSelectCityOnly = (city: PublicCitySearchResult) => {
    setPending({ city, coords: null, district: null });
    setStep("map");
    setError(null);
  };

  /** Use current location: from search step we resolve city from reverse geocode; from map step we use pending.city. */
  const handleUseCurrentLocation = async () => {
    setGeoLoading(true);
    setError(null);
    try {
      const coords = await getCurrentLocation();
      const token = await getAccessTokenSilently();
      let city: PublicCitySearchResult;
      if (pending?.city && !pending.coords) {
        city = pending.city;
      } else {
        const geo = await import("@/lib/locationSearchUtils").then((m) =>
          m.reverseGeocode(coords.lat, coords.lng)
        );
        const resolved = await resolveCityFromGeocode(geo, (q, limit) =>
          searchPublicCities(q, limit)
        );
        city = resolved.city;
      }
      const district = await findDistrictFromCoordinates(
        coords.lat,
        coords.lng,
        city.id,
        token
      );
      setPending({ city, coords, district });
      if (step === "search") setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get location");
    } finally {
      setGeoLoading(false);
    }
  };

  const handleGeocodeAddress = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const geo = await geocodeQuery(q);
      const { city, coordinates } = await resolveCityFromGeocode(
        geo,
        (query, limit) => searchPublicCities(query, limit)
      );
      if (!coordinates) {
        setError("Could not get coordinates for that address");
        return;
      }
      const token = await getAccessTokenSilently();
      const district = await findDistrictFromCoordinates(
        coordinates.lat,
        coordinates.lng,
        city.id,
        token
      );
      setPending({ city, coords: coordinates, district });
      setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geocoding failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHomeLocation = async (opts: { label: string; radius_m: number }) => {
    if (!pending?.city || !pending.coords) return;
    setSaveLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const cityId = pending.city.id;
      const { lat, lng } = pending.coords;
      const district = pending.district;

      await saveCity(cityId, token);
      if (district !== null && district !== undefined) {
        try {
          await followRepresentative(cityId, String(district), token);
        } catch {
          // ignore if follow fails (e.g. already following)
        }
      }
      await createPlace(token, {
        city_id: cityId,
        label: opts.label.trim() || "My block",
        lat,
        lng,
        radius_m: opts.radius_m,
      });
      const latest = await getUserPreferences(token);
      const currentExtra = latest.extra || {};
      await updateUserPreferences(
        {
          extra: {
            ...currentExtra,
            home_location: {
              city_id: cityId,
              district: district ?? null,
              coordinates: pending.coords,
            },
          },
        },
        token
      );
      emitSavedCitiesChanged();
      queryClient.invalidateQueries({ queryKey: cityKeys.savedDistricts() });
      onSaved?.();
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaveLoading(false);
    }
  };

  if (!open || !mounted) return null;

  const modalContent = (
    <div className={searchStyles.modalOverlay} onClick={closeModal}>
      <div className={searchStyles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={searchStyles.modalHeader}>
          <h2 className={searchStyles.modalTitle}>
            {step === "map" && pending
              ? "Set your home location"
              : "Edit home location"}
          </h2>
          <button
            type="button"
            className={searchStyles.modalClose}
            onClick={closeModal}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {step === "search" && (
          <>
            <div className={searchStyles.modalSearch}>
              <div className={searchStyles.inputWrap}>
                <svg className={searchStyles.leadingIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  ref={inputRef}
                  className={searchStyles.input}
                  value={query}
                  placeholder="City, ZIP code, or address"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    scheduleSearch(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (results.length > 0 && selectedIndex >= 0) {
                        handleSelectCityOnly(results[selectedIndex]);
                      } else {
                        handleGeocodeAddress();
                      }
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className={searchStyles.modalGpsBtn}
                onClick={() => void handleUseCurrentLocation()}
                disabled={geoLoading}
              >
                {geoLoading ? (
                  <Loader size="sm" color="dark" />
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v3" />
                      <path d="M12 19v3" />
                      <path d="M2 12h3" />
                      <path d="M19 12h3" />
                    </svg>
                    <span>Use my location</span>
                  </>
                )}
              </button>
              {error && (
                <div className={searchStyles.resultError}>
                  <span>{error}</span>
                </div>
              )}
              <button
                type="button"
                className={searchStyles.modalGpsBtn}
                onClick={() => void handleGeocodeAddress()}
                disabled={loading || !query.trim()}
              >
                {loading ? "Searching…" : "Search address"}
              </button>
            </div>
            {results.length > 0 && (
              <div style={{ padding: "0 20px 16px" }}>
                {results.map((city, i) => (
                  <button
                    key={city.id}
                    type="button"
                    className={`${searchStyles.resultBtn} ${i === selectedIndex ? searchStyles.resultBtnSelected : ""}`}
                    onClick={() => handleSelectCityOnly(city)}
                  >
                    <div className={searchStyles.resultCityRow}>
                      {city.emoji && <span className={searchStyles.resultEmoji}>{city.emoji}</span>}
                      <span className={searchStyles.resultCityName}>{city.display_name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === "map" && pending && (
          <div style={{ padding: "16px 20px" }}>
            <p style={{ marginBottom: 12, color: "var(--text-secondary)", fontSize: 14 }}>
              {pending.city.emoji && <span style={{ marginRight: 6 }}>{pending.city.emoji}</span>}
              {pending.city.display_name}
              {pending.district != null && (
                <span> · District {pending.district}</span>
              )}
            </p>
            {!pending.coords ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Use current location or search an address to set your home.
                </p>
                <button
                  type="button"
                  className={searchStyles.modalGpsBtn}
                  onClick={() => void handleUseCurrentLocation()}
                  disabled={geoLoading}
                >
                  {geoLoading ? <Loader size="sm" color="dark" /> : "Use my location"}
                </button>
                <div className={searchStyles.inputWrap}>
                  <input
                    className={searchStyles.input}
                    placeholder="Enter your address"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGeocodeAddress()}
                  />
                  <button
                    type="button"
                    className={searchStyles.modalGpsBtn}
                    onClick={() => void handleGeocodeAddress()}
                    disabled={loading || !query.trim()}
                  >
                    Search
                  </button>
                </div>
                <button
                  type="button"
                  className={searchStyles.modalClose}
                  style={{ alignSelf: "flex-start", marginTop: 8 }}
                  onClick={() => {
                    setStep("search");
                    setPending(null);
                  }}
                >
                  ← Back to search
                </button>
              </div>
            ) : (
              <>
                {error && (
                  <div className={searchStyles.resultError} style={{ marginBottom: 12 }}>
                    <span>{error}</span>
                  </div>
                )}
                <LocationMapSave
                  cityId={pending.city.id}
                  lat={pending.coords.lat}
                  lng={pending.coords.lng}
                  valueLabel={placeLabel}
                  valueRadiusM={placeRadius}
                  onLabelChange={setPlaceLabel}
                  onRadiusChange={setPlaceRadius}
                  defaultLabel="My block"
                  defaultRadiusM={DEFAULT_PLACE_RADIUS_M}
                  onSave={handleSaveHomeLocation}
                  saving={saveLoading}
                  saveButtonLabel="Save home location"
                  onCancel={() =>
                    setPending((prev) =>
                      prev ? { ...prev, coords: null, district: null } : null
                    )
                  }
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
