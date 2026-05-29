import type { SavedMap } from "@/lib/apiClient";
import type { PublicMetricDetail } from "@/lib/publicApiClient";

const LOCATION_KEYS = new Set([
  "lat",
  "lon",
  "latitude",
  "longitude",
  "lng",
  "x",
  "y",
]);

const MEASURE_FIELD_CANDIDATES = [
  "housingunits",
  "housing_units",
  "units",
  "amount",
  "quantity",
  "value",
  "total",
  "weight",
];

type LocationRow = Record<string, unknown>;

function getFieldValue(row: LocationRow, field: string): unknown {
  if (field in row) return row[field];
  const lower = field.toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

function sumLocationField(loc: LocationRow[], field: string): number {
  return loc.reduce((sum, row) => sum + (Number(getFieldValue(row, field)) || 0), 0);
}

function inferNumericMeasureField(loc: LocationRow[]): string | null {
  if (loc.length === 0) return null;
  const first = loc[0];

  for (const name of MEASURE_FIELD_CANDIDATES) {
    if (getFieldValue(first, name) !== undefined) {
      const total = sumLocationField(loc, name);
      if (total > 0) return name;
    }
  }

  const numericKeys = Object.keys(first).filter((key) => {
    const lower = key.toLowerCase();
    if (LOCATION_KEYS.has(lower)) return false;
    if (lower.includes("district")) return false;
    if (lower === "id" || lower.endsWith("_id")) return false;
    const value = first[key];
    return typeof value === "number" && Number.isFinite(value);
  });

  if (numericKeys.length === 1) return numericKeys[0];
  return null;
}

/** Aggregation field from metric query_config (e.g. SUM(housingunits)). */
export function getMetricAggregationValueField(
  metric: Pick<PublicMetricDetail, "metadata">
): string | null {
  const metadata = metric.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const queryConfig = (metadata as { query_config?: Record<string, unknown> })
    .query_config;
  if (!queryConfig || typeof queryConfig !== "object") return null;

  const ytdConfig =
    (queryConfig.ytd_config as Record<string, unknown> | undefined) ?? queryConfig;
  const aggregation = ytdConfig.aggregation as
    | { type?: string; field?: string; distinct?: boolean }
    | undefined;
  if (!aggregation || typeof aggregation !== "object") return null;

  const aggType = String(aggregation.type ?? "").toUpperCase();
  if (aggType === "COUNT" || aggregation.distinct) return "count";
  if (typeof aggregation.field === "string" && aggregation.field.trim()) {
    return aggregation.field.trim();
  }
  return null;
}

/**
 * Total for map captions: sum of measure values when the metric aggregates a field,
 * otherwise point/row count (e.g. one incident per row).
 */
export function getMapCaptionTotalCount(
  mapData: Pick<SavedMap, "location_data" | "map_config">,
  options?: { valueField?: string | null }
): number | null {
  const aggregations = mapData.map_config?.aggregations as
    | Record<string, { rows?: Array<{ value?: number; count?: number }> }>
    | undefined;
  if (aggregations && typeof aggregations === "object") {
    for (const key of Object.keys(aggregations)) {
      const rows = aggregations[key]?.rows;
      if (Array.isArray(rows) && rows.length > 0) {
        const total = rows.reduce(
          (sum, row) => sum + (Number(row?.value ?? row?.count ?? 0) || 0),
          0
        );
        if (total > 0) return total;
      }
    }
  }

  const loc = mapData.location_data;
  if (!Array.isArray(loc) || loc.length === 0) return null;
  const rows = loc as LocationRow[];

  const configValueField =
    typeof mapData.map_config?.value_field === "string"
      ? mapData.map_config.value_field
      : null;
  const resolvedField = options?.valueField ?? configValueField;

  if (resolvedField === "count") return rows.length;
  if (resolvedField) {
    const total = sumLocationField(rows, resolvedField);
    if (total > 0) return total;
  }

  const first = rows[0];
  if (
    first &&
    (typeof first.value === "number" || typeof first.count === "number")
  ) {
    const total = rows.reduce(
      (sum, p) => sum + (Number(p.value ?? p.count) || 0),
      0
    );
    if (total > 0) return total;
  }

  const inferred = inferNumericMeasureField(rows);
  if (inferred) {
    const total = sumLocationField(rows, inferred);
    if (total > 0) return total;
  }

  return rows.length;
}
