"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { getPublicShapeLayerInstance } from "@/lib/apiClient";
import {
  useCityShapeLayers,
  useUpdateShapeLayerInstance,
  useDeleteShapeLayerInstance,
  useShapeLayerInstantiationStatus,
  useRetryMissingShapeLayers,
  useSetOfficialDistrictLayer,
} from "@/lib/hooks/useCities";
import styles from "./ShapeLayersSection.module.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

/** Categorical palette for previewing multiple layers at once. */
const LAYER_COLORS = [
  "#2563eb", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
  "#f97316", // orange
  "#14b8a6", // teal
];

type GeometryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: GeoJSON.FeatureCollection };

type BoundsBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** Walk any GeoJSON coordinate array (point / line / polygon, nested) and extend bounds. */
function extendBounds(box: BoundsBox, coords: any): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number") {
    if (coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
      box.minLng = Math.min(box.minLng, coords[0]);
      box.minLat = Math.min(box.minLat, coords[1]);
      box.maxLng = Math.max(box.maxLng, coords[0]);
      box.maxLat = Math.max(box.maxLat, coords[1]);
    }
    return;
  }
  for (const child of coords) extendBounds(box, child);
}

function boundsForFeatureCollections(
  collections: GeoJSON.FeatureCollection[]
): [[number, number], [number, number]] | null {
  const box: BoundsBox = {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity,
  };
  for (const fc of collections) {
    for (const feature of fc.features || []) {
      const geom: any = feature?.geometry;
      if (!geom) continue;
      if (geom.type === "GeometryCollection") {
        for (const g of geom.geometries || []) extendBounds(box, g.coordinates);
      } else {
        extendBounds(box, geom.coordinates);
      }
    }
  }
  if (!Number.isFinite(box.minLng) || !Number.isFinite(box.minLat)) return null;
  return [
    [box.minLng, box.minLat],
    [box.maxLng, box.maxLat],
  ];
}

const sourceId = (instanceId: number) => `shape-preview-src-${instanceId}`;
const fillLayerId = (instanceId: number) => `shape-preview-fill-${instanceId}`;
const lineLayerId = (instanceId: number) => `shape-preview-line-${instanceId}`;
const circleLayerId = (instanceId: number) => `shape-preview-circle-${instanceId}`;

interface ShapeLayersSectionProps {
  cityId: number;
}

/**
 * Shape Layers section of the City Structure admin tab.
 *
 * Left pane: layer instances with management controls (official layer,
 * identifier aliases, delete). Right pane: live Mapbox preview — toggle any
 * layer on/off to see its polygons on the actual map.
 */
