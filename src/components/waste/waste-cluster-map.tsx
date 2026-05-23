"use client"

import { useMemo, useEffect, useRef, useState } from "react"
import type { WasteFinding } from "@/lib/apiClient"
import { escapeHtml } from "./waste-utils"
import { useTheme } from "@/contexts/ThemeContext"
import "@/components/AnomalyMap.css"

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""

interface MapboxMap {
  on: (event: string, layerOrCb: string | (() => void), cb?: (e: MapboxClickEvent) => void) => void
  addSource: (id: string, source: Record<string, unknown>) => void
  addLayer: (layer: Record<string, unknown>) => void
  addControl: (control: unknown, position: string) => void
  getCanvas: () => HTMLElement
  fitBounds: (bounds: [[number, number], [number, number]], opts: Record<string, unknown>) => void
  remove: () => void
}

interface MapboxClickEvent {
  features?: { properties: Record<string, unknown>; geometry: { coordinates: number[] } }[]
}

interface WindowWithMapbox extends Window {
  mapboxgl?: {
    accessToken: string
    Map: new (opts: Record<string, unknown>) => MapboxMap
    NavigationControl: new (opts: Record<string, unknown>) => unknown
    Popup: new (opts: Record<string, unknown>) => {
      setLngLat: (coords: number[]) => { setHTML: (html: string) => { addTo: (map: MapboxMap) => void } }
    }
  }
}

const CITY_CENTERS: Record<string, { center: [number, number]; zoom: number }> = {
  sf: { center: [-122.4194, 37.7749], zoom: 12 },
  chicago: { center: [-87.6298, 41.8781], zoom: 11 },
}

const SF_CITY_IDS = new Set([1, 2, 56837])
const CHICAGO_CITY_IDS = new Set([3, 56838])

function getCityMapDefaults(cityId?: number): { center: [number, number]; zoom: number } {
  if (cityId && CHICAGO_CITY_IDS.has(cityId)) return CITY_CENTERS.chicago
  return CITY_CENTERS.sf
}

interface ClusterPoint {
  lat: number
  lon: number
  count: number
  neighborhood: string
  type: string
  severity: string
}

function extractCoordinates(text: string): [number, number] | null {
  const patterns = [
    /\(([-+]?\d+(?:\.\d+)?),\s*([-+]?\d+(?:\.\d+)?)\)/,
    /near\s+([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)/i,
    /lat(?:itude)?[:=]\s*([-+]?\d+(?:\.\d+)?)[^\d-+]+lon(?:gitude)?[:=]\s*([-+]?\d+(?:\.\d+)?)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue

    let a = parseFloat(match[1])
    let b = parseFloat(match[2])
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue

    // Most findings use (lat, lon). If detected as (lon, lat), swap.
    if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
      ;[a, b] = [b, a]
    }

    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      return [a, b]
    }
  }
  return null
}

function parseClusterFromFinding(finding: WasteFinding): ClusterPoint | null {
  const description =
    typeof finding.description === "string" ? finding.description : ""
  const metric = typeof finding.metric === "string" ? finding.metric : ""
  const metricDetail =
    typeof finding.metricDetail === "string" ? finding.metricDetail : ""
  const coords = extractCoordinates(description)
  if (!coords) return null

  const [lat, lon] = coords
  const countMatch = `${metric} ${metricDetail}`.match(/(\d+)/)
  const count = countMatch ? parseInt(countMatch[1], 10) : 5

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return {
    lat,
    lon,
    count,
    neighborhood: finding.entity,
    type: finding.metricDetail,
    severity: finding.severity,
  }
}

interface WasteClusterMapProps {
  findings: WasteFinding[]
  cityId?: number
}

