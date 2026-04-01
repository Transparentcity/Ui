export interface CTAContext {
  pageType: string;
  variantId: string;
  citySlug: string;
  districtSlug?: string;
}

export function buildCTAUrl(base: string, context: CTAContext): string {
  const url = new URL(base, "https://transparency.city");
  url.searchParams.set("utm_source", "evergreen");
  url.searchParams.set("utm_medium", "landing_page");
  url.searchParams.set("utm_campaign", context.pageType);
  url.searchParams.set("utm_content", context.variantId);
  url.searchParams.set("utm_city", context.citySlug);
  if (context.districtSlug) {
    url.searchParams.set("utm_district", context.districtSlug);
  }
  return `${url.pathname}${url.search}`;
}
