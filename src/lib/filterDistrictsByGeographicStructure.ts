/** Geographic structure row with optional district number bounds (legacy). */
export type GeographicStructureRange = {
  min_value?: number | null;
  max_value?: number | null;
};

/** Shape layer instance with optional numeric identifier range (new). */
export type ShapeLayerRange = {
  min_identifier_value?: number | null;
  max_identifier_value?: number | null;
  /** Only district/ward/precinct types count. */
  structure_type?: string | null;
};

/**
 * Keep only district numbers that fall within a city's configured district
 * layer ranges. Checks shape layers first (new model), then falls back to
 * geographic structures (legacy). When no ranges are configured at all,
 * returns the input list unchanged.
 */
export function filterDistrictsByGeographicStructure(
  districts: number[],
  geographicStructures?: GeographicStructureRange[] | null,
  shapeLayers?: ShapeLayerRange[] | null,
): number[] {
  // Shape-layer-first: use min/max_identifier_value from district/ward/precinct layers
  const shapeRanges = (shapeLayers ?? [])
    .filter(
      (sl) =>
        sl.min_identifier_value != null &&
        sl.max_identifier_value != null &&
        (!sl.structure_type ||
          ["district", "ward", "precinct"].includes(sl.structure_type.toLowerCase()))
    )
    .map((sl) => ({ min: sl.min_identifier_value as number, max: sl.max_identifier_value as number }));

  if (shapeRanges.length > 0) {
    return districts
      .filter((d) => shapeRanges.some((r) => d >= r.min && d <= r.max))
      .sort((a, b) => a - b);
  }

  // Legacy fallback: geographic structures
  const geoRanges = (geographicStructures ?? [])
    .filter((s) => s.min_value != null && s.max_value != null)
    .map((s) => ({ min: s.min_value as number, max: s.max_value as number }));

  if (geoRanges.length === 0) {
    return [...districts].sort((a, b) => a - b);
  }
  return districts
    .filter((d) => geoRanges.some((r) => d >= r.min && d <= r.max))
    .sort((a, b) => a - b);
}
