/**
 * Display name for a stored `extra_metadata.portal_type` value.
 * Keep in sync with platform pie buckets in CityDataTable.
 *
 * - `data_json` = Project Open Data / DCAT catalog at `/data.json` (often on a Socrata host;
 *   use Determine portal type + Socrata probe for native "Socrata").
 * - `data.gov` = federal catalog / URL inference for data.gov hosts — not the same as municipal data.json.
 */
export function portalTypeDisplayName(portalType: string): string {
  const p = portalType;
  if (p === "socrata") return "Socrata";
  if (p === "arcgis" || p === "arcgis_hub_v3") return "ArcGIS";
  if (p === "ckan") return "CKAN";
  if (p === "data.gov") return "Data.gov";
  if (p === "data_json") return "DCAT (data.json)";
  if (p === "dcat_ap") return "DCAT-AP";
  if (p === "opendatasoft") return "Opendatasoft";
  if (p === "junar") return "Junar";
  return p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, " ");
}

/**
 * Human-readable label for open-data portal platform (matches city list admin column).
 * Uses stored `portal_type` when present; otherwise infers from main portal URL when possible.
 */
export function portalPlatformLabel(
  portalType: string | null | undefined,
  mainPortalUrl?: string | null
): string {
  if (portalType) {
    if (portalType === "unknown") return "Unknown";
    return portalTypeDisplayName(portalType);
  }
  const url = (mainPortalUrl || "").toLowerCase();
  if (url.includes("socrata")) return "Socrata";
  if (url.includes("arcgis")) return "ArcGIS";
  if (url.includes("ckan")) return "CKAN";
  if (url.includes("transportation.gov")) return "Socrata";
  // Portal URL is set but we couldn't detect the catalog type
  if (url) return "No catalog";
  return "Not set";
}

/**
 * Short badge label for the portal match status set by the "Determine Portal Type" job.
 * Returns null when no match job has run for this city.
 */
export function portalMatchStatusLabel(
  matchStatus: string | null | undefined,
  matchConfidence: string | null | undefined
): { label: string; color: string } | null {
  if (!matchStatus) return null;
  if (matchStatus === "matched") {
    return { label: "Matched", color: "#16a34a" };
  }
  if (matchStatus === "review_needed") {
    const conf = matchConfidence === "medium" ? "medium" : "low";
    return {
      label: conf === "medium" ? "Needs review" : "Low confidence",
      color: "#d97706",
    };
  }
  if (matchStatus === "unresolved") {
    return { label: "Unresolved", color: "#dc2626" };
  }
  return null;
}
