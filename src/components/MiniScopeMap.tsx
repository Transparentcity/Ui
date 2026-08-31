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

export const MAP_W = 800;
export const MAP_H = 320;
const MAP_ASPECT = MAP_W / MAP_H;

/** Project WGS84 → SVG px via Web Mercator (matches Mapbox rendering). */
export function project(
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

export function ringToPath(
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

export function placePointBbox(lat: number, lng: number, radiusM: number): MapBbox {
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

/**
 * Aspect-fitted view bbox for the hero scope map (place radius, highlighted
 * district, or full city). Shared by MiniScopeMap and WeekReplayMap so their
 * overlays project onto the exact same basemap crop.
 */
export function computeScopeViewBbox({
  sketch,
  highlightDistrict,
  isPlaceScope,
  placeLat,
  placeLng,
  placeRadiusM,
  aspect = MAP_ASPECT,
}: {
  sketch: BoundarySketch | null | undefined;
  highlightDistrict: number | null;
  isPlaceScope: boolean;
  placeLat?: number | null;
  placeLng?: number | null;
  placeRadiusM?: number | null;
  /** Width/height ratio of the map frame (landscape default, portrait on narrow). */
  aspect?: number;
}): MapBbox | null {
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
  if (!base && sketch?.bbox) {
    base = padMapBbox(sketch.bbox, 0.05);
  }
  return base ? fitBboxToAspect(base, aspect) : null;
}

export function SketchOverlay({
  sketch,
  viewBbox,
  highlightDistrict,
  showCityOutline,
  isPlaceScope,
  placeLat,
  placeLng,
  placeRadiusM,
  fillDistricts = true,
  mapW = MAP_W,
  mapH = MAP_H,
  muted = false,
  mutedDark = false,
  placeName = null,
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
  mapW?: number;
  mapH?: number;
  /**
   * Week Replay styling: district outlines only (no fill) and a light dotted
   * purple square at the place's bbox capture area (most metrics filter by
   * lat/lon bounding box, so dots can land outside the nominal circle).
   */
  muted?: boolean;
  /** Grey shading tuned for the dark basemap (used with `muted`). */
  mutedDark?: boolean;
  /** Label drawn above the place marker (muted mode only). */
  placeName?: string | null;
}) {
  const viewW = mapW;
  const viewH = mapH;

  const mutedFill = mutedDark
    ? "rgba(255, 255, 255, 0.06)"
    : "rgba(17, 24, 39, 0.05)";
  const mutedStroke = mutedDark
    ? "rgba(255, 255, 255, 0.3)"
    : "rgba(71, 85, 105, 0.35)";

  let circleX: number | null = null;
  let circleY: number | null = null;
  let circleR: number | null = null;
  let squareBox: { x: number; y: number; w: number; h: number } | null = null;
  if (isPlaceScope && placeLat != null && placeLng != null) {
    [circleX, circleY] = project(placeLng, placeLat, viewBbox, viewW, viewH);
    // Radius in px via projection (project a point radiusM due north), so it
    // matches the Mercator scale at this latitude exactly and stays a true
    // circle whenever the frame matches the bbox aspect.
    const radiusM = placeRadiusM ?? DEFAULT_PLACE_RADIUS_M;
    const [, northY] = project(
      placeLng,
      placeLat + radiusM / 111320,
      viewBbox,
      viewW,
      viewH,
    );
    circleR = Math.max(10, Math.abs(circleY - northY));
    // The actual capture area: the same lat/lon bbox the place filter uses.
    const b = placePointBbox(placeLat, placeLng, radiusM);
    const [x0, y0] = project(b.min_lng, b.max_lat, viewBbox, viewW, viewH);
    const [x1, y1] = project(b.max_lng, b.min_lat, viewBbox, viewW, viewH);
    squareBox = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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
              fill={muted ? mutedFill : "rgba(173, 53, 250, 0.28)"}
              stroke="none"
            />
          );
        })}

      {sketch.districts.map((d, idx) => {
        const isHighlighted = d.district_id === highlightDistrict;
        const pathD = d.rings
          .map((ring) => ringToPath(ring, viewBbox, viewW, viewH))
          .join(" ");
        if (!pathD) return null;
        return (
          <path
            key={`${d.district_id}-${idx}`}
            d={pathD}
            fill={
              muted
                ? "none"
                : isHighlighted
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
            stroke={
              muted
                ? isHighlighted
                  ? "var(--brand-primary)"
                  : mutedStroke
                : isHighlighted
                  ? "var(--brand-primary)"
                  : "rgba(148, 163, 184, 0.65)"
            }
            strokeWidth={muted ? (isHighlighted ? 2 : 1) : isHighlighted ? 2.5 : 1}
            strokeOpacity={muted && isHighlighted ? 0.85 : undefined}
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
              stroke="var(--brand-primary)"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeOpacity={0.85}
            />
          );
        })}

      {isPlaceScope &&
        circleX != null &&
        circleY != null &&
        circleR != null &&
        (muted ? (
          <>
            {/* Dotted purple square = the bbox capture area (unfilled so the
                dots landing inside stay visible). */}
            {squareBox && (
              <rect
                x={squareBox.x}
                y={squareBox.y}
                width={squareBox.w}
                height={squareBox.h}
                fill="none"
                stroke="var(--brand-primary)"
                strokeWidth={2}
                strokeDasharray="6 5"
                strokeOpacity={0.85}
              />
            )}
            <circle cx={circleX} cy={circleY} r={7} fill="var(--brand-primary)" opacity={0.9} />
            {placeName && (
              <text
                x={circleX}
                y={circleY - 16}
                textAnchor="middle"
                fontSize="18"
                fontWeight="700"
                fill="var(--brand-primary)"
                stroke={mutedDark ? "rgba(0, 0, 0, 0.75)" : "rgba(255, 255, 255, 0.9)"}
                strokeWidth="4"
                paintOrder="stroke"
                style={{ letterSpacing: "0.01em" }}
              >
                {placeName}
              </text>
            )}
          </>
        ) : (
          <>
            <circle
              cx={circleX}
              cy={circleY}
              r={circleR}
              fill="var(--brand-primary)"
              fillOpacity={0.25}
              stroke="var(--brand-primary)"
              strokeWidth={2}
            />
            <circle cx={circleX} cy={circleY} r={6} fill="var(--brand-primary)" />
          </>
        ))}
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

  /**
   * View bbox: zoom to highlighted district or place radius, else full city.
   * Aspect-fitted in Mercator space so it matches the static basemap exactly.
   */
  const viewBbox = useMemo(
    (): MapBbox | null =>
      computeScopeViewBbox({
        sketch,
        highlightDistrict,
        isPlaceScope,
        placeLat,
        placeLng,
        placeRadiusM,
      }),
    [sketch, highlightDistrict, isPlaceScope, placeLat, placeLng, placeRadiusM],
  );

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
