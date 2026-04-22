"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getPublicLeadersForCity,
  searchPublicCities,
  type PublicCitySearchResult,
  type PublicLeader,
} from "@/lib/publicApiClient";
import {
  pickDistrictSupervisorFromPublicLeaders,
  pickMayorFromPublicLeaders,
} from "@/lib/publicLeadersPick";
import { formatLeaderName } from "@/lib/utils";
import {
  isLikelyZipcode,
  isLikelyAddress,
  isGeographicQuery,
  geocodeQuery,
  reverseGeocode,
  getCurrentLocation,
  resolveCityFromGeocode,
  fetchAddressSuggestions,
  suggestionToGeocodeResult,
  getDirectMatchDisplayCity,
  isPreciseAddressSuggestion,
  type AddressSuggestion,
} from "@/lib/locationSearchUtils";
import {
  saveCity,
  createPlace,
  followRepresentative,
  runPlaceMetricsAndAnomaliesAsJob,
  type UserPlace,
} from "@/lib/apiClient";
import LocationMapSave from "@/components/LocationMapSave";
import locationMapSaveStyles from "@/components/LocationMapSave.module.css";
import { DEFAULT_PLACE_RADIUS_M } from "@/lib/mapUtils";
import { findDistrictFromCoordinates } from "@/lib/findDistrictFromCoordinates";
import { usePlaceOnboarding } from "@/contexts/PlaceOnboardingContext";
import { cityKeys } from "@/lib/hooks/useCities";
import Loader from "@/components/Loader";
import welcomeStyles from "./WelcomeModal.module.css";

import styles from "./SidebarCitySearch.module.css";

const ONBOARDING_PLACE_LABEL_DEFAULT = "My place";

