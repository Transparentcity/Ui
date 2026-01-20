/**
 * Known open data portal URLs by city slug.
 * Used on methodology and metric pages to link to each city's official data source.
 * When the API exposes data_portal_url per city, this can be retired or used as fallback.
 */
const DATA_PORTAL_BY_SLUG: Record<
  string,
  { url: string; name: string }
> = {
  "san-francisco": {
    url: "https://data.sfgov.org/",
    name: "DataSF",
  },
};

export function getDataPortalForCity(
  slug: string,
  _cityName?: string
): { url: string; name: string } | null {
  const key = (slug || "").trim().toLowerCase();
  return DATA_PORTAL_BY_SLUG[key] ?? null;
}
