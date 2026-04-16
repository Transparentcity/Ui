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
  listMyPlaces,
  createPlace,
  followRepresentative,
  runPlaceMetricsAndAnomaliesAsJob,
  type UserPlace,
} from "@/lib/apiClient";
import { findDistrictFromCoordinates } from "@/lib/findDistrictFromCoordinates";
import { emitSavedCitiesChanged } from "@/lib/uiEvents";
import { usePlaceOnboarding } from "@/contexts/PlaceOnboardingContext";
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
  const { startJob } = usePlaceOnboarding();
  const [step, setStep] = useState<"search" | "map">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicCitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [existingPlaces, setExistingPlaces] = useState<UserPlace[]>([]);

  /** When set, we have city (and optionally coords) for the map step. */
  const [pending, setPending] = useState<{
    city: PublicCitySearchResult;
    coords: { lat: number; lng: number } | null;
    district: number | null;
    /** What the user typed (e.g. ZIP) — stored in prefs for Settings display. */
    homeDisplayLabel?: string | null;
  } | null>(null);

  const [placeLabel, setPlaceLabel] = useState("My Block");
  const [placeRadius, setPlaceRadius] = useState(DEFAULT_PLACE_RADIUS_M);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const placesCityIdRef = useRef<number | null>(null);

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
    setPlaceLabel("My Block");
    setPlaceRadius(DEFAULT_PLACE_RADIUS_M);
    setExistingPlaces([]);
    setPlacesLoading(false);
    placesCityIdRef.current = null;
    if (geoLoading) setGeoLoading(false);
    onClose();
  };

  const loadExistingPlaces = async (cityId: number) => {
    placesCityIdRef.current = cityId;
    setPlacesLoading(true);
    setExistingPlaces([]);
    try {
      const token = await getAccessTokenSilently();
      const res = await listMyPlaces(token, { city_id: cityId });
      if (placesCityIdRef.current === cityId) {
        setExistingPlaces(res.places);
      }
    } catch (e) {
      if (placesCityIdRef.current === cityId) {
        setExistingPlaces([]);
      }
    } finally {
      if (placesCityIdRef.current === cityId) {
        setPlacesLoading(false);
      }
    }
  };

  const openMapStep = (
    nextPending: {
      city: PublicCitySearchResult;
      coords: { lat: number; lng: number } | null;
      district: number | null;
      homeDisplayLabel?: string | null;
    }
  ) => {
    setPending(nextPending);
    setStep("map");
    setError(null);
    void loadExistingPlaces(nextPending.city.id);
  };

  const persistHomeLocation = async ({
    token,
    cityId,
    district,
    coords,
    place,
    locationLabel,
  }: {
    token: string;
    cityId: number;
    district: number | null;
    coords: { lat: number; lng: number };
    place?: Pick<UserPlace, "id" | "label">;
    /** Shown in Settings (e.g. ZIP or address the user searched). */
    locationLabel?: string | null;
  }) => {
    const latest = await getUserPreferences(token);
    const currentExtra = latest.extra || {};
    const trimmedLabel = locationLabel?.trim();
    await updateUserPreferences(
      {
        extra: {
          ...currentExtra,
          home_location: {
            city_id: cityId,
            district: district ?? null,
            coordinates: coords,
            ...(place ? { place_id: place.id, place_label: place.label } : {}),
            ...(trimmedLabel ? { location_label: trimmedLabel } : {}),
          },
        },
      },
      token
    );
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
    openMapStep({
      city,
      coords: null,
      district: null,
      homeDisplayLabel: query.trim() || null,
    });
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
      const homeDisplayLabel = pending?.homeDisplayLabel ?? null;
      openMapStep({ city, coords, district, homeDisplayLabel });
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
      openMapStep({ city, coords: coordinates, district, homeDisplayLabel: q });
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
      const createdPlace = await createPlace(token, {
        city_id: cityId,
        label: opts.label.trim() || "My Block",
        lat,
        lng,
        radius_m: opts.radius_m,
      });

      // Kick off neighborhood story generation and show the loading banner
      if (createdPlace?.id) {
        try {
          const { job_id } = await runPlaceMetricsAndAnomaliesAsJob(createdPlace.id, token);
          startJob(createdPlace.id, job_id);
        } catch {
          // Non-blocking: feed still works without place-specific stories
        }
      }

      await persistHomeLocation({
        token,
        cityId,
        district,
        coords: pending.coords,
        place: createdPlace,
        locationLabel: pending.homeDisplayLabel ?? null,
      });
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

  const handleUseExistingPlace = async (place: UserPlace) => {
    setSaveLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const district = await findDistrictFromCoordinates(
        place.lat,
        place.lng,
        place.city_id,
        token
      );

      await saveCity(place.city_id, token);
      if (district !== null && district !== undefined) {
        try {
          await followRepresentative(place.city_id, String(district), token);
        } catch {
          // ignore if follow fails (e.g. already following)
        }
      }

      await persistHomeLocation({
        token,
        cityId: place.city_id,
        district,
        coords: { lat: place.lat, lng: place.lng },
        place,
        locationLabel: place.label,
      });

      emitSavedCitiesChanged();
      queryClient.invalidateQueries({ queryKey: cityKeys.savedDistricts() });
      onSaved?.();
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to use saved place");
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
              {pending.homeDisplayLabel?.trim() && (
                <span> · {pending.homeDisplayLabel.trim()}</span>
              )}
            </p>
            {error && (
              <div className={searchStyles.resultError} style={{ marginBottom: 12 }}>
                <span>{error}</span>
              </div>
            )}
            {(placesLoading || existingPlaces.length > 0) && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  Use one of your saved places
                </div>
                {placesLoading ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", fontSize: 13 }}>
                    <Loader size="sm" color="dark" />
                    <span>Loading saved places…</span>
                  </div>
                ) : (
                  <>
                    {existingPlaces.map((place) => (
                      <button
                        key={place.id}
                        type="button"
                        className={searchStyles.resultBtn}
                        onClick={() => void handleUseExistingPlace(place)}
                        disabled={saveLoading}
                      >
                        <div className={searchStyles.resultCityRow}>
                          <span className={searchStyles.resultCityName}>{place.label}</span>
                          <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                            {place.radius_m} m radius
                          </span>
                        </div>
                      </button>
                    ))}
                    <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>
                      Or add a new place below.
                    </p>
                  </>
                )}
              </div>
            )}
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
                <LocationMapSave
                  cityId={pending.city.id}
                  lat={pending.coords.lat}
                  lng={pending.coords.lng}
                  valueLabel={placeLabel}
                  valueRadiusM={placeRadius}
                  onLabelChange={setPlaceLabel}
                  onRadiusChange={setPlaceRadius}
                  defaultLabel="My Block"
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
