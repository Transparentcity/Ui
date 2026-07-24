import {
  getPublicCityDetail,
  getPublicCitySubdivisions,
  getPublicLeadersForCity,
} from "@/lib/publicApiClient";
import {
  formatSubdivisionLabel,
  resolvePublicGeographicContext,
  type PublicGeographicContext,
} from "@/lib/publicGeographicUnit";

export async function loadPublicGeographicContext(
  cityId: number,
): Promise<PublicGeographicContext> {
  const [detail, subdivisionsRes, leaders] = await Promise.all([
    getPublicCityDetail(cityId, { includeMetrics: false }).catch(() => null),
    getPublicCitySubdivisions(cityId).catch(() => null),
    getPublicLeadersForCity(cityId).catch(() => []),
  ]);

  return resolvePublicGeographicContext({
    leaders,
    geographicUnitLabel:
      subdivisionsRes?.unit_label ?? detail?.geographic_unit_label,
    geographicUnitLabelPlural:
      subdivisionsRes?.unit_label_plural ?? detail?.geographic_unit_label_plural,
    navigationMode: subdivisionsRes?.navigation_mode ?? detail?.navigation_mode,
    subdivisions: subdivisionsRes?.subdivisions,
  });
}

export function subdivisionLabelFor(
  context: PublicGeographicContext,
  id: number,
): string {
  return formatSubdivisionLabel(context, id);
}
