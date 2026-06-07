/**
 * Decide primary vs secondary map views for metric detail embeds.
 * Mirrors ProgressiveMapView initial view logic so the main map stays a single
 * clear mode; alternate views render as separate small maps.
 */

import type { SavedMap } from "@/lib/apiClient";
import { normalizePointData } from "@/lib/mapPointNormalize";

const MAX_POINTS_LIMIT = 5000;

type DefaultView = {
  type: "points" | "choropleth";
  shape_layer_instance_id?: number | null;
};

type AvailableView = {
  type: "points" | "choropleth";
  point_count?: number;
  shape_layer_instance_id?: number;
  identifier_field?: string;
  display_name?: string;
  row_count?: number;
  is_default?: boolean;
  is_city_district?: boolean;
};

type ShapeLayerRow = {
  shape_layer_instance_id: number;
  identifier_field: string;
  data_field?: string;
  display_name: string;
  layer_key?: string;
  category?: string;
  is_city_district?: boolean;
};

export type MetricMapLockedView =
  | { kind: "points" }
  | { kind: "choropleth"; shapeLayerId: string };

export type MetricMapViewSpec =
  | { kind: "points"; label: string }
  | { kind: "choropleth"; shapeLayerId: string; label: string };

export function toMetricMapLockedView(spec: MetricMapViewSpec): MetricMapLockedView {
  if (spec.kind === "points") return { kind: "points" };
  return { kind: "choropleth", shapeLayerId: spec.shapeLayerId };
}

/** Stable key for ProgressiveMapView `lockedViewKey` (metric embed mode). */
export function formatMetricMapViewSpecKey(spec: MetricMapViewSpec): string {
  if (spec.kind === "points") return "points";
  return `choro:${spec.shapeLayerId}`;
}

function buildInitialShapeLayers(mapData: SavedMap): ShapeLayerRow[] {
  const availableViews = (mapData.map_config?.available_views ?? []) as AvailableView[];
  const shapeLayersFromConfig = mapData.map_config?.available_shape_layers as
    | ShapeLayerRow[]
    | undefined;

  if (availableViews.length > 0) {
    return availableViews
      .filter(
        (
          v
        ): v is AvailableView & {
          shape_layer_instance_id: number;
          identifier_field: string;
          display_name: string;
        } =>
          v.type === "choropleth" &&
          v.shape_layer_instance_id != null &&
          v.identifier_field != null
      )
      .map((v) => ({
        shape_layer_instance_id: v.shape_layer_instance_id!,
        identifier_field: v.identifier_field!,
        data_field: (v as { data_field?: string }).data_field,
        display_name: v.display_name ?? String(v.shape_layer_instance_id),
        is_city_district: v.is_city_district,
      }));
  }
  return shapeLayersFromConfig?.length ? shapeLayersFromConfig : [];
}

function rowCountForAgg(
  aggregations: Record<string, { rows?: unknown[] }>,
  shapeLayerId: string
): number {
  const rows = aggregations[shapeLayerId]?.rows;
  return Array.isArray(rows) ? rows.length : 0;
}

function resolveChoroShapeLayerId(
  aggregations: Record<string, { rows?: unknown[] }>,
  availableViews: AvailableView[],
  initialShapeLayers: ShapeLayerRow[],
  shapeLayersFromConfig: ShapeLayerRow[] | undefined
): string | null {
  const aggregationKeys = Object.keys(aggregations);
  if (aggregationKeys.length === 0) return null;

  const viewHasUsableRows = (v: AvailableView): boolean => {
    if (v.type !== "choropleth" || v.shape_layer_instance_id == null) return false;
    const sid = String(v.shape_layer_instance_id);
    if (!aggregationKeys.includes(sid)) return false;
    const meta = v.row_count;
    return (meta != null && meta > 0) || rowCountForAgg(aggregations, sid) > 0;
  };

  const fromCity = availableViews.find((v) => viewHasUsableRows(v) && v.is_city_district);
  if (fromCity?.shape_layer_instance_id != null) {
    return String(fromCity.shape_layer_instance_id);
  }
  const fromViews = availableViews.find((v) => viewHasUsableRows(v));
  if (fromViews?.shape_layer_instance_id != null) {
    return String(fromViews.shape_layer_instance_id);
  }

  for (const sl of initialShapeLayers) {
    const sid = String(sl.shape_layer_instance_id);
    if (aggregationKeys.includes(sid) && rowCountForAgg(aggregations, sid) > 0) {
      return sid;
    }
  }
  for (const sl of shapeLayersFromConfig ?? []) {
    const sid = String(sl.shape_layer_instance_id);
    if (aggregationKeys.includes(sid) && rowCountForAgg(aggregations, sid) > 0) {
      return sid;
    }
  }
  return null;
}

