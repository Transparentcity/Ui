import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import "../../../../landing.css";
import "./district.css";

import {
  listPublicCitiesForSitemap,
  getPublicCityDetail,
  getPublicMetricComparisonsBatch,
  getPublicMetricDistrictComparisons,
  getPublicCityDistricts,
  getPublicCitySubdivisions,
  getPublicLeadersForCity,
  listPublicFeedStories,
  listPublicMapsForCity,
  getPublicCityMetricOrdering,
} from "@/lib/publicApiClient";
import { slugify, formatLeaderName } from "@/lib/utils";
import { filterNavigableDistricts } from "@/lib/filterDistrictsByGeographicStructure";
import {
  loadPublicGeographicContext,
  subdivisionLabelFor,
} from "@/lib/loadPublicGeographicContext";
import { resolvePublicGeographicContext } from "@/lib/publicGeographicUnit";
import type { MetricOrderingEntry } from "../../CityDashboardSection";
import DistrictPageContent from "./DistrictPageContent";

export const revalidate = 3600;

/** "Dean Preston" → "dean-preston" */
export function supervisorToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type PageProps = {
  params: Promise<{ slug: string; districtId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, districtId } = await params;
  const d = parseInt(districtId, 10);
  if (!Number.isFinite(d) || d < 1) {
    return { title: "District not found \u2013 Transparent.city" };
  }

  let cityName = slug;
  let cityId: number | null = null;

  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => slugify(c.name) === slug);
    if (match) {
      cityId = match.id;
      cityName = match.name;
    }
  } catch {
    // use slug
  }

  let supervisorName: string | null = null;
  let subdivisionName = `District ${d}`;
  let unitLabel = "District";
  if (cityId) {
    try {
      const [leaders, subdivisionsRes] = await Promise.all([
        getPublicLeadersForCity(cityId),
        getPublicCitySubdivisions(cityId).catch(() => null),
      ]);
      const geo = resolvePublicGeographicContext({
        leaders,
        geographicUnitLabel: subdivisionsRes?.unit_label,
        geographicUnitLabelPlural: subdivisionsRes?.unit_label_plural,
        navigationMode: subdivisionsRes?.navigation_mode,
        subdivisions: subdivisionsRes?.subdivisions,
      });
      unitLabel = geo.unitLabel;
      subdivisionName = subdivisionLabelFor(geo, d);
      const districtLeader = leaders.find((l) => l.district === d);
      if (districtLeader) supervisorName = formatLeaderName(districtLeader.name.trim());
    } catch {
      // no leader data
    }
  }

  const supervisorSlug = supervisorName ? supervisorToSlug(supervisorName) : null;
  const canonical = supervisorSlug ? `/c/${slug}/district/${d}/${supervisorSlug}` : null;

  const title = supervisorName
    ? `${supervisorName} \u2013 ${subdivisionName} \u2013 ${cityName}`
    : `${subdivisionName} \u2013 ${cityName}`;

  const description = supervisorName
    ? `Track ${subdivisionName} in ${cityName}, represented by ${supervisorName}. Public metrics, accountability data, and local updates.`
    : `${subdivisionName} dashboard for ${cityName}. Public metrics and monthly accountability updates.`;

  const keywords = supervisorName
    ? [
        supervisorName,
        `${supervisorName} ${subdivisionName}`,
        `${supervisorName} ${cityName}`,
        `${cityName} ${subdivisionName}`,
        `${unitLabel} dashboard`,
        `${cityName} ${unitLabel.toLowerCase()} dashboard`,
      ]
    : [
        `${cityName} ${subdivisionName}`,
        `${subdivisionName} dashboard`,
        `${cityName} ${unitLabel.toLowerCase()} dashboard`,
      ];

  return {
    title,
    description,
    keywords,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: { title, description, ...(canonical ? { url: canonical } : {}) },
    twitter: { card: "summary", title, description },
  };
}

