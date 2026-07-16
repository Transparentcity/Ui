/**
 * MiniScopeMap — overview hero map with Mapbox basemap + scope overlay.
 *
 *  - Place:    Mapbox static image with purple radius circle + center dot
 *              (same styling as LocationMapSave / onboarding place maps).
 *  - District: Mapbox basemap cropped to district bbox + SVG district fill.
 *  - City:     Mapbox basemap for full city + district outlines + whole-city
 *              boundary outline, with the whole city filled in the same
 *              transparent brand purple used for place/district highlights.
 *
 * The SVG overlay projects in Web Mercator using the same aspect-fitted bbox
 * that is sent to the Mapbox Static Images API, so shapes align with streets.
 * Falls back to SVG-only when NEXT_PUBLIC_MAPBOX_TOKEN is unset.
 */

"use client";

import { useMemo } from "react";
import type { BoundarySketch } from "@/lib/publicApiClient";
import {
  bboxFromRings,
  buildBasemapStaticUrl,
  buildStaticMapUrl,
  DEFAULT_PLACE_RADIUS_M,
  fitBboxToAspect,
  latToMercY,
  lngToMercX,
  padMapBbox,
  type MapBbox,
} from "@/lib/mapUtils";
import { useTheme } from "@/contexts/ThemeContext";
import styles from "./MiniScopeMap.module.css";

interface MiniScopeMapProps {
  sketch: BoundarySketch | null | undefined;
  /** 0 = citywide, >0 = district scope. */
  selectedDistrict: number;
  isPlaceScope: boolean;
  placeDistrict?: number | null;
  placeLat?: number | null;
  placeLng?: number | null;
  placeRadiusM?: number | null;
  onClick?: () => void;
  className?: string;
}

const MAP_W = 800;
const MAP_H = 320;
const MAP_ASPECT = MAP_W / MAP_H;

/** Project WGS84 → SVG px via Web Mercator (matches Mapbox rendering). */
function project(
  lng: number,
  lat: number,
  bbox: MapBbox,
  viewW: number,
  viewH: number,
): [number, number] {
  const x0 = lngToMercX(bbox.min_lng);
  const x1 = lngToMercX(bbox.max_lng);
  const yTop = latToMercY(bbox.max_lat);
  const yBottom = latToMercY(bbox.min_lat);
  const x = ((lngToMercX(lng) - x0) / (x1 - x0 || 1e-9)) * viewW;
  const y = ((latToMercY(lat) - yTop) / (yBottom - yTop || 1e-9)) * viewH;
  return [x, y];
}

function ringToPath(
  ring: [number, number][],
  bbox: MapBbox,
  viewW: number,
  viewH: number,
): string {
  if (ring.length === 0) return "";
  const parts: string[] = [];
  ring.forEach(([lng, lat], i) => {
    const [x, y] = project(lng, lat, bbox, viewW, viewH);
    parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
  });
  parts.push("Z");
  return parts.join(" ");
}

function placePointBbox(lat: number, lng: number, radiusM: number): MapBbox {
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * cosLat);
  return {
    min_lng: lng - dLng,
    max_lng: lng + dLng,
    min_lat: lat - dLat,
    max_lat: lat + dLat,
  };
}