function labelForShapeLayer(
  id: string,
  initialShapeLayers: ShapeLayerRow[],
  shapeLayersFromConfig: ShapeLayerRow[] | undefined
): string {
  const n = Number(id);
  const fromInit = initialShapeLayers.find((s) => String(s.shape_layer_instance_id) === id);
  if (fromInit?.display_name) return fromInit.display_name;
  const fromCfg = shapeLayersFromConfig?.find((s) => String(s.shape_layer_instance_id) === id);
  if (fromCfg?.display_name) return fromCfg.display_name;
  return Number.isFinite(n) ? `Area ${id}` : id;
}

function choroIdsWithData(
  aggregations: Record<string, { rows?: unknown[] }>,
  initialShapeLayers: ShapeLayerRow[],
  shapeLayersFromConfig: ShapeLayerRow[] | undefined
): string[] {
  const keys = new Set<string>();
  for (const k of Object.keys(aggregations)) {
    if (rowCountForAgg(aggregations, k) > 0) keys.add(k);
  }
  const ordered: string[] = [];
  const pushIf = (id: string) => {
    if (keys.has(id) && !ordered.includes(id)) ordered.push(id);
  };
  for (const sl of initialShapeLayers) {
    pushIf(String(sl.shape_layer_instance_id));
  }
  for (const sl of shapeLayersFromConfig ?? []) {
    pushIf(String(sl.shape_layer_instance_id));
  }
  for (const k of keys) {
    if (!ordered.includes(k)) ordered.push(k);
  }
  return ordered;
}

/**
 * Primary map mode for the metric embed + optional alternate views as small maps.
 */
