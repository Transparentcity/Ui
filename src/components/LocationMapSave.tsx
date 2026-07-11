"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  buildRadiusCircleGeoJson,
  buildStaticMapUrl,
  DEFAULT_PLACE_RADIUS_M,
  MAX_PLACE_RADIUS_M,
  zoomForPlaceRadiusM,
} from "@/lib/mapUtils";
import { useTheme } from "@/contexts/ThemeContext";
import styles from "./LocationMapSave.module.css";

export interface LocationMapSaveProps {
  /** City ID for the place (used by parent when calling createPlace). */
  cityId: number;
  lat: number;
  lng: number;
  /** Default label for the place (e.g. "My place"). */
  defaultLabel?: string;
  /** Default radius in meters. */
  defaultRadiusM?: number;
  /** Controlled label (when parent provides the main CTA, e.g. Continue). */
  valueLabel?: string;
  /** Controlled radius in meters. */
  valueRadiusM?: number;
  /** Notify parent when label or radius changes (for controlled use). */
  onLabelChange?: (label: string) => void;
  onRadiusChange?: (radiusM: number) => void;
  /** Called when user saves; parent should create place and then close or navigate. Omit when parent handles save (e.g. Continue). */
  onSave?: (opts: { label: string; radius_m: number }) => Promise<void>;
  /** When true, disable the save button and show loading. */
  saving?: boolean;
  /** Label for the save button (e.g. "Save as my place"). If omitted, no button is shown (parent provides it). */
  saveButtonLabel?: string;
  /** Optional cancel/skip action. */
  onCancel?: () => void;
  /** Label for the skip/cancel button (default: Skip). */
  cancelButtonLabel?: string;
  /** Optional placeholder for the label input (e.g. "Name your place"). */
  labelPlaceholder?: string;
  /** When true and Mapbox token is set, show an interactive map (purple pin fixed at center; pan map to move it). */
  draggablePin?: boolean;
  /** Called when the map is panned so the geographic center (pin) changes (only when draggablePin is true). */
  onPinChange?: (lat: number, lng: number) => void;
  /** Optional extra class on the container (caller-specific layout tweaks). */
  className?: string;
}

/** ~10 cm at equator; avoids feedback loops from float noise vs Mapbox center. */
const CENTER_EPS = 1e-6;

function roughlySameLatLng(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): boolean {
  return (
    Math.abs(aLat - bLat) < CENTER_EPS && Math.abs(aLng - bLng) < CENTER_EPS
  );
}

const RADIUS_SOURCE_ID = "place-radius";
const RADIUS_FILL_LAYER_ID = "place-radius-fill";
const RADIUS_LINE_LAYER_ID = "place-radius-line";

function syncRadiusCircle(
  map: mapboxgl.Map,
  centerLat: number,
  centerLng: number,
  radiusM: number
): void {
  const data = buildRadiusCircleGeoJson(centerLat, centerLng, radiusM);
  // @types/mapbox-gl doesn't export a narrowed GeoJSONSource for getSource;
  // setData exists on geojson sources at runtime (same pattern as CityMapView).
  const existing = map.getSource(RADIUS_SOURCE_ID) as
    | { setData: (data: unknown) => void }
    | undefined;
  if (existing) {
    existing.setData(data);
    return;
  }
  map.addSource(RADIUS_SOURCE_ID, { type: "geojson", data });
  map.addLayer({
    id: RADIUS_FILL_LAYER_ID,
    type: "fill",
    source: RADIUS_SOURCE_ID,
    paint: { "fill-color": "#ad35fa", "fill-opacity": 0.2 },
  });
  map.addLayer({
    id: RADIUS_LINE_LAYER_ID,
    type: "line",
    source: RADIUS_SOURCE_ID,
    paint: { "line-color": "#ad35fa", "line-width": 2, "line-opacity": 0.75 },
  });
}