function SketchOverlay({
  sketch,
  viewBbox,
  highlightDistrict,
  showCityOutline,
  isPlaceScope,
  placeLat,
  placeLng,
  placeRadiusM,
  fillDistricts = true,
}: {
  sketch: BoundarySketch;
  viewBbox: MapBbox;
  highlightDistrict: number | null;
  showCityOutline: boolean;
  isPlaceScope: boolean;
  placeLat?: number | null;
  placeLng?: number | null;
  placeRadiusM?: number | null;
  /** When false (token-less fallback), fill districts more strongly. */
  fillDistricts?: boolean;
}) {
  const viewW = MAP_W;
  const viewH = MAP_H;

  let circleX: number | null = null;
  let circleY: number | null = null;
  let circleR: number | null = null;
  if (isPlaceScope && placeLat != null && placeLng != null) {
    [circleX, circleY] = project(placeLng, placeLat, viewBbox, viewW, viewH);
    const radiusM = placeRadiusM ?? DEFAULT_PLACE_RADIUS_M;
    const latSpanDeg = viewBbox.max_lat - viewBbox.min_lat || 1e-9;
    const radiusDeg = radiusM / 111320;
    const pxPerDeg = viewH / latSpanDeg;
    circleR = Math.max(10, radiusDeg * pxPerDeg);
  }

  const outlineRings = sketch.outline ?? [];
  // Citywide brand-purple fill: prefer the whole-city outline; if the backend
  // couldn't build one, fall back to filling each district instead.
  const hasCityFill = showCityOutline && outlineRings.length > 0;

  return (
    <svg
      className={styles.overlay}
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Citywide view: fill the whole city with the same transparent brand
          purple used for district/place highlights (drawn beneath outlines). */}
      {hasCityFill &&
        outlineRings.map((ring, i) => {
          const pathD = ringToPath(ring, viewBbox, viewW, viewH);
          if (!pathD) return null;
          return (
            <path
              key={`city-fill-${i}`}
              d={pathD}
              fill="rgba(173, 53, 250, 0.28)"
              stroke="none"
            />
          );
        })}

      {sketch.districts.map((d) => {
        const isHighlighted = d.district_id === highlightDistrict;
        const pathD = d.rings
          .map((ring) => ringToPath(ring, viewBbox, viewW, viewH))
          .join(" ");
        if (!pathD) return null;
        return (
          <path
            key={d.district_id}
            d={pathD}
            fill={
              isHighlighted
                ? isPlaceScope
                  ? "rgba(173, 53, 250, 0.12)"
                  : "rgba(173, 53, 250, 0.28)"
                : hasCityFill
                  ? "none"
                  : showCityOutline
                    ? "rgba(173, 53, 250, 0.28)"
                    : fillDistricts
                      ? "rgba(246, 237, 255, 0.35)"
                      : "rgba(246, 237, 255, 0.12)"
            }
            stroke={isHighlighted ? "#ad35fa" : "rgba(148, 163, 184, 0.65)"}
            strokeWidth={isHighlighted ? 2.5 : 1}
            strokeLinejoin="round"
          />
        );
      })}

      {/* Whole-city boundary outline (citywide view) */}
      {showCityOutline &&
        outlineRings.map((ring, i) => {
          const pathD = ringToPath(ring, viewBbox, viewW, viewH);
          if (!pathD) return null;
          return (
            <path
              key={`outline-${i}`}
              d={pathD}
              fill="none"
              stroke="#ad35fa"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeOpacity={0.85}
            />
          );
        })}

      {isPlaceScope && circleX != null && circleY != null && circleR != null && (
        <>
          <circle
            cx={circleX}
            cy={circleY}
            r={circleR}
            fill="#ad35fa"
            fillOpacity={0.25}
            stroke="#ad35fa"
            strokeWidth={2}
          />
          <circle cx={circleX} cy={circleY} r={6} fill="#ad35fa" />
        </>
      )}
    </svg>
  );
}

