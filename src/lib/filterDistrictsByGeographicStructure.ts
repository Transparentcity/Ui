/** Geographic structure row with optional district number bounds. */
export type GeographicStructureRange = {
  min_value?: number | null;
  max_value?: number | null;
};

/**
 * Keep only district numbers that fall within a city's configured geographic
 * structure ranges (e.g. Oakland council districts 1–7). When no ranges are
 * configured, returns the input list unchanged.
 */
export function filterDistrictsByGeographicStructure(
  districts: number[],
  geographicStructures?: GeographicStructureRange[] | null,
): number[] {
  const ranges = (geographicStructures ?? [])
    .filter((s) => s.min_value != null && s.max_value != null)
    .map((s) => ({ min: s.min_value as number, max: s.max_value as number }));
  if (ranges.length === 0) {
    return [...districts].sort((a, b) => a - b);
  }
  return districts
    .filter((d) => ranges.some((r) => d >= r.min && d <= r.max))
    .sort((a, b) => a - b);
}
