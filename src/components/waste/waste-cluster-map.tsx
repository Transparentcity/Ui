"use client"

import { useMemo, useEffect, useRef, useState } from "react"
import type { WasteFinding } from "@/lib/apiClient"
import "@/components/AnomalyMap.css"

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""

// SF default center
const SF_CENTER: [number, number] = [-122.4194, 37.7749]
const SF_ZOOM = 12

interface ClusterPoint {
  lat: number
  lon: number
  count: number
  neighborhood: string
  type: string
  severity: string
}

function parseClusterFromFinding(finding: WasteFinding): ClusterPoint | null {
  const coordMatch = finding.description.match(
    /\((\d+\.\d+),\s*(-?\d+\.\d+)\)/
  )
  if (!coordMatch) return null

  const lat = parseFloat(coordMatch[1])
  const lon = parseFloat(coordMatch[2])
  const countMatch = finding.metric.match(/(\d+)/)
  const count = countMatch ? parseInt(countMatch[1], 10) : 5

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
}

export function WasteClusterMap({ findings }: WasteClusterMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const [mapboxLoaded, setMapboxLoaded] = useState(false)

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
    if ((window as any).mapboxgl) {
      setMapboxLoaded(true)
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

    const mapboxgl = (window as any).mapboxgl
    if (!mapboxgl) return

    mapboxgl.accessToken = MAPBOX_TOKEN

    // Cleanup previous
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: SF_CENTER,
      zoom: SF_ZOOM,
      attributionControl: false,
    })

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
      map.on("click", "waste-clusters-circle", (e: any) => {
        if (!e.features?.length) return
        const props = e.features[0].properties
        const coords = e.features[0].geometry.coordinates.slice()

        new mapboxgl.Popup({ offset: 15, className: "waste-cluster-popup" })
          .setLngLat(coords)
          .setHTML(
            `<div style="font-family:Inter,sans-serif;font-size:13px;line-height:1.5">
              <div style="font-weight:600;margin-bottom:2px">${props.neighborhood}</div>
              <div style="color:#6b7280">${props.count} complaints</div>
              <div style="color:#9ca3af;font-size:11px">${props.type}</div>
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
  }, [mapboxLoaded, clusters])

  if (clusters.length === 0) return null

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