export default function ShapeLayersSection({ cityId }: ShapeLayersSectionProps) {
  const { theme } = useTheme();
  const { data: shapeLayers, isLoading, refetch } = useCityShapeLayers(cityId, false);
  const { data: instantiationStatus, refetch: refetchStatus } =
    useShapeLayerInstantiationStatus(cityId);
  const updateMutation = useUpdateShapeLayerInstance(cityId);
  const deleteMutation = useDeleteShapeLayerInstance(cityId);
  const retryMutation = useRetryMissingShapeLayers(cityId);
  const setOfficialMutation = useSetOfficialDistrictLayer(cityId);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingAliases, setEditingAliases] = useState<string[]>([]);
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const [geometries, setGeometries] = useState<Record<number, GeometryState>>({});

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const addedIdsRef = useRef<Set<number>>(new Set());
  const handlersRef = useRef<Map<number, { move: (e: any) => void; leave: () => void }>>(
    new Map()
  );
  const [mapReady, setMapReady] = useState(false);
  const autoSelectedRef = useRef(false);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const instances = useMemo(
    () =>
      (shapeLayers || [])
        .filter((layer: any) => layer.instance !== null)
        .map((layer: any) => layer.instance),
    [shapeLayers]
  );

  const colorForInstance = useCallback(
    (instanceId: number): string => {
      const index = instances.findIndex((i: any) => i.id === instanceId);
      return LAYER_COLORS[(index >= 0 ? index : 0) % LAYER_COLORS.length];
    },
    [instances]
  );

  // ---------------------------------------------------------------------
  // Map lifecycle
  // ---------------------------------------------------------------------

  const mapStyleUrl =
    theme === "dark"
      ? "mapbox://styles/mapbox/dark-v11"
      : "mapbox://styles/mapbox/light-v11";
  const currentStyleRef = useRef<string | null>(null);
  const desiredStyleRef = useRef(mapStyleUrl);
  desiredStyleRef.current = mapStyleUrl;

  // Callback ref: the container only mounts once layers have loaded, and may
  // unmount/remount as the list empties — create/destroy the map accordingly.
  const setMapContainer = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && !mapRef.current && mapboxToken) {
        const map = new mapboxgl.Map({
          container: node,
          style: desiredStyleRef.current,
          center: [-98.5795, 39.8283], // neutral US center until a layer is shown
          zoom: 3,
          attributionControl: false,
        });
        currentStyleRef.current = desiredStyleRef.current;
        map.addControl(
          new mapboxgl.NavigationControl({ showCompass: false }),
          "top-right"
        );
        map.on("load", () => setMapReady(true));
        // Style changes (theme switch) wipe custom sources; re-sync afterwards.
        map.on("style.load", () => {
          addedIdsRef.current.clear();
          setMapReady(true);
        });
        mapRef.current = map;
      } else if (!node && mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          /* ignore */
        }
        mapRef.current = null;
        popupRef.current = null;
        addedIdsRef.current.clear();
        handlersRef.current.clear();
        setMapReady(false);
      }
    },
    [mapboxToken]
  );

  // Theme switch → swap basemap style (sources re-added via style.load handler)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentStyleRef.current === mapStyleUrl) return;
    currentStyleRef.current = mapStyleUrl;
    setMapReady(false);
    map.setStyle(mapStyleUrl);
  }, [mapStyleUrl]);

  // Auto-show the official district layer (or first layer) on first load
  useEffect(() => {
    if (autoSelectedRef.current || instances.length === 0) return;
    autoSelectedRef.current = true;
    const official = instances.find((i: any) => i.is_official_district_layer);
    setVisibleIds([(official ?? instances[0]).id]);
  }, [instances]);

  // Fetch geometry for visible layers that we haven't loaded yet
  useEffect(() => {
    for (const id of visibleIds) {
      if (geometries[id]) continue;
      setGeometries((prev) => ({ ...prev, [id]: { status: "loading" } }));
      getPublicShapeLayerInstance(id)
        .then((res) => {
          const data = res?.instance?.geometry_data;
          setGeometries((prev) => ({
            ...prev,
            [id]: data
              ? { status: "ready", data }
              : { status: "error", message: "No geometry stored for this layer" },
          }));
        })
        .catch((err: any) => {
          setGeometries((prev) => ({
            ...prev,
            [id]: { status: "error", message: err?.message || "Failed to load geometry" },
          }));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds]);

  const removeInstanceFromMap = useCallback((map: mapboxgl.Map, id: number) => {
    for (const layerId of [fillLayerId(id), lineLayerId(id), circleLayerId(id)]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    const handlers = handlersRef.current.get(id);
    if (handlers) {
      map.off("mousemove", fillLayerId(id), handlers.move);
      map.off("mouseleave", fillLayerId(id), handlers.leave);
      handlersRef.current.delete(id);
    }
    if (map.getSource(sourceId(id))) map.removeSource(sourceId(id));
    addedIdsRef.current.delete(id);
  }, []);

  // Sync map sources/layers with visible + loaded geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const visibleSet = new Set(visibleIds);

    // Remove layers that are no longer visible
    for (const id of Array.from(addedIdsRef.current)) {
      if (!visibleSet.has(id)) removeInstanceFromMap(map, id);
    }

    // Add newly visible layers whose geometry is ready
    for (const id of visibleIds) {
      if (addedIdsRef.current.has(id)) continue;
      const geom = geometries[id];
      if (!geom || geom.status !== "ready") continue;
      const instance = instances.find((i: any) => i.id === id);
      if (!instance) continue;

      const color = colorForInstance(id);
      map.addSource(sourceId(id), { type: "geojson", data: geom.data });
      map.addLayer({
        id: fillLayerId(id),
        type: "fill",
        source: sourceId(id),
        paint: { "fill-color": color, "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: lineLayerId(id),
        type: "line",
        source: sourceId(id),
        paint: { "line-color": color, "line-width": 1.5 },
      });
      map.addLayer({
        id: circleLayerId(id),
        type: "circle",
        source: sourceId(id),
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": color,
          "circle-radius": 4,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });

      const layerName = instance.shapefile_name || instance.structure_type || `Layer ${id}`;
      const identifierField = instance.identifier_field as string | null;
      const move = (e: any) => {
        const feature = e.features?.[0];
        if (!feature) return;
        map.getCanvas().style.cursor = "pointer";
        const props = feature.properties || {};
        const identifierValue =
          identifierField != null && props[identifierField] != null
            ? String(props[identifierField])
            : null;
        if (!popupRef.current) {
          popupRef.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 8,
          });
        }
        const html = `
          <div style="font-family: inherit; font-size: 12px;">
            <div style="font-weight: 600;">${layerName}</div>
            ${
              identifierValue !== null
                ? `<div style="margin-top: 2px;"><code>${identifierField}</code>: ${identifierValue}</div>`
                : ""
            }
          </div>`;
        popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
      };
      const leave = () => {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
      };
      map.on("mousemove", fillLayerId(id), move);
      map.on("mouseleave", fillLayerId(id), leave);
      handlersRef.current.set(id, { move, leave });

      addedIdsRef.current.add(id);
    }
  }, [visibleIds, geometries, instances, mapReady, colorForInstance, removeInstanceFromMap]);

  // Fit bounds whenever the set of rendered layers changes
  const readyVisibleKey = visibleIds
    .filter((id) => geometries[id]?.status === "ready")
    .sort((a, b) => a - b)
    .join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !readyVisibleKey) return;
    const collections = readyVisibleKey
      .split(",")
      .map((id) => geometries[Number(id)])
      .filter((g): g is { status: "ready"; data: GeoJSON.FeatureCollection } => g?.status === "ready")
      .map((g) => g.data);
    const bounds = boundsForFeatureCollections(collections);
    if (bounds) {
      map.fitBounds(bounds, { padding: 32, maxZoom: 13, duration: 500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyVisibleKey, mapReady]);

  // ---------------------------------------------------------------------
  // Layer management handlers
  // ---------------------------------------------------------------------

  const toggleVisible = (instanceId: number) => {
    setVisibleIds((prev) =>
      prev.includes(instanceId)
        ? prev.filter((id) => id !== instanceId)
        : [...prev, instanceId]
    );
  };

  const handleEditAliases = (instance: any) => {
    setEditingId(instance.id);
    setEditingAliases(instance.identifier_field_aliases || []);
  };

  const handleSaveAliases = async (instanceId: number) => {
    try {
      const cleanAliases = editingAliases.filter((a) => a.trim() !== "");
      await updateMutation.mutateAsync({
        instanceId,
        updates: { identifier_field_aliases: cleanAliases },
      });
      setEditingId(null);
      setEditingAliases([]);
      await refetch();
    } catch (err: any) {
      alert("Failed to update aliases: " + err.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingAliases([]);
  };

  const handleDeleteShapeLayer = async (instance: any) => {
    const label =
      instance.shapefile_name || instance.structure_type || `shape layer ${instance.id}`;
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;

    try {
      await deleteMutation.mutateAsync(instance.id);
      if (editingId === instance.id) handleCancelEdit();
      setVisibleIds((prev) => prev.filter((id) => id !== instance.id));
      await refetch();
      alert(`Deleted shape layer "${label}".`);
    } catch (err: any) {
      alert("Failed to delete shape layer: " + err.message);
    }
  };

  const handleRetryMissing = async () => {
    try {
      const result = await retryMutation.mutateAsync();
      await Promise.all([refetch(), refetchStatus()]);
      alert(result.message || "Retry job started.");
    } catch (err: any) {
      alert("Failed to retry missing shape layers: " + err.message);
    }
  };

  const handleSetOfficial = async (instanceId: number) => {
    try {
      await setOfficialMutation.mutateAsync(instanceId);
      await Promise.all([refetch(), refetchStatus()]);
    } catch (err: any) {
      alert("Failed to set official district layer: " + err.message);
    }
  };

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  const statusObj =
    instantiationStatus && !Array.isArray(instantiationStatus) ? instantiationStatus : null;
  const missingRequired = statusObj?.missing_required ?? 0;
  const missingOptional = statusObj?.missing_optional ?? 0;
  const hasMissing = missingRequired + missingOptional > 0;

  const anyVisibleLoading = visibleIds.some((id) => geometries[id]?.status === "loading");
  const visibleLegendItems = visibleIds
    .map((id) => instances.find((i: any) => i.id === id))
    .filter(Boolean);

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h4 className={styles.title}>
          Shape Layers {instances.length > 0 ? `(${instances.length})` : ""}
        </h4>
        {hasMissing && (
          <button
            className={styles.retryButton}
            onClick={handleRetryMissing}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending
              ? "Retrying..."
              : `Retry Missing (${missingRequired + missingOptional})`}
          </button>
        )}
      </div>

      {/* Template instantiation status */}
      {statusObj && statusObj.templates.length > 0 && (
        <div className={styles.coverageBox}>
          <div className={styles.coverageHeader}>Template Coverage</div>
          <div className={styles.coverageChips}>
            {statusObj.templates.map((t) => {
              const chipStyle = {
                background: t.has_instance
                  ? t.is_official_district_layer
                    ? "#1d4ed8"
                    : "var(--success)"
                  : t.is_required
                  ? "var(--error)"
                  : "var(--text-muted)",
              };
              const title = `${t.display_name}${t.is_required ? " (required)" : " (optional)"}${
                t.is_official_district_layer ? " — official district layer" : ""
              }${!t.has_instance ? " — missing" : " — click to toggle map preview"}`;
              const label = (
                <>
                  {t.is_official_district_layer ? "★ " : ""}
                  {t.display_name}
                  {!t.has_instance && (t.is_required ? " ✕" : " –")}
                </>
              );
              return t.has_instance && t.instance_id ? (
                <button
                  key={t.template_id}
                  className={`${styles.chip} ${styles.chipClickable}`}
                  style={chipStyle}
                  title={title}
                  onClick={() => toggleVisible(t.instance_id!)}
                >
                  {label}
                </button>
              ) : (
                <span key={t.template_id} className={styles.chip} style={chipStyle} title={title}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.helpText}>
        Shape layers define geographic boundaries for choropleth maps and metric breakdowns.
        Toggle a layer on the left to preview its shapes on the map. The{" "}
        <strong>official district layer ★</strong> is the source of truth for district navigation
        and metric filtering — its <strong>identifier field + aliases</strong> are the field names
        the metric engine looks for in city datasets (e.g., <code>supervisor_district</code>,{" "}
        <code>sup_dist_num</code>).
      </div>

      {isLoading ? (
        <div className={styles.loadingBox}>Loading shape layers...</div>
      ) : instances.length === 0 ? (
        <div className={styles.emptyBox}>
          No shape layers found. Re-structure the city to fetch shape layers, or click
          &quot;Retry Missing&quot; above.
        </div>
      ) : (
        <div className={styles.layout}>
          {/* Layer list */}
          <div className={styles.layerList}>
            {instances.map((instance: any) => {
              const isVisible = visibleIds.includes(instance.id);
              const color = colorForInstance(instance.id);
              const geomState = geometries[instance.id];
              return (
                <div
                  key={instance.id}
                  className={`${styles.layerCard} ${isVisible ? styles.layerCardVisible : ""}`}
                >
                  <div className={styles.layerCardHeader}>
                    <button
                      className={styles.layerToggleRow}
                      onClick={() => toggleVisible(instance.id)}
                      title={isVisible ? "Hide on map" : "Show on map"}
                    >
                      <span
                        className={`${styles.colorDot} ${isVisible ? "" : styles.colorDotOff}`}
                        style={isVisible ? { background: color, borderColor: color } : undefined}
                      />
                      <span>
                        <span className={styles.layerName}>
                          {instance.is_official_district_layer && (
                            <span className={styles.officialStar} title="Official district layer">
                              ★
                            </span>
                          )}
                          {instance.shapefile_name || instance.structure_type}
                          {isVisible && geomState?.status === "loading" && (
                            <span style={{ fontWeight: 400, fontSize: "11px" }}>loading…</span>
                          )}
                        </span>
                        <span className={styles.layerMeta} style={{ display: "block" }}>
                          ID: {instance.id} | Type: {instance.structure_type} | Features:{" "}
                          {instance.feature_count || "?"} | Status:{" "}
                          <span
                            style={{
                              color: instance.status === "active" ? "var(--success)" : "var(--warning)",
                            }}
                          >
                            {instance.status}
                          </span>
                        </span>
                      </span>
                    </button>
                    {editingId !== instance.id && (
                      <div className={styles.layerActions}>
                        {!instance.is_official_district_layer && (
                          <button
                            className={`${styles.actionButton} ${styles.setOfficialButton}`}
                            onClick={() => handleSetOfficial(instance.id)}
                            disabled={setOfficialMutation.isPending}
                            title="Set as the official elected-representative district layer"
                          >
                            Set Official
                          </button>
                        )}
                        <button
                          className={`${styles.actionButton} ${styles.editButton}`}
                          onClick={() => handleEditAliases(instance)}
                          disabled={deleteMutation.isPending}
                          title={
                            instance.is_official_district_layer
                              ? "Edit dataset field name aliases — used by the metric engine for district filtering"
                              : "Edit alternative field names for this layer's identifier"
                          }
                        >
                          Edit Field Aliases
                        </button>
                        <button
                          className={`${styles.actionButton} ${styles.deleteButton}`}
                          onClick={() => handleDeleteShapeLayer(instance)}
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>

                  {isVisible && geomState?.status === "error" && (
                    <div className={styles.geomError}>
                      Could not load geometry: {geomState.message}
                    </div>
                  )}

                  {/* Identifier field info */}
                  <div className={styles.identifierRow}>
                    <span>
                      <strong>Identifier Field:</strong>{" "}
                      <code>{instance.identifier_field || "(not set)"}</code>
                    </span>
                    {instance.identifier_field_aliases?.length > 0 && (
                      <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
                        + aliases: {instance.identifier_field_aliases.join(", ")}
                      </span>
                    )}
                    {instance.is_official_district_layer && (
                      <span style={{ fontSize: "10px", color: "#1d4ed8", fontStyle: "italic" }}>
                        ↳ used for metric district filtering
                      </span>
                    )}
                  </div>

                  {/* Aliases display/edit */}
                  {editingId === instance.id ? (
                    <div className={styles.aliasEditor}>
                      <div className={styles.aliasEditorLabel}>
                        Dataset Field Aliases
                        {instance.is_official_district_layer && (
                          <span style={{ fontWeight: 400, marginLeft: "6px", color: "#1d4ed8" }}>
                            — these are the field names the metric engine looks for in datasets to
                            find district data
                          </span>
                        )}
                        :
                      </div>
                      <div className={styles.aliasRows}>
                        {editingAliases.map((alias, index) => (
                          <div key={index} className={styles.aliasRow}>
                            <input
                              type="text"
                              className={styles.aliasInput}
                              value={alias}
                              onChange={(e) => {
                                const newAliases = [...editingAliases];
                                newAliases[index] = e.target.value;
                                setEditingAliases(newAliases);
                              }}
                              placeholder="e.g., pddistrict"
                            />
                            <button
                              className={styles.aliasRemoveButton}
                              onClick={() =>
                                setEditingAliases(editingAliases.filter((_, i) => i !== index))
                              }
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          className={styles.aliasAddButton}
                          onClick={() => setEditingAliases([...editingAliases, ""])}
                        >
                          + Add Alias
                        </button>
                      </div>
                      <div className={styles.aliasEditorActions}>
                        <button
                          className={styles.saveButton}
                          onClick={() => handleSaveAliases(instance.id)}
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? "Saving..." : "Save Aliases"}
                        </button>
                        <button className={styles.cancelButton} onClick={handleCancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.aliasesRow}>
                      <strong>Aliases:</strong>{" "}
                      {(instance.identifier_field_aliases || []).length > 0 ? (
                        instance.identifier_field_aliases.map((alias: string, i: number) => (
                          <code key={i}>{alias}</code>
                        ))
                      ) : (
                        <span className={styles.noneText}>none configured</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Map preview */}
          <div className={styles.mapPanel}>
            {!mapboxToken ? (
              <div className={styles.mapError}>
                Mapbox token not configured. Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable
                the shape layer preview.
              </div>
            ) : (
              <>
                <div className={styles.mapWrap}>
                  <div ref={setMapContainer} className={styles.mapContainer} />
                  {visibleIds.length === 0 && (
                    <div className={styles.mapEmptyOverlay}>
                      Toggle a layer on the left to preview its shapes here.
                    </div>
                  )}
                </div>
                <div className={styles.mapLegend}>
                  {visibleLegendItems.length === 0 ? (
                    <span>No layers shown</span>
                  ) : (
                    visibleLegendItems.map((instance: any) => (
                      <span key={instance.id} className={styles.legendItem}>
                        <span
                          className={styles.legendSwatch}
                          style={{ background: colorForInstance(instance.id) }}
                        />
                        {instance.shapefile_name || instance.structure_type}
                      </span>
                    ))
                  )}
                  {anyVisibleLoading && <span>loading geometry…</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
