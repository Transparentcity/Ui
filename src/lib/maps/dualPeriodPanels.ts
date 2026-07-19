/**
 * Build side-by-side map panels for choropleth shape layers (prior vs current period).
 */

import type { SavedMap } from "@/lib/apiClient";
import { formatMetricMapViewSpecKey, type MetricMapViewSpec } from "@/lib/metricMapEmbedViews";

export type DualPeriodPanelSpec = {
  label: string;
  count?: number;
  /** Noun shown next to the count (e.g. "permits"). */
  countNoun?: string;
  mapData: SavedMap;
  lockedViewKey: string;
};

type AggRow = { value?: number; count?: number };

/**
 * Panel header count: sum of aggregation values (total items) with the item
 * noun; falls back to the row count (number of areas) when values don't sum.
 */
function panelCountForAgg(
  agg: { rows?: AggRow[] } | undefined,
  itemNoun: string | undefined,
  areaNoun: string | undefined
): { count: number; countNoun?: string } {
  const rows = Array.isArray(agg?.rows) ? agg.rows : [];
  const total = rows.reduce(
    (sum, row) => sum + (Number(row?.value ?? row?.count ?? 0) || 0),
    0
  );
  if (total > 0) return { count: total, countNoun: itemNoun };
  return { count: rows.length, countNoun: areaNoun };
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
    { rows?: AggRow[] }
  >;
  const comparisonAggregations = (comparisonMap.map_config?.aggregations || {}) as Record<
    string,
    { rows?: AggRow[] }
  >;
  const currentAgg = currentAggregations[shapeLayerId];
  const comparisonAgg = comparisonAggregations[shapeLayerId];

  if (!currentAgg || !comparisonAgg) return null;

  const itemNoun = (currentMap.map_config?.item_noun as string | undefined)?.trim();
  const areaNoun = (
    currentMap.map_config?.choropleth_area_noun as string | undefined
  )?.trim();

  const lockedViewKey = formatMetricMapViewSpecKey(spec);

  return [
    {
      label: labels.prior,
      ...panelCountForAgg(comparisonAgg, itemNoun, areaNoun),
      mapData: panelMapForChoroplethLayer(comparisonMap, shapeLayerId, comparisonAgg),
      lockedViewKey,
    },
    {
      label: labels.current,
      ...panelCountForAgg(currentAgg, itemNoun, areaNoun),
      mapData: panelMapForChoroplethLayer(currentMap, shapeLayerId, currentAgg),
      lockedViewKey,
    },
  ];
}
