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

/** Whether generate_map can build a map without a stored map_query. */
export function metricSupportsGeneratedMap(
  metric: Pick<
    PublicMetricDetail,
    "map_query" | "map_config" | "location_fields" | "metadata"
  >
): boolean {
  if (metric.map_query?.trim()) return true;

  const mapConfig = metric.map_config;
  if (
    mapConfig &&
    ["map_query", "district_field", "latitude_field", "longitude_field"].some(
      (key) => typeof mapConfig[key] === "string" && String(mapConfig[key]).trim()
    )
  ) {
    return true;
  }

  if (
    metric.location_fields?.some((field) => {
      const name = String(field.fieldName ?? field.field_name ?? "").toLowerCase();
      const type = String(field.fieldType ?? field.type ?? "").toLowerCase();
      return ["district", "ward", "precinct", "zone", "neighborhood", "latitude", "longitude", "lat", "lon", "lng"].some(
        (token) => type === token || name.includes(token)
      );
    })
  ) {
    return true;
  }

  const queryConfig = metric.metadata?.query_config;
  if (!queryConfig || typeof queryConfig !== "object") return false;

  // Derived ratio metrics (numerator / denominator by district)
  const derivedConfig = (queryConfig as Record<string, unknown>).derived_config;
  if (derivedConfig && typeof derivedConfig === "object") {
    const derived = derivedConfig as Record<string, unknown>;
    const operation = String(
      derived.operation ?? derived.calculation_type ?? ""
    ).toLowerCase();
    if (
      ["ratio", "divide", "division"].includes(operation) &&
      derived.numerator_metric_id != null &&
      derived.denominator_metric_id != null
    ) {
      return true;
    }
  }

  // AVG/SUM/MIN/MAX metrics with a ytd_config district_field: the backend can
  // synthesize the map_query from ytd_config.custom_where_conditions so no
  // stored map_query is needed.
  const ytdConfig = (queryConfig as Record<string, unknown>).ytd_config;
  if (ytdConfig && typeof ytdConfig === "object") {
    const ytd = ytdConfig as Record<string, unknown>;
    const aggregation = ytd.aggregation as
      | { type?: string; field?: string }
      | undefined;
    const districtField =
      (ytd.district_field as string | undefined) ??
      ((ytd.location_config as Record<string, unknown> | undefined)
        ?.district_field as string | undefined);
    const aggType = String(aggregation?.type ?? "").toUpperCase();
    if (
      ["SUM", "AVG", "MIN", "MAX"].includes(aggType) &&
      aggregation?.field?.trim() &&
      districtField?.trim()
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Total for map captions: sum of measure values when the metric aggregates a field,
 * otherwise point/row count (e.g. one incident per row).
 */
export function getMapCaptionTotalCount(
  mapData: Pick<SavedMap, "location_data" | "map_config">,
  options?: { valueField?: string | null }
): number | null {
  // District averages, minima/maxima, and ratios cannot be added into a
  // citywide total. Callers may supply an independently calculated citywide
  // value, but this helper must not manufacture one from choropleth rows.
  if (mapData.map_config?.additive === false) return null;

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
