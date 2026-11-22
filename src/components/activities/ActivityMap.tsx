"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useTheme } from "@/contexts/ThemeContext";
import { formatAge, formatDate, type ActivityTarget } from "@/lib/activities";

import "@/components/AnomalyMap.css";
import styles from "./ActivityPage.module.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
// Same Mapbox GL build and brand purple as the site's other point maps (AnomalyMap).
const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css";
const BRAND = "#ad35fa";

/* eslint-disable @typescript-eslint/no-explicit-any */
type MapboxGl = any;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** GeoJSON points for the locations that have coordinates, ranked first to last. */
export function targetsGeoJson(targets: ActivityTarget[]) {
  return {
    type: "FeatureCollection" as const,
    features: targets
      .filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lon))
      .map((t) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [t.lon as number, t.lat as number] },
        properties: {
          rank: t.rank,
          requests: t.requests,
          address: t.address,
          ids: t.request_ids.join(", "),
          since: formatDate(t.first_reported),
          age: formatAge(t.days_open),
        },
      })),
  };
}

function loadMapbox(): Promise<MapboxGl> {
  const w = window as unknown as { mapboxgl?: MapboxGl };
  if (w.mapboxgl) return Promise.resolve(w.mapboxgl);
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPBOX_CSS}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = MAPBOX_CSS;
      document.head.appendChild(css);
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${MAPBOX_JS}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(w.mapboxgl));
    script.addEventListener("error", () => reject(new Error("map library")));
    if (!existing) {
      script.src = MAPBOX_JS;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

/**
 * The ranked locations on a street map (spec block 4). Dot size follows the
 * number of unresolved requests; the top ten carry their rank. Click a dot
 * for the address and request numbers. Basemap follows the site theme.
 */
export default function ActivityMap({
  targets,
  areaLabel,
  sourceUrl,
  height = 380,
}: {
  targets: ActivityTarget[];
  areaLabel: string;
  sourceUrl: string;
  height?: number;
}) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const data = useMemo(() => targetsGeoJson(targets), [targets]);
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(!MAPBOX_TOKEN);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !ref.current || data.features.length === 0) return;
    let map: MapboxGl = null;
    let cancelled = false;
    loadMapbox()
      .then((mapboxgl) => {
        if (cancelled || !ref.current) return;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        const lons = data.features.map((f) => f.geometry.coordinates[0]);
        const lats = data.features.map((f) => f.geometry.coordinates[1]);
        map = new mapboxgl.Map({
          container: ref.current,
          style: dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11",
          bounds: [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          fitBoundsOptions: { padding: 40, maxZoom: 16 },
          attributionControl: false,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
        map.on("error", () => setFailed(true));
        map.on("load", () => {
          map.addSource("targets", { type: "geojson", data });
          map.addLayer({
            id: "targets",
            type: "circle",
            source: "targets",
            paint: {
              "circle-color": BRAND,
              "circle-opacity": 0.85,
              "circle-stroke-color": dark ? "#0d0d0f" : "#ffffff",
              "circle-stroke-width": 1.5,
              "circle-radius": ["interpolate", ["linear"], ["get", "requests"], 1, 6, 6, 13],
            },
          });
          map.addLayer({
            id: "target-ranks",
            type: "symbol",
            source: "targets",
            filter: ["<=", ["get", "rank"], 10],
            layout: { "text-field": ["to-string", ["get", "rank"]], "text-size": 11, "text-allow-overlap": true },
            paint: { "text-color": "#ffffff" },
          });
          map.on("click", "targets", (e: any) => {
            const f = e.features?.[0];
            if (!f) return;
            const p = f.properties;
            new mapboxgl.Popup({ offset: 10, maxWidth: "260px" })
              .setLngLat(f.geometry.coordinates)
              .setHTML(
                `<strong>${escapeHtml(String(p.rank))}. ${escapeHtml(p.address)}</strong><br/>` +
                  `${escapeHtml(String(p.requests))} unresolved, open since ${escapeHtml(p.since)} (${escapeHtml(p.age)})<br/>` +
                  `<span style="opacity:.75">Requests ${escapeHtml(p.ids)}</span>`
              )
              .addTo(map);
          });
          map.on("mouseenter", "targets", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "targets", () => (map.getCanvas().style.cursor = ""));
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [data, dark]);

  if (data.features.length === 0) return null;

  return (
    <figure className={styles.mapFigure}>
      <div className={`anomaly-map-wrapper${dark ? " anomaly-map-wrapper--dark" : ""}`}>
        <div className="anomaly-map-header">
          <span className="anomaly-map-title">Where the unresolved requests are</span>
          <span className="anomaly-map-count">
            {data.features.length} location{data.features.length === 1 ? "" : "s"} · {areaLabel}
          </span>
        </div>
        {failed ? (
          <div className="anomaly-map-container" style={{ height }}>
            <div className="anomaly-map-error">
              <span>Map unavailable. The list below has every location.</span>
            </div>
          </div>
        ) : (
          <div
            ref={ref}
            className="anomaly-map-container"
            style={{ height }}
            role="region"
            aria-label={`Map of ${data.features.length} pothole locations in ${areaLabel}`}
          />
        )}
      </div>
      <figcaption className={styles.mapCaption}>
        <span>
          Each dot is a location with unresolved pothole requests; bigger dots have more. Numbers match the list
          below.
        </span>
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          Source
        </a>
      </figcaption>
    </figure>
  );
}