export default function MiniScopeMap({
  sketch,
  selectedDistrict,
  isPlaceScope,
  placeDistrict,
  placeLat,
  placeLng,
  placeRadiusM,
  onClick,
  className,
}: MiniScopeMapProps) {
  const { theme } = useTheme();
  const mapTheme = theme === "dark" ? "dark" : "light";

  const highlightDistrict = isPlaceScope
    ? (placeDistrict ?? null)
    : selectedDistrict > 0
      ? selectedDistrict
      : null;

  const cityBbox = sketch?.bbox ?? null;

  /**
   * View bbox: zoom to highlighted district or place radius, else full city.
   * Aspect-fitted in Mercator space so it matches the static basemap exactly.
   */
  const viewBbox = useMemo((): MapBbox | null => {
    let base: MapBbox | null = null;
    if (isPlaceScope && placeLat != null && placeLng != null) {
      base = padMapBbox(
        placePointBbox(placeLat, placeLng, placeRadiusM ?? DEFAULT_PLACE_RADIUS_M),
        0.3,
      );
    } else if (highlightDistrict != null && sketch?.districts.length) {
      const hd = sketch.districts.find((d) => d.district_id === highlightDistrict);
      if (hd?.rings.length) {
        base = padMapBbox(bboxFromRings(hd.rings), 0.12);
      }
    }
    if (!base && cityBbox) {
      base = padMapBbox(cityBbox, 0.05);
    }
    return base ? fitBboxToAspect(base, MAP_ASPECT) : null;
  }, [
    cityBbox,
    highlightDistrict,
    sketch?.districts,
    isPlaceScope,
    placeLat,
    placeLng,
    placeRadiusM,
  ]);

  /** Place scope: full Mapbox static map with streets + purple radius circle. */
  const placeMapUrl = useMemo(() => {
    if (!isPlaceScope || placeLat == null || placeLng == null) return null;
    return buildStaticMapUrl(
      placeLat,
      placeLng,
      placeRadiusM ?? DEFAULT_PLACE_RADIUS_M,
      undefined,
      MAP_W,
      MAP_H,
      mapTheme,
    );
  }, [isPlaceScope, placeLat, placeLng, placeRadiusM, mapTheme]);

  /** City / district scope: basemap only; districts drawn as SVG overlay.
   *  viewBbox is already aspect-fitted, so no extra padding here. */
  const basemapUrl = useMemo(() => {
    if (isPlaceScope || !viewBbox) return null;
    return buildBasemapStaticUrl(viewBbox, MAP_W, MAP_H, mapTheme, 0);
  }, [isPlaceScope, viewBbox, mapTheme]);

  const Tag = onClick ? "button" : "div";
  const tagProps = onClick
    ? { type: "button" as const, onClick, "aria-label": "View on map" }
    : {};

  // Place: Mapbox static with streets + purple radius circle (matches LocationMapSave)
  if (isPlaceScope && placeMapUrl) {
    return (
      <Tag className={`${styles.root} ${className ?? ""}`} {...tagProps}>
        <img
          src={placeMapUrl}
          alt="Map showing your place and radius"
          className={styles.mapImg}
        />
      </Tag>
    );
  }

  // City / district: basemap street layer + SVG district overlay
  if (!isPlaceScope && basemapUrl && sketch && viewBbox && sketch.districts.length > 0) {
    return (
      <Tag className={`${styles.root} ${className ?? ""}`} {...tagProps}>
        <div className={styles.composite}>
          <img src={basemapUrl} alt="" className={styles.basemap} aria-hidden="true" />
          <SketchOverlay
            sketch={sketch}
            viewBbox={viewBbox}
            highlightDistrict={highlightDistrict}
            showCityOutline={highlightDistrict == null}
            isPlaceScope={false}
          />
        </div>
      </Tag>
    );
  }

  // SVG-only fallback (no Mapbox token)
  if (sketch && viewBbox && sketch.districts.length > 0) {
    return (
      <Tag className={`${styles.root} ${className ?? ""}`} {...tagProps}>
        <div className={styles.composite}>
          <SketchOverlay
            sketch={sketch}
            viewBbox={viewBbox}
            highlightDistrict={highlightDistrict}
            showCityOutline={highlightDistrict == null && !isPlaceScope}
            isPlaceScope={isPlaceScope}
            placeLat={placeLat}
            placeLng={placeLng}
            placeRadiusM={placeRadiusM}
            fillDistricts
          />
        </div>
      </Tag>
    );
  }

  return <div className={`${styles.placeholder} ${className ?? ""}`} aria-hidden="true" />;
}