/** Pin stays in the center of the viewport; user pans the map to choose coordinates. */
function CenterPinnedPanMap({
  lat,
  lng,
  radiusM,
  onPositionChange,
  theme = "light",
}: {
  lat: number;
  lng: number;
  radiusM: number;
  onPositionChange: (lat: number, lng: number) => void;
  theme?: "light" | "dark";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InstanceType<typeof mapboxgl.Map> | null>(null);
  const onPositionChangeRef = useRef(onPositionChange);
  const propsCenterRef = useRef({ lat, lng });
  const radiusRef = useRef(radiusM);
  onPositionChangeRef.current = onPositionChange;
  propsCenterRef.current = { lat, lng };
  radiusRef.current = radiusM;

  useEffect(() => {
    const el = containerRef.current;
    const token =
      typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MAPBOX_TOKEN : undefined;
    if (!el || !token) return;

    const mapStyle =
      theme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11";

    const map = new mapboxgl.Map({
      container: el,
      style: mapStyle,
      center: [lng, lat],
      zoom: zoomForPlaceRadiusM(radiusM),
      attributionControl: true,
      accessToken: token,
      dragRotate: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    // Mapbox fires `move` during the initial camera setup, before the style
    // finishes loading. Adding sources/layers then throws "Style is not done
    // loading", so skip until the style is ready; `load` does the first draw.
    const isStyleReady = () =>
      (map as unknown as { isStyleLoaded?: () => boolean }).isStyleLoaded?.() ===
      true;

    const updateRadiusFromCenter = () => {
      if (!isStyleReady()) return;
      const c = map.getCenter();
      syncRadiusCircle(map, c.lat, c.lng, radiusRef.current);
    };

    const emitIfUserMovedCenter = () => {
      const c = map.getCenter();
      const p = propsCenterRef.current;
      if (roughlySameLatLng(c.lat, c.lng, p.lat, p.lng)) return;
      onPositionChangeRef.current(c.lat, c.lng);
    };

    map.on("load", updateRadiusFromCenter);
    map.on("move", updateRadiusFromCenter);
    map.on("moveend", emitIfUserMovedCenter);

    mapRef.current = map;
    return () => {
      map.off("load", updateRadiusFromCenter);
      map.off("move", updateRadiusFromCenter);
      map.off("moveend", emitIfUserMovedCenter);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialize map once; lat/lng/theme sync below
  }, [theme]); // re-init when theme changes so the basemap style updates

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (roughlySameLatLng(c.lat, c.lng, lat, lng)) return;
    map.setCenter([lng, lat]);
  }, [lat, lng]);

  useEffect(() => {
    const map = mapRef.current;
    // isStyleLoaded is missing from the bundled Map typings; present at runtime.
    if (!map || !(map as unknown as { isStyleLoaded(): boolean }).isStyleLoaded()) return;
    const c = map.getCenter();
    syncRadiusCircle(map, c.lat, c.lng, radiusM);
    map.setZoom(zoomForPlaceRadiusM(radiusM));
  }, [radiusM]);

  return (
    <div className={styles.mapInteractiveWrap}>
      <div ref={containerRef} className={styles.mapInteractive} />
      <div className={styles.centerPinOverlay} aria-hidden>
        <svg
          className={styles.centerPinSvg}
          viewBox="0 0 36 48"
          width="38"
          height="50"
          role="presentation"
        >
          <path
            d="M18 2C10.8 2 5 7.9 5 15.5 5 24 18 44 18 44s13-20 13-28.5C31 7.9 25.2 2 18 2z"
            fill="currentColor"
          />
          <circle cx="18" cy="16" r="4.5" fill="#ffffff" fillOpacity="0.95" />
        </svg>
      </div>
    </div>
  );
}

/**
 * Shared map + label + radius experience for saving a personalized location.
 * Used in onboarding (leader step), sidebar city search, and official selector (Find your district).
 */
export default function LocationMapSave({
  cityId: _cityId,
  lat,
  lng,
  defaultLabel = "My place",
  defaultRadiusM = DEFAULT_PLACE_RADIUS_M,
  valueLabel,
  valueRadiusM,
  onLabelChange,
  onRadiusChange,
  onSave,
  saving = false,
  saveButtonLabel,
  onCancel,
  cancelButtonLabel = "Skip",
  className,
  labelPlaceholder = "Label (e.g. My place)",
  draggablePin = false,
  onPinChange,
}: LocationMapSaveProps) {
  const [internalLabel, setInternalLabel] = useState(defaultLabel);
  const [internalRadius, setInternalRadius] = useState(defaultRadiusM);

  const { theme } = useTheme();

  const isControlledLabel = valueLabel !== undefined;
  const isControlledRadius = valueRadiusM !== undefined;
  const label = isControlledLabel ? valueLabel : internalLabel;
  const radiusM = isControlledRadius ? valueRadiusM : internalRadius;

  const setLabel = (v: string) => {
    if (!isControlledLabel) setInternalLabel(v);
    onLabelChange?.(v);
  };
  const setRadiusM = (v: number) => {
    if (!isControlledRadius) setInternalRadius(v);
    onRadiusChange?.(v);
  };

  const mapUrl = useMemo(
    () => buildStaticMapUrl(lat, lng, radiusM, undefined, undefined, undefined, theme),
    [lat, lng, radiusM, theme]
  );

  const hasMapboxToken =
    typeof process !== "undefined" && Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const showDraggable = Boolean(draggablePin && hasMapboxToken && onPinChange);

  const handlePinDrag = useCallback(
    (nextLat: number, nextLng: number) => {
      onPinChange?.(nextLat, nextLng);
    },
    [onPinChange]
  );

  const handleSave = async () => {
    if (onSave) await onSave({ label: label.trim() || defaultLabel, radius_m: radiusM });
  };

  return (
    <div className={`${styles.container} ${className ?? ""}`}>
      <div className={styles.toolbar}>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={labelPlaceholder}
          className={styles.labelInput}
          aria-label="Place label"
        />
        <span className={styles.radiusWrap}>
          <input
            type="range"
            min={10}
            max={MAX_PLACE_RADIUS_M}
            step={10}
            value={radiusM}
            onChange={(e) => setRadiusM(Number(e.target.value))}
            className={styles.slider}
            aria-label="Radius in meters"
          />
          {radiusM} m
        </span>
      </div>
      {showDraggable ? (
        <CenterPinnedPanMap
          lat={lat}
          lng={lng}
          radiusM={radiusM}
          onPositionChange={handlePinDrag}
          theme={theme}
        />
      ) : mapUrl ? (
        <img src={mapUrl} alt="Your location and radius" className={styles.mapImg} />
      ) : (
        <div className={styles.mapPlaceholder}>
          {draggablePin && !hasMapboxToken
            ? "Set NEXT_PUBLIC_MAPBOX_TOKEN for an interactive map preview."
            : "Map (set NEXT_PUBLIC_MAPBOX_TOKEN to show)"}
        </div>
      )}
      {(saveButtonLabel != null || onCancel != null) && (
        <div className={styles.actions}>
          {onCancel != null && (
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onCancel}
              disabled={saving}
              aria-label="Skip saving and open dashboard"
            >
              {cancelButtonLabel}
            </button>
          )}
          {saveButtonLabel != null && (
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSave}
              disabled={saving}
              aria-busy={saving}
              autoFocus={onCancel != null}
              aria-label="Save this place"
            >
              {saving ? "Saving…" : saveButtonLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