export default async function DistrictPage({ params }: PageProps) {
  noStore();
  const { slug, districtId } = await params;
  const d = parseInt(districtId, 10);
  if (!Number.isFinite(d) || d < 1) notFound();

  let city: (Awaited<ReturnType<typeof listPublicCitiesForSitemap>>[number] & {
    display: string;
    shortDisplay: string;
  }) | null = null;

  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => slugify(c.name) === slug);
    if (match) {
      const shortDisplay = match.name;
      const display =
        match.state && match.country && match.country !== "United States"
          ? `${match.name}, ${match.state}, ${match.country}`
          : match.state ? `${match.name}, ${match.state}` : match.name;
      city = { ...match, display, shortDisplay };
    }
  } catch {
    // noop
  }

  if (!city?.id) notFound();

  let cityDetail: Awaited<ReturnType<typeof getPublicCityDetail>> | null = null;
  const comparisonsMap: Record<
    number,
    Awaited<ReturnType<typeof getPublicMetricComparisonsBatch>>[number]
  > = {};
  let districtValid = false;
  let leaders: Awaited<ReturnType<typeof getPublicLeadersForCity>> = [];
  let feedStories: Awaited<ReturnType<typeof listPublicFeedStories>>["stories"] = [];
  let districts: number[] = [];
  let maps: Awaited<ReturnType<typeof listPublicMapsForCity>> = [];
  let orderings: MetricOrderingEntry[] | undefined = undefined;
  let geographicContext = resolvePublicGeographicContext({});

  try {
    const [detail, leadersRes, feedRes, mapsRes, cityDistrictsRes, orderingRes, geoContext] =
      await Promise.all([
      getPublicCityDetail(city.id),
      getPublicLeadersForCity(city.id).catch(() => []),
      listPublicFeedStories({
        city_id: city.id,
        district: d,
        limit: 4,
        order_by: "published_at",
      }).catch(() => ({ stories: [], count: 0 })),
      listPublicMapsForCity(city.id).catch(() => []),
      getPublicCityDistricts(city.id).catch((): number[] => []),
      getPublicCityMetricOrdering(city.id).catch(() => null),
      loadPublicGeographicContext(city.id),
    ]);
    if (orderingRes?.orderings?.length) {
      orderings = orderingRes.orderings
        .filter((o) => o.metric_id != null)
        .map((o) => ({
          metric_id: o.metric_id!,
          category_order: o.category_order,
          metric_order: o.metric_order,
          category_name: o.category_name,
          subcategory_name: o.subcategory_name ?? null,
        }));
    }
    cityDetail = detail;
    leaders = leadersRes;
    geographicContext = geoContext;
    feedStories = feedRes.stories ?? [];
    maps = mapsRes;
    if (Array.isArray(cityDistrictsRes) && cityDistrictsRes.length > 0) {
      districts = filterNavigableDistricts(
        cityDistrictsRes,
        geographicContext.subdivisionNames.keys(),
        cityDetail?.geographic_structures,
      );
      districtValid = districts.includes(d);
    }
    const metrics = cityDetail?.metrics ?? [];
    if (metrics.length > 0) {
      if (!districtValid) {
        const dc = await getPublicMetricDistrictComparisons(metrics[0].id, "ytd").catch(() => null);
        if (dc?.districts) {
          districtValid = dc.districts.some((x) => x.district === d);
          if (districts.length === 0)
            districts = filterNavigableDistricts(
              dc.districts
                .map((x) => x.district)
                .filter((n): n is number => typeof n === "number" && n > 0),
              geographicContext.subdivisionNames.keys(),
              cityDetail?.geographic_structures,
            );
        }
      }
      const batch = await getPublicMetricComparisonsBatch({
        metric_ids: metrics.map((m) => m.id),
        district: d,
        comparison_types: ["ytd"],
      }).catch(() => ({}));
      Object.assign(comparisonsMap, batch);
    }
  } catch {
    // leave districtValid false, comparisonsMap empty
  }

  // A subdivision listed in the city's official layer (e.g. a Cincinnati SNA
  // neighborhood) is a real page even when no metric has comparison rows for
  // it yet — render the subdivision-aware empty state instead of a 404.
  const isKnownSubdivision = geographicContext.subdivisionNames.has(d);
  if (
    !districtValid &&
    !isKnownSubdivision &&
    (cityDetail?.metrics?.length ?? 0) > 0
  ) {
    notFound();
  }

  const primaryLeader = leaders.find((l) => l.district === d);
  const supervisorName = primaryLeader?.name?.trim()
    ? formatLeaderName(primaryLeader.name.trim())
    : null;
  const supervisorSlug = supervisorName ? supervisorToSlug(supervisorName) : null;

  // Redirect numeric URL to the canonical supervisor-slug URL for SEO
  if (supervisorSlug) {
    redirect(`/c/${slug}/district/${d}/${supervisorSlug}`);
  }

  // Drop metrics that have no district-specific comparison row. The backend
  // returns the city's full metric list but precomputed comparisons only land
  // for metrics that actually have a district slice. Rendering the rest leaves
  // empty cells that look like the page is mirroring citywide data (the C6
  // 'cohort bug' the QA reviewer flags).
  const allMetrics = cityDetail?.metrics ?? [];
  const metrics = allMetrics.filter((m) => comparisonsMap[m.id]?.comparisons?.ytd);
  const accentStories = feedStories.slice(0, 3);

  return (
    <DistrictPageContent
      slug={slug}
      d={d}
      city={city}
      supervisorName={supervisorName}
      leaders={leaders}
      accentStories={accentStories}
      metrics={metrics}
      comparisonsMap={comparisonsMap}
      districts={districts}
      maps={maps}
      orderings={orderings}
      geographicContext={geographicContext}
    />
  );
}
