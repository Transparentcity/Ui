/**
 * Build side-by-side map panels for choropleth shape layers (prior vs current period).
 */

import type { SavedMap } from "@/lib/apiClient";
import { formatMetricMapViewSpecKey, type MetricMapViewSpec } from "@/lib/metricMapEmbedViews";

export type DualPeriodPanelSpec = {
  label: string;
  count?: number;
  mapData: SavedMap;
  lockedViewKey: string;
};

function rowCountForAgg(agg: { rows?: unknown[] } | undefined): number {
  return Array.isArray(agg?.rows) ? agg.rows.length : 0;
}

function panelMapForChoroplethLayer(
  source: SavedMap,
  shapeLayerId: string,
  agg: unknown
): SavedMap {
  const baseConfig =
    source.map_config && typeof source.map_config === "object" ? source.map_config : {};
  const layerIdNum = Number(shapeLayerId);
  return {
    ...source,
    map_config: {
      ...baseConfig,
      year_compare: false,
      layout: undefined,
      default_view: {
        type: "choropleth",
        shape_layer_instance_id: Number.isFinite(layerIdNum) ? layerIdNum : shapeLayerId,
      },
      aggregations: { [shapeLayerId]: agg },
    },
  };
}

export function buildChoroplethDualPanels(
  currentMap: SavedMap,
  comparisonMap: SavedMap | null,
  spec: Extract<MetricMapViewSpec, { kind: "choropleth" }>,
  labels: { prior: string; current: string }
): DualPeriodPanelSpec[] | null {
  if (!comparisonMap) return null;

  const shapeLayerId = spec.shapeLayerId;
  const currentAggregations = (currentMap.map_config?.aggregations || {}) as Record<
    string,
    { rows?: unknown[] }
  >;
  const comparisonAggregations = (comparisonMap.map_config?.aggregations || {}) as Record<
    string,
    { rows?: unknown[] }
  >;
  const currentAgg = currentAggregations[shapeLayerId];
  const comparisonAgg = comparisonAggregations[shapeLayerId];

  if (!currentAgg || !comparisonAgg) return null;

  const lockedViewKey = formatMetricMapViewSpecKey(spec);

  return [
    {
      label: labels.prior,
      count: rowCountForAgg(comparisonAgg),
      mapData: panelMapForChoroplethLayer(comparisonMap, shapeLayerId, comparisonAgg),
      lockedViewKey,
    },
    {
      label: labels.current,
      count: rowCountForAgg(currentAgg),
      mapData: panelMapForChoroplethLayer(currentMap, shapeLayerId, currentAgg),
      lockedViewKey,
    },
  ];
}
