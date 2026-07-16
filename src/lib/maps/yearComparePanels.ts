/**
 * Year-over-year side-by-side panels for point maps.
 *
 * When a saved map has two calendar years of points (or explicit
 * map_config.year_compare), the public map page renders one map per year
 * instead of overlaying years on a single map (which fights with series/
 * type coloring).
 */

export type YearComparePanel = {
  year: string;
  label: string;
  points: Array<Record<string, unknown>>;
};

const DATE_FIELD_CANDIDATES = [
  "year",
  "incident_date",
  "report_datetime",
  "requested_datetime",
  "date",
  "datetime",
  "occurred_date",
  "created_date",
  "start_date",
];

function yearFromValue(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    if (n >= 1900 && n <= 2100) return String(n);
  }
  const s = String(raw).trim();
  if (/^\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[-/T]/);
  if (m) return m[1]!;
  return null;
}

export function extractPointYear(
  point: Record<string, unknown>,
  yearField?: string | null
): string | null {
  if (yearField && point[yearField] != null) {
    const y = yearFromValue(point[yearField]);
    if (y) return y;
  }
  for (const field of DATE_FIELD_CANDIDATES) {
    if (point[field] == null) continue;
    const y = yearFromValue(point[field]);
    if (y) return y;
  }
  return null;
}

export function isYearCompareMapConfig(
  mapConfig: Record<string, unknown> | null | undefined
): boolean {
  if (!mapConfig) return false;
  if (mapConfig.year_compare === true) return true;
  if (mapConfig.layout === "year_panels") return true;
  return false;
}

/**
 * Build chronological panels (older → newer) when the map is configured for
 * year compare, or when point dates span exactly two calendar years and the
 * map is a YTD/period comparison.
 */
export function resolveYearComparePanels(
  locationData: Array<Record<string, unknown>> | null | undefined,
  mapConfig?: Record<string, unknown> | null
): YearComparePanel[] | null {
  const points = Array.isArray(locationData) ? locationData : [];
  if (points.length === 0) return null;

  const yearField =
    typeof mapConfig?.year_field === "string" ? mapConfig.year_field : null;
  const configuredYears = Array.isArray(mapConfig?.year_values)
    ? (mapConfig!.year_values as unknown[])
        .map((v) => yearFromValue(v))
        .filter((v): v is string => !!v)
    : [];

  const byYear = new Map<string, Array<Record<string, unknown>>>();
  for (const pt of points) {
    const y = extractPointYear(pt, yearField);
    if (!y) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(pt);
  }

  let years = configuredYears.length >= 2
    ? configuredYears.filter((y) => byYear.has(y))
    : Array.from(byYear.keys()).sort();

  if (years.length < 2) return null;

  // Prefer the two most recent years when more than two are present.
  if (years.length > 2) {
    years = years.slice(-2);
  }

  const explicit = isYearCompareMapConfig(mapConfig);
  const periodType = String(mapConfig?.period_type || "").toLowerCase();
  const looksLikeYoy =
    explicit ||
    periodType === "ytd" ||
    periodType === "mtd_prior_year" ||
    !!mapConfig?.comparison_start_date;

  if (!looksLikeYoy && !explicit) return null;

  return years.map((year) => ({
    year,
    label: year,
    points: byYear.get(year) || [],
  }));
}