export function computeMetricMapEmbedViewSpecs(mapData: SavedMap): {
  primary: MetricMapViewSpec;
  secondary: MetricMapViewSpec[];
} {
  const defaultView = mapData.map_config?.default_view as DefaultView | undefined;
  const availableViews = (mapData.map_config?.available_views ?? []) as AvailableView[];
  const shapeLayersFromConfig = mapData.map_config?.available_shape_layers as
    | ShapeLayerRow[]
    | undefined;
  const aggregations = (mapData.map_config?.aggregations || {}) as Record<
    string,
    { rows?: unknown[] }
  >;
  const locationDataCount = mapData.location_data?.length || 0;
  const aggregationKeys = Object.keys(aggregations);
  const initialShapeLayers = buildInitialShapeLayers(mapData);
  const validPoints =
    mapData.location_data && Array.isArray(mapData.location_data)
      ? normalizePointData(mapData.location_data as Array<Record<string, unknown>>)
      : [];

  // A "points" secondary view is only useful when location_data actually contains the
  // original incident rows — not district aggregate rows that carry a sample lat/lon.
  // The backend sets a "points" entry in available_views only when real points are
  // present. When available_views is populated but has no "points" entry (choropleth
  // preview where location_data was replaced with district rows), we skip the secondary
  // pin map. Fall back to coordinate-only check only when available_views is missing
  // entirely (e.g. older saved maps without the field).
  const hasPointsViewInAvailableViews =
    availableViews.length === 0 || availableViews.some((v) => v.type === "points");
  const hasRenderablePoints =
    hasPointsViewInAvailableViews &&
    validPoints.length > 0 &&
    validPoints.length <= MAX_POINTS_LIMIT;

  const chartPref = String(
    (mapData.map_config?.chart_type_preference as string | undefined) || ""
  )
    .trim()
    .toLowerCase();
  /** Backend already chose points when chart_type_preference is point; do not override with choropleth. */
  const forcePointChart = chartPref === "point";

  const fewPoints = locationDataCount <= 1000;
  const choroLayerId = resolveChoroShapeLayerId(
    aggregations,
    availableViews,
    initialShapeLayers,
    shapeLayersFromConfig
  );
  const preferChoroOverPoints =
    !forcePointChart &&
    choroLayerId != null &&
    !fewPoints &&
    locationDataCount > 1000 &&
    aggregationKeys.length > 0;

  let primary: MetricMapViewSpec;

  if (defaultView?.type === "choropleth" && defaultView.shape_layer_instance_id != null) {
    const sid = String(defaultView.shape_layer_instance_id);
    primary = {
      kind: "choropleth",
      shapeLayerId: sid,
      label: labelForShapeLayer(sid, initialShapeLayers, shapeLayersFromConfig),
    };
  } else if (
    preferChoroOverPoints &&
    (defaultView == null || defaultView.type === "points")
  ) {
    const sid = choroLayerId!;
    primary = {
      kind: "choropleth",
      shapeLayerId: sid,
      label: labelForShapeLayer(sid, initialShapeLayers, shapeLayersFromConfig),
    };
  } else if (defaultView) {
    if (defaultView.type === "points" || fewPoints) {
      primary = { kind: "points", label: "Location pins" };
    } else if (defaultView.type === "choropleth" && defaultView.shape_layer_instance_id != null) {
      const sid = String(defaultView.shape_layer_instance_id);
      primary = {
        kind: "choropleth",
        shapeLayerId: sid,
        label: labelForShapeLayer(sid, initialShapeLayers, shapeLayersFromConfig),
      };
    } else {
      primary = { kind: "points", label: "Location pins" };
    }
  } else if (
    initialShapeLayers.length > 0 &&
    locationDataCount > 1000 &&
    !forcePointChart
  ) {
    const sid = String(initialShapeLayers[0].shape_layer_instance_id);
    primary = {
      kind: "choropleth",
      shapeLayerId: sid,
      label: labelForShapeLayer(sid, initialShapeLayers, shapeLayersFromConfig),
    };
  } else if (shapeLayersFromConfig?.length && locationDataCount > 1000 && !forcePointChart) {
    const first = shapeLayersFromConfig[0];
    const sid = String(first.shape_layer_instance_id);
    primary = {
      kind: "choropleth",
      shapeLayerId: sid,
      label: labelForShapeLayer(sid, initialShapeLayers, shapeLayersFromConfig),
    };
  } else if (locationDataCount > 0 && locationDataCount <= MAX_POINTS_LIMIT) {
    primary = { kind: "points", label: "Location pins" };
  } else {
    const fallback = choroLayerId ?? (initialShapeLayers[0] ? String(initialShapeLayers[0].shape_layer_instance_id) : null);
    if (fallback) {
      primary = {
        kind: "choropleth",
        shapeLayerId: fallback,
        label: labelForShapeLayer(fallback, initialShapeLayers, shapeLayersFromConfig),
      };
    } else {
      primary = { kind: "points", label: "Location pins" };
    }
  }

  const secondary: MetricMapViewSpec[] = [];
  const primaryChoroId = primary.kind === "choropleth" ? primary.shapeLayerId : null;

  if (primary.kind === "choropleth" && hasRenderablePoints) {
    secondary.push({ kind: "points", label: "Location pins" });
  }

  const allChoro = choroIdsWithData(aggregations, initialShapeLayers, shapeLayersFromConfig);
  for (const sid of allChoro) {
    if (sid === primaryChoroId) continue;
    secondary.push({
      kind: "choropleth",
      shapeLayerId: sid,
      label: labelForShapeLayer(sid, initialShapeLayers, shapeLayersFromConfig),
    });
  }

  return { primary, secondary };
}
