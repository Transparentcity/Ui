/**
 * Human-readable label for open-data portal platform (matches city list admin column).
 * Uses stored `portal_type` when present; otherwise infers from main portal URL when possible.
 */
export function portalPlatformLabel(
  portalType: string | null | undefined,
  mainPortalUrl?: string | null
): string {
  if (portalType) {
    const p = portalType;
    if (p === "unknown") return "Unknown";
    if (p === "socrata") return "Socrata";
    if (p === "arcgis") return "ArcGIS";
    if (p === "ckan") return "CKAN";
    if (p === "data.gov") return "Data.gov";
    if (p === "dcat_ap") return "DCAT-AP";
    return p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, " ");
  }
  const url = (mainPortalUrl || "").toLowerCase();
  if (url.includes("socrata")) return "Socrata";
  if (url.includes("arcgis")) return "ArcGIS";
  if (url.includes("ckan")) return "CKAN";
  if (url.includes("transportation.gov")) return "Socrata";
  return "Not set";
}
