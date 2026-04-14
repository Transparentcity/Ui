import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import "../../../../../landing.css";
import "../district.css";

import {
  listPublicCitiesForSitemap,
  getPublicCityDetail,
  getPublicMetricComparisonsBatch,
  getPublicMetricDistrictComparisons,
  getPublicCityDistricts,
  getPublicLeadersForCity,
  listPublicFeedStories,
  listPublicMapsForCity,
  getPublicCityMetricOrdering,
} from "@/lib/publicApiClient";
import { slugify, formatLeaderName } from "@/lib/utils";
import type { MetricOrderingEntry } from "../../../CityDashboardSection";
import DistrictPageContent from "../DistrictPageContent";
import { supervisorToSlug } from "../page";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ slug: string; districtId: string; supervisorSlug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, districtId, supervisorSlug } = await params;
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
  if (cityId) {
    try {
      const leaders = await getPublicLeadersForCity(cityId);
      const districtLeader = leaders.find((l) => l.district === d);
      if (districtLeader) supervisorName = formatLeaderName(districtLeader.name.trim());
    } catch {
      // no leader data
    }
  }

  // Canonical = this URL (self-referential since this IS the preferred URL)
  const canonical = `/c/${slug}/district/${d}/${supervisorSlug}`;

  const title = supervisorName
    ? `${supervisorName} \u2013 District ${d} \u2013 ${cityName}`
    : `District ${d} \u2013 ${cityName}`;

  const description = supervisorName
    ? `Track District ${d} in ${cityName}, represented by ${supervisorName}. Public metrics, accountability data, and district updates.`
    : `District ${d} dashboard for ${cityName}. Public metrics and monthly accountability updates.`;

  const keywords = supervisorName
    ? [
        supervisorName,
        `${supervisorName} District ${d}`,
        `${supervisorName} ${cityName}`,
        `${cityName} District ${d}`,
        `District ${d} supervisor`,
        `${cityName} district dashboard`,
      ]
    : [`${cityName} District ${d}`, `District ${d} supervisor`, `${cityName} district dashboard`];

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: "summary", title, description },
  };
}

export default async function DistrictSlugPage({ params }: PageProps) {
  noStore();
  const { slug, districtId, supervisorSlug } = await params;
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

  try {
    const [detail, leadersRes, feedRes, mapsRes, cityDistrictsRes, orderingRes] = await Promise.all([
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
    feedStories = feedRes.stories ?? [];
    maps = mapsRes;
    if (Array.isArray(cityDistrictsRes) && cityDistrictsRes.length > 0) {
      districts = [...cityDistrictsRes].sort((a, b) => a - b);
      districtValid = cityDistrictsRes.includes(d);
    }
    const metrics = cityDetail?.metrics ?? [];
    if (metrics.length > 0) {
      if (!districtValid) {
        const dc = await getPublicMetricDistrictComparisons(metrics[0].id, "ytd").catch(() => null);
        if (dc?.districts) {
          districtValid = dc.districts.some((x) => x.district === d);
          if (districts.length === 0)
            districts = dc.districts
              .map((x) => x.district)
              .filter((n) => n > 0)
              .sort((a, b) => a - b);
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

  if (!districtValid && (cityDetail?.metrics?.length ?? 0) > 0) notFound();

  const primaryLeader = leaders.find((l) => l.district === d);
  const supervisorName = primaryLeader?.name?.trim()
    ? formatLeaderName(primaryLeader.name.trim())
    : null;

  // If the slug in the URL is stale/wrong, redirect to the current canonical
  if (supervisorName) {
    const actualSlug = supervisorToSlug(supervisorName);
    if (supervisorSlug !== actualSlug) {
      redirect(`/c/${slug}/district/${d}/${actualSlug}`);
    }
  }

  const metrics = cityDetail?.metrics ?? [];
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
    />
  );
}