function PlaceSaveLeadershipIntro({
  district,
  cityLabel,
  leaders,
  isLoading,
  isError,
}: {
  district: number;
  cityLabel: string;
  leaders: PublicLeader[];
  isLoading: boolean;
  isError: boolean;
}) {
  const mayorL = pickMayorFromPublicLeaders(leaders);
  const repL =
    district > 0 ? pickDistrictSupervisorFromPublicLeaders(leaders, district) : null;

  return (
    <section
      className={styles.placeSaveLeadership}
      role="region"
      aria-label="Elected officials for this city"
    >
      <h3 className={styles.placeSaveLeadershipHeading}>Who represents you</h3>
      {isLoading ? (
        <p className={styles.placeSaveLeadershipMuted}>Loading officials…</p>
      ) : isError ? (
        <p className={styles.placeSaveLeadershipMuted}>
          We could not load elected officials for this city right now.
        </p>
      ) : (
        <>
          <p className={styles.placeSaveLeadershipLead}>
            In {cityLabel}
            {district === 0
              ? ", your dashboard follows the whole city."
              : `, District ${district} is the area we matched to your location.`}{" "}
            Here is who we have on file:
          </p>
          {mayorL ? (
            <div className={styles.placeSaveLeadershipRow}>
              <span className={styles.placeSaveLeadershipBadge}>Mayor</span>
              <div className={styles.placeSaveLeadershipText}>
                <strong>{formatLeaderName(mayorL.name)}</strong>
                {mayorL.title ? (
                  <span className={styles.placeSaveLeadershipTitle}> — {mayorL.title}</span>
                ) : null}
              </div>
            </div>
          ) : null}
          {repL && district > 0 ? (
            <div className={styles.placeSaveLeadershipRow}>
              <span className={styles.placeSaveLeadershipBadge}>District {district}</span>
              <div className={styles.placeSaveLeadershipText}>
                <strong>{formatLeaderName(repL.name)}</strong>
                {repL.title ? (
                  <span className={styles.placeSaveLeadershipTitle}> — {repL.title}</span>
                ) : null}
              </div>
            </div>
          ) : null}
          {!mayorL && !repL ? (
            <p className={styles.placeSaveLeadershipMuted}>
              Elected official names are not published for this city yet.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

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

export type SidebarCitySelectOptions = {
  /** When set (including null for citywide), opens the city dashboard scoped to this district after skip. */
  district?: number | null;
  /**
   * Search flow auto-followed this city/district (save + follow already applied).
   * Parent may show a one-time onboarding hint; not persisted across sessions.
   */
  searchOnboardingAutoFollow?: boolean;
  /** For explicit follow toasts when searchOnboardingAutoFollow is set. */
  cityDisplayName?: string;
};

export default function SidebarCitySearch({
  onCitySelect,
  onGPSLocation,
  onPlaceSaved,
  placeholder = "Type to search for cities, or enter a ZIP code",
}: {
  onCitySelect: (cityId: number, opts?: SidebarCitySelectOptions) => void;
  onGPSLocation?: (location: { lat: number; lng: number } | null) => void;
  /** Called after user saves a personalized place from the map step (parent refetches + opens block view). */
  onPlaceSaved?: (place: UserPlace) => void;
  placeholder?: string;
}) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();
  const { startJob } = usePlaceOnboarding();
  const [open, setOpen] = useState(false);
  const [modalStep, setModalStep] = useState<"search" | "placeSave">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicCitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [storedGPSLocation, setStoredGPSLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsActive, setGpsActive] = useState(false);
  /** After resolving a city + coordinates, optional save step before navigating. */
  const [pendingSave, setPendingSave] = useState<{
    city: PublicCitySearchResult;
    coords: { lat: number; lng: number };
    district: number | null;
  } | null>(null);
  const [savePlaceLoading, setSavePlaceLoading] = useState(false);
  /** Map center chosen while saving a place (pan map; falls back to pendingSave.coords). */
  const [placePinOverride, setPlacePinOverride] = useState<{ lat: number; lng: number } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastRequestIdRef = useRef(0);
  const searchTimeoutRef = useRef<number | null>(null);
  const addressSuggestTimeoutRef = useRef<number | null>(null);
  const geoLoadingTimeoutRef = useRef<number | null>(null);

  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSuggestionsLoading, setAddressSuggestionsLoading] = useState(false);

  const trimmed = useMemo(() => query.trim(), [query]);
  const queryIsGeo = useMemo(
    () => isGeographicQuery(trimmed),
    [trimmed],
  );

  const directMatchCity = useMemo(
    () =>
      !queryIsGeo && trimmed.length >= 2
        ? getDirectMatchDisplayCity(results, trimmed)
        : null,
    [queryIsGeo, trimmed, results],
  );

  const suppressAddressAutocomplete = Boolean(directMatchCity) && !queryIsGeo;

  const placeSaveLeadersQuery = useQuery({
    queryKey: ["sidebarPlaceSaveLeaders", pendingSave?.city.id],
    queryFn: () => {
      const id = pendingSave?.city.id;
      if (id == null) return Promise.resolve([] as PublicLeader[]);
      return getPublicLeadersForCity(id);
    },
    enabled:
      modalStep === "placeSave" &&
      pendingSave != null &&
      pendingSave.district !== null,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!suppressAddressAutocomplete) return;
    setAddressSuggestions([]);
    setAddressSuggestionsLoading(false);
  }, [suppressAddressAutocomplete]);

  const listLengthForKeys = useMemo(() => {
    const addrLen = queryIsGeo ? addressSuggestions.length : 0;
    if (directMatchCity && !queryIsGeo && addrLen === 0) return 1;
    if (addrLen > 0) return addrLen;
    return results.length;
  }, [directMatchCity, queryIsGeo, addressSuggestions.length, results.length]);

  /** City-name search must not show Mapbox rows (e.g. districts); drop stale suggest runs. */
  useEffect(() => {
    if (queryIsGeo) return;
    if (addressSuggestTimeoutRef.current) {
      window.clearTimeout(addressSuggestTimeoutRef.current);
      addressSuggestTimeoutRef.current = null;
    }
    setAddressSuggestions([]);
    setAddressSuggestionsLoading(false);
  }, [queryIsGeo]);

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
      if (addressSuggestTimeoutRef.current) window.clearTimeout(addressSuggestTimeoutRef.current);
      if (geoLoadingTimeoutRef.current) window.clearTimeout(geoLoadingTimeoutRef.current);
    };
  }, []);

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
    setModalStep("search");
    setQuery("");
    setResults([]);
    setAddressSuggestions([]);
    setError(null);
    setSelectedIndex(-1);
    setPendingSave(null);
    setPlacePinOverride(null);
    if (geoLoading) {
      setGeoLoading(false);
    }
    setGpsActive(false);
    if (geoLoadingTimeoutRef.current) {
      window.clearTimeout(geoLoadingTimeoutRef.current);
      geoLoadingTimeoutRef.current = null;
    }
    if (addressSuggestTimeoutRef.current) {
      window.clearTimeout(addressSuggestTimeoutRef.current);
      addressSuggestTimeoutRef.current = null;
    }
  };

  const scheduleCitySearch = (q: string) => {
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = window.setTimeout(() => {
      void runCitySearch(q);
    }, 250);
  };

  const scheduleAddressSuggest = (q: string) => {
    if (addressSuggestTimeoutRef.current) window.clearTimeout(addressSuggestTimeoutRef.current);
    const s = q.trim();
    if (s.length < 2 || !isGeographicQuery(s)) {
      setAddressSuggestions([]);
      setAddressSuggestionsLoading(false);
      return;
    }
    setAddressSuggestionsLoading(true);
    addressSuggestTimeoutRef.current = window.setTimeout(async () => {
      const list = await fetchAddressSuggestions(s);
      setAddressSuggestions(list);
      setAddressSuggestionsLoading(false);
      setSelectedIndex(-1);
    }, 300);
  };

  const openPlaceSaveStep = (
    city: PublicCitySearchResult,
    coords: { lat: number; lng: number },
    district: number | null
  ) => {
    setPlacePinOverride(null);
    setPendingSave({ city, coords, district });
    setModalStep("placeSave");
    setError(null);
  };

  const finishOpenCityDashboard = (cityId: number, district: number | null) => {
    onCitySelect(cityId, { district });
    closeModal();
  };

  const finishSearchAutoFollow = (
    cityId: number,
    district: number | null,
    cityDisplayName?: string | null
  ) => {
    onCitySelect(cityId, {
      district,
      searchOnboardingAutoFollow: true,
      cityDisplayName: cityDisplayName ?? undefined,
    });
    closeModal();
  };

  const navigateCitySearchWithAutoFollow = async (
    city: PublicCitySearchResult,
    district: number | null,
    coordinates: { lat: number; lng: number } | null
  ) => {
    if (coordinates) {
      setStoredGPSLocation(coordinates);
      onGPSLocation?.(coordinates);
    }
    if (!isAuthenticated) {
      finishOpenCityDashboard(city.id, district);
      return;
    }
    try {
      const token = await getAccessTokenSilently();
      try {
        await saveCity(city.id, token);
      } catch {
        // May already be saved
      }
      try {
        if (district != null && district !== 0) {
          await followRepresentative(city.id, String(district), token);
        } else {
          await followRepresentative(city.id, "0", token);
        }
      } catch {
        // Duplicate follow or missing rep — still open city
      }
      queryClient.invalidateQueries({ queryKey: cityKeys.saved() });
      queryClient.invalidateQueries({ queryKey: cityKeys.savedDistricts() });
      queryClient.invalidateQueries({ queryKey: cityKeys.representativeFollows(city.id) });
      queryClient.invalidateQueries({
        queryKey: cityKeys.representativeFollowerCounts(city.id),
      });
      finishSearchAutoFollow(city.id, district, city.display_name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete selection");
    }
  };

  const handleAddressSuggestionSelect = async (suggestion: AddressSuggestion) => {
    if (!suggestion.cityName) {
      setError("Could not determine city from this address.");
      return;
    }
    setGeoLoading(true);
    setError(null);
    setAddressSuggestions([]);
    try {
      const geo = suggestionToGeocodeResult(suggestion);
      const { city, coordinates } = await resolveCityFromGeocode(geo, searchPublicCities);
      if (!isAuthenticated) {
        if (coordinates) {
          setStoredGPSLocation(coordinates);
          onGPSLocation?.(coordinates);
        }
        finishOpenCityDashboard(city.id, null);
        return;
      }
      if (!coordinates) {
        finishOpenCityDashboard(city.id, null);
        return;
      }
      if (!isPreciseAddressSuggestion(suggestion)) {
        await navigateCitySearchWithAutoFollow(city, null, coordinates);
        return;
      }
      const token = await getAccessTokenSilently();
      let district: number | null = null;
      try {
        district = await findDistrictFromCoordinates(coordinates.lat, coordinates.lng, city.id, token);
      } catch {
        district = null;
      }
      setStoredGPSLocation(coordinates);
      onGPSLocation?.(coordinates);
      openPlaceSaveStep(city, coordinates, district);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not find city for this address.");
    } finally {
      setGeoLoading(false);
    }
  };

  const runCitySearch = async (q: string) => {
    const s = q.trim();
    if (s.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      setSelectedIndex(-1);
      return;
    }

    if (isGeographicQuery(s)) {
      setResults([]);
      setLoading(false);
      setError(null);
      setSelectedIndex(-1);
      return;
    }

    const requestId = ++lastRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const r = await searchPublicCities(s, 10);
      if (lastRequestIdRef.current !== requestId) return;
      setResults(Array.isArray(r) ? r : []);
      setSelectedIndex(-1);
      setLoading(false);
    } catch (e) {
      if (lastRequestIdRef.current !== requestId) return;
      setResults([]);
      setSelectedIndex(-1);
      setLoading(false);
      setError(e instanceof Error ? e.message : "City search failed");
    }
  };

  /** Pick a city from the list: resolve district from city center, save + follow, open city view (no place modal). */
  const selectCityFromList = async (city: PublicCitySearchResult) => {
    if (!isAuthenticated) {
      finishOpenCityDashboard(city.id, null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const geo = await geocodeQuery(city.display_name);
      const { city: resolvedFromGeo, coordinates } = await resolveCityFromGeocode(geo, (q, lim) =>
        searchPublicCities(q, lim)
      );
      const targetCity = resolvedFromGeo.id === city.id ? city : resolvedFromGeo;
      await navigateCitySearchWithAutoFollow(targetCity, null, coordinates);
    } catch {
      finishOpenCityDashboard(city.id, null);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlaceAndOpen = async (opts: { label: string; radius_m: number }) => {
    if (!pendingSave || !isAuthenticated) return;
    setSavePlaceLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const { city, coords, district } = pendingSave;
      const pin = placePinOverride ?? coords;
      let districtToFollow = district;
      try {
        districtToFollow = await findDistrictFromCoordinates(pin.lat, pin.lng, city.id, token);
      } catch {
        districtToFollow = district;
      }
      await saveCity(city.id, token);
      try {
        if (districtToFollow !== null && districtToFollow !== undefined && districtToFollow !== 0) {
          await followRepresentative(city.id, String(districtToFollow), token);
        } else {
          await followRepresentative(city.id, "0", token);
        }
      } catch {
        // ignore if follow fails
      }
      const place = await createPlace(token, {
        city_id: city.id,
        label: opts.label.trim() || ONBOARDING_PLACE_LABEL_DEFAULT,
        lat: pin.lat,
        lng: pin.lng,
        radius_m: opts.radius_m,
      });
      if (place?.id) {
        try {
          const { job_id } = await runPlaceMetricsAndAnomaliesAsJob(place.id, token);
          startJob(place.id, job_id);
        } catch {
          // non-blocking
        }
      }
      onPlaceSaved?.(place);
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save place");
    } finally {
      setSavePlaceLoading(false);
    }
  };

  const handleSkipSaveOpenDashboard = () => {
    if (!pendingSave) return;
    const { city, district } = pendingSave;
    finishOpenCityDashboard(city.id, district);
  };

  const handleGeocodeQuery = async () => {
    const s = trimmed;
    if (!s) return;
    setGeoLoading(true);
    setError(null);
    try {
      const geo = await geocodeQuery(s);
      const { city, coordinates } = await resolveCityFromGeocode(geo, searchPublicCities);
      const zipOnly = isLikelyZipcode(s);
      const streetAddress = isLikelyAddress(s) && !zipOnly;

      if (!coordinates) {
        finishOpenCityDashboard(city.id, null);
        return;
      }
      setStoredGPSLocation(coordinates);
      onGPSLocation?.(coordinates);

      if (!isAuthenticated) {
        finishOpenCityDashboard(city.id, null);
        return;
      }

      const token = await getAccessTokenSilently();
      let district: number | null = null;
      try {
        district = await findDistrictFromCoordinates(coordinates.lat, coordinates.lng, city.id, token);
      } catch {
        district = null;
      }

      if (zipOnly) {
        await navigateCitySearchWithAutoFollow(city, district, coordinates);
        return;
      }

      if (streetAddress) {
        openPlaceSaveStep(city, coordinates, district);
        return;
      }

      await navigateCitySearchWithAutoFollow(city, district, coordinates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geocoding failed");
    } finally {
      setGeoLoading(false);
    }
  };

  const handleUseCurrentLocation = async (e?: React.MouseEvent, openModalFlag: boolean = false) => {
    if (e) {
      e.stopPropagation();
    }

    setGpsActive(true);

    setGeoLoading(true);
    setError(null);

    if (geoLoadingTimeoutRef.current) {
      window.clearTimeout(geoLoadingTimeoutRef.current);
    }

    geoLoadingTimeoutRef.current = window.setTimeout(() => {
      console.warn("GPS loading timeout - resetting state");
      setGeoLoading(false);
      setGpsActive(false);
      setError("Location request timed out. Please try again.");
    }, 15000);

    if (openModalFlag) {
      setOpen(true);
    }

    try {
      const location = await getCurrentLocation();

      if (geoLoadingTimeoutRef.current) {
        window.clearTimeout(geoLoadingTimeoutRef.current);
        geoLoadingTimeoutRef.current = null;
      }

      setStoredGPSLocation(location);
      onGPSLocation?.(location);

      const geo = await reverseGeocode(location.lat, location.lng);
      const { city, coordinates } = await resolveCityFromGeocode(geo, searchPublicCities);
      const coords = coordinates ?? location;

      if (isAuthenticated) {
        const token = await getAccessTokenSilently();
        let district: number | null = null;
        try {
          district = await findDistrictFromCoordinates(coords.lat, coords.lng, city.id, token);
        } catch {
          district = null;
        }
        if (open || openModalFlag) {
          openPlaceSaveStep(city, coords, district);
        } else {
          onCitySelect(city.id, { district });
        }
      } else {
        finishOpenCityDashboard(city.id, null);
      }

      setGeoLoading(false);
      setGpsActive(false);
    } catch (err) {
      console.error("GPS location error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to use current location.";

      if (errorMessage.includes("denied")) {
        setError("Location access denied. Please enter your city manually.");
      } else if (errorMessage.includes("timeout")) {
        setError("Location request timed out. Please try again.");
      } else {
        setError(errorMessage);
      }

      setGeoLoading(false);
      setGpsActive(false);

      if (geoLoadingTimeoutRef.current) {
        window.clearTimeout(geoLoadingTimeoutRef.current);
        geoLoadingTimeoutRef.current = null;
      }

      if (openModalFlag && !open) {
        setOpen(true);
      }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closeModal();
      return;
    }

    const listLength = listLengthForKeys;

    if (e.key === "Enter") {
      if (directMatchCity && !queryIsGeo && addressSuggestions.length === 0) {
        e.preventDefault();
        void selectCityFromList(directMatchCity);
        return;
      }
      if (
        queryIsGeo &&
        addressSuggestions.length > 0 &&
        selectedIndex >= 0 &&
        addressSuggestions[selectedIndex]
      ) {
        e.preventDefault();
        void handleAddressSuggestionSelect(addressSuggestions[selectedIndex]);
        return;
      }
      if (queryIsGeo) {
        e.preventDefault();
        void handleGeocodeQuery();
        return;
      }
      if (selectedIndex >= 0 && results[selectedIndex]) {
        e.preventDefault();
        void selectCityFromList(results[selectedIndex]);
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, listLength - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    }
  };

  const handlePlacePinChange = useCallback((nextLat: number, nextLng: number) => {
    setPlacePinOverride({ lat: nextLat, lng: nextLng });
  }, []);

  const modalContent = (
    <div className={styles.modalOverlay} onClick={closeModal}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {modalStep === "placeSave" ? "Save your place" : "Search cities"}
          </h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={() => {
              if (modalStep === "placeSave") {
                handleSkipSaveOpenDashboard();
              } else {
                closeModal();
              }
            }}
            aria-label={modalStep === "placeSave" ? "Skip saving and open dashboard" : "Close search"}
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
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {modalStep === "placeSave" && pendingSave ? (
          <div className={styles.modalMapSaveStep}>
            <p className={styles.placeSaveLead}>
              Saving a detailed location pins your metrics to this exact area so you get richer, ongoing insight into
              what is happening there and how it is changing.
            </p>
            <p className={styles.modalMapSaveCity}>
              {pendingSave.city.emoji && (
                <span className={styles.modalMapSaveEmoji}>{pendingSave.city.emoji}</span>
              )}
              {pendingSave.city.display_name}
            </p>
            {pendingSave.district !== null ? (
              <PlaceSaveLeadershipIntro
                district={pendingSave.district}
                cityLabel={pendingSave.city.display_name}
                leaders={placeSaveLeadersQuery.data ?? []}
                isLoading={placeSaveLeadersQuery.isLoading}
                isError={placeSaveLeadersQuery.isError}
              />
            ) : null}
            {error && (
              <div className={styles.resultError} style={{ marginBottom: 12 }}>
                <span>{error}</span>
              </div>
            )}
            <LocationMapSave
              key={pendingSave.city.id}
              className={locationMapSaveStyles.stretchEmbed}
              cityId={pendingSave.city.id}
              lat={placePinOverride?.lat ?? pendingSave.coords.lat}
              lng={placePinOverride?.lng ?? pendingSave.coords.lng}
              defaultLabel={ONBOARDING_PLACE_LABEL_DEFAULT}
              defaultRadiusM={DEFAULT_PLACE_RADIUS_M}
              onSave={handleSavePlaceAndOpen}
              saving={savePlaceLoading}
              saveButtonLabel="Save"
              onCancel={handleSkipSaveOpenDashboard}
              cancelButtonLabel="Skip"
              draggablePin
              onPinChange={handlePlacePinChange}
            />
          </div>
        ) : (
          <>
            <div className={styles.modalSearch}>
              {error && <div className={styles.searchStepError}>{error}</div>}
              <button
                type="button"
                className={styles.modalGpsHeroBtn}
                title="Use my current location"
                aria-label="Use my current location"
                onClick={() => void handleUseCurrentLocation(undefined, true)}
                disabled={geoLoading}
              >
                {geoLoading ? (
                  <Loader size="sm" color="white" />
                ) : (
                  <>
                    {locationGpsIcon}
                    Use my current location
                  </>
                )}
              </button>

              <div className={welcomeStyles.locationDivider} aria-hidden="true">
                <span className={welcomeStyles.locationDividerLine} />
                <span className={welcomeStyles.locationDividerText}>or search</span>
                <span className={welcomeStyles.locationDividerLine} />
              </div>

              <div className={styles.inputWrap}>
                <svg
                  className={styles.leadingIcon}
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
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  ref={inputRef}
                  className={styles.input}
                  value={query}
                  placeholder={placeholder}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuery(v);
                    scheduleCitySearch(v);
                    scheduleAddressSuggest(v);
                  }}
                  onKeyDown={handleInputKeyDown}
                  aria-label="Search cities and addresses"
                />
              </div>
            </div>

            <div className={styles.modalResults} role="listbox">
              {geoLoading ? (
                <div className={styles.resultItem}>
                  <span className={styles.resultLoading}>Locating…</span>
                </div>
              ) : null}

              {!geoLoading &&
              queryIsGeo &&
              !suppressAddressAutocomplete &&
              addressSuggestionsLoading &&
              trimmed.length >= 2 ? (
                <div className={styles.resultItem}>
                  <span className={styles.resultLoading}>Searching addresses…</span>
                </div>
              ) : null}

              {!geoLoading &&
                queryIsGeo &&
                !suppressAddressAutocomplete &&
                !addressSuggestionsLoading &&
                addressSuggestions.length > 0 &&
                addressSuggestions.map((suggestion, idx) => (
                  <button
                    key={`${suggestion.place_name}-${idx}`}
                    type="button"
                    className={`${styles.resultBtn} ${idx === selectedIndex ? styles.resultBtnSelected : ""}`}
                    role="option"
                    aria-selected={idx === selectedIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => void handleAddressSuggestionSelect(suggestion)}
                  >
                    <span>{suggestion.place_name}</span>
                    <span className={styles.resultMeta}>Address →</span>
                  </button>
                ))}

              {!geoLoading &&
                addressSuggestions.length === 0 &&
                queryIsGeo &&
                trimmed.length > 0 ? (
                <button
                  type="button"
                  className={styles.resultBtn}
                  role="option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleGeocodeQuery()}
                >
                  <span>Search address/ZIP</span>
                  <span className={styles.resultMeta}>{trimmed}</span>
                </button>
              ) : null}

              {!geoLoading && !queryIsGeo && loading ? (
                <div className={styles.resultItem}>
                  <span className={styles.resultLoading}>Searching…</span>
                </div>
              ) : null}

              {!geoLoading &&
                !queryIsGeo &&
                !loading &&
                trimmed.length >= 2 &&
                directMatchCity &&
                addressSuggestions.length === 0 ? (
                  <button
                    type="button"
                    className={`${styles.resultBtn} ${selectedIndex === 0 ? styles.resultBtnSelected : ""}`}
                    role="option"
                    aria-selected={selectedIndex === 0}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setSelectedIndex(0)}
                    onClick={() => void selectCityFromList(directMatchCity)}
                  >
                    <div className={styles.resultCityRow}>
                      {directMatchCity.emoji ? (
                        <span className={styles.resultEmoji}>{directMatchCity.emoji}</span>
                      ) : null}
                      <span className={styles.resultCityName}>{directMatchCity.display_name}</span>
                    </div>
                    <span className={styles.resultMeta}>Continue →</span>
                  </button>
                ) : null}

              {!geoLoading &&
                !directMatchCity &&
                addressSuggestions.length === 0 &&
                !queryIsGeo &&
                !loading &&
                trimmed.length >= 2 &&
                results.map((city, idx) => (
                  <button
                    key={`${city.id}-${city.display_name}`}
                    type="button"
                    className={`${styles.resultBtn} ${idx === selectedIndex ? styles.resultBtnSelected : ""}`}
                    role="option"
                    aria-selected={idx === selectedIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => void selectCityFromList(city)}
                  >
                    <div className={styles.resultCityRow}>
                      {city.emoji ? (
                        <span className={styles.resultEmoji}>{city.emoji}</span>
                      ) : null}
                      <span className={styles.resultCityName}>{city.display_name}</span>
                    </div>
                    <span className={styles.resultMeta}>Continue →</span>
                  </button>
                ))}

              {!geoLoading &&
                addressSuggestions.length === 0 &&
                !queryIsGeo &&
                !loading &&
                trimmed.length >= 2 &&
                results.length === 0 && (
                  <div className={styles.resultItem}>
                    <div className={styles.resultEmpty}>
                      <span>No cities found</span>
                      <span className={styles.resultMeta}>
                        Try a different spelling — or enter a ZIP/address
                      </span>
                    </div>
                  </div>
                )}

            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className={styles.navItemContainer}>
        <button
          type="button"
          className={styles.navItem}
          onClick={() => setOpen(true)}
        >
          <span className={styles.navIcon}>
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
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <span className={styles.navLabel}>Search Cities</span>
        </button>
        <button
          type="button"
          className={`${styles.gpsBtn} ${gpsActive ? styles.gpsBtnActive : ""} ${storedGPSLocation ? styles.gpsBtnOn : ""}`}
          title="Use my current location"
          aria-label="Use my current location"
          onClick={(e) => {
            e.stopPropagation();
            void handleUseCurrentLocation(e, false);
          }}
          disabled={geoLoading}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3" />
            <path d="M12 19v3" />
            <path d="M2 12h3" />
            <path d="M19 12h3" />
          </svg>
        </button>
      </div>

      {mounted && open && createPortal(modalContent, document.body)}
    </>
  );
}