export function WasteClusterMap({ findings, cityId }: WasteClusterMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<MapboxMap | null>(null)
  const [mapboxLoaded, setMapboxLoaded] = useState(false)
  const { theme } = useTheme()

  const clusters = useMemo(() => {
    return findings
      .map(parseClusterFromFinding)
      .filter((c): c is ClusterPoint => c !== null)
  }, [findings])

  const totalComplaints = useMemo(
    () => clusters.reduce((sum, c) => sum + c.count, 0),
    [clusters]
  )

  // Load Mapbox GL JS dynamically (same pattern as AnomalyMap)
  useEffect(() => {
    if (typeof window === "undefined") return
    if ((window as unknown as WindowWithMapbox).mapboxgl) {
      queueMicrotask(() => setMapboxLoaded(true))
      return
    }

    const cssLink = document.createElement("link")
    cssLink.href =
      "https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css"
    cssLink.rel = "stylesheet"
    document.head.appendChild(cssLink)

    const script = document.createElement("script")
    script.src =
      "https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.js"
    script.async = true
    script.onload = () => setMapboxLoaded(true)
    document.head.appendChild(script)
  }, [])

  // Create / update map
  useEffect(() => {
    if (!mapboxLoaded || clusters.length === 0 || !mapContainerRef.current)
      return

    if (!MAPBOX_TOKEN) return

    const mapboxgl = (window as unknown as WindowWithMapbox).mapboxgl
    if (!mapboxgl) return

    mapboxgl.accessToken = MAPBOX_TOKEN

    // Cleanup previous
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const mapStyle =
      theme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11"

    const defaults = getCityMapDefaults(cityId)
    let map
    try {
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: defaults.center,
        zoom: defaults.zoom,
        attributionControl: false,
      })
    } catch (error) {
      return
    }

    mapInstanceRef.current = map

    map.on("load", () => {
      // Build GeoJSON from cluster points
      const geojson = {
        type: "FeatureCollection" as const,
        features: clusters.map((c, i) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [c.lon, c.lat],
          },
          properties: {
            count: c.count,
            neighborhood: c.neighborhood,
            type: c.type,
            severity: c.severity,
            id: i,
          },
        })),
      }

      map.addSource("waste-clusters", {
        type: "geojson",
        data: geojson,
      })

      // Outer glow ring
      map.addLayer({
        id: "waste-clusters-glow",
        type: "circle",
        source: "waste-clusters",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            5, 22,
            10, 30,
            15, 38,
            25, 48,
          ],
          "circle-color": "#ad35fa",
          "circle-opacity": 0.12,
          "circle-blur": 0.6,
        },
      })

      // Main cluster circle
      map.addLayer({
        id: "waste-clusters-circle",
        type: "circle",
        source: "waste-clusters",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            5, 14,
            10, 20,
            15, 26,
            25, 34,
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            5, "#c084fc",   // purple-400
            10, "#ad35fa",  // brand primary
            15, "#9333ea",  // purple-600
            25, "#7e22ce",  // purple-700
          ],
          "circle-opacity": 0.75,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.9,
        },
      })

      // Count labels
      map.addLayer({
        id: "waste-clusters-label",
        type: "symbol",
        source: "waste-clusters",
        layout: {
          "text-field": ["to-string", ["get", "count"]],
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
        },
      })

      // Neighborhood labels below
      map.addLayer({
        id: "waste-clusters-neighborhood",
        type: "symbol",
        source: "waste-clusters",
        layout: {
          "text-field": ["get", "neighborhood"],
          "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"],
          "text-size": 11,
          "text-offset": [0, 2.4],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#6b7280",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      })

      // Popup on click
      map.on("click", "waste-clusters-circle", (e: MapboxClickEvent) => {
        if (!e.features?.length) return
        const props = e.features[0].properties
        const coords = e.features[0].geometry.coordinates.slice()

        new mapboxgl.Popup({ offset: 15, className: "waste-cluster-popup" })
          .setLngLat(coords)
          .setHTML(
            `<div style="font-family:Inter,sans-serif;font-size:13px;line-height:1.5">
              <div style="font-weight:600;margin-bottom:2px">${escapeHtml(String(props.neighborhood ?? ""))}</div>
              <div style="color:#6b7280">${escapeHtml(String(props.count ?? ""))} complaints</div>
              <div style="color:#9ca3af;font-size:11px">${escapeHtml(String(props.type ?? ""))}</div>
            </div>`
          )
          .addTo(map)
      })

      // Cursor pointer on hover
      map.on("mouseenter", "waste-clusters-circle", () => {
        map.getCanvas().style.cursor = "pointer"
      })
      map.on("mouseleave", "waste-clusters-circle", () => {
        map.getCanvas().style.cursor = ""
      })

      // Fit bounds
      if (clusters.length > 1) {
        const lats = clusters.map((c) => c.lat)
        const lons = clusters.map((c) => c.lon)
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 60, maxZoom: 14, duration: 0 }
        )
      }
    })

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "top-right"
    )

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [mapboxLoaded, clusters, cityId, theme])

  if (clusters.length === 0) {
    return (
      <div className="anomaly-map-wrapper" style={{ marginBottom: "1.5rem" }}>
        <div className="anomaly-map-header">
          <span className="anomaly-map-title">Infrastructure Complaint Hotspots</span>
          <span className="anomaly-map-count">No mappable coordinates found for current findings</span>
        </div>
      </div>
    )
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="anomaly-map-wrapper" style={{ marginBottom: "1.5rem" }}>
        <div className="anomaly-map-header">
          <span className="anomaly-map-title">Infrastructure Complaint Hotspots</span>
          <span className="anomaly-map-count">Map token missing (`NEXT_PUBLIC_MAPBOX_TOKEN`)</span>
        </div>
      </div>
    )
  }

  return (
    <div className="anomaly-map-wrapper" style={{ marginBottom: "1.5rem" }}>
      <div className="anomaly-map-header">
        <span className="anomaly-map-title">
          Infrastructure Complaint Hotspots
        </span>
        <span className="anomaly-map-count">
          {totalComplaints} complaints in {clusters.length} clusters
          &bull; last 90 days
        </span>
      </div>
      <div
        ref={mapContainerRef}
        className="anomaly-map-container"
        style={{ height: 360 }}
      />
    </div>
  )
}
