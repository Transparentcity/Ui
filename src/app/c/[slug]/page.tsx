import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { CityStructuredData } from "@/components/StructuredData";
import PublicFooter from "@/components/PublicFooter";

import "../../landing.css";

import {
  listPublicCitiesForSitemap,
  getPublicCityDetail,
  getPublicMetricComparisonsBatch,
  getPublicMetricDistrictComparisons,
  getPublicCityDistricts,
  listPublicMapsForCity,
  getPublicLeadersForCity,
  getPublicCityMetricOrdering,
  type PublicMetricOrderingResponse,
} from "@/lib/publicApiClient";
import CitySignupButton from "./CitySignupButton";
import CityDashboardSection from "./CityDashboardSection";
import CityViewTracker from "./CityViewTracker";
import CityPageClient from "./CityPageClient";
import PublicNavBar from "@/components/PublicNavBar";
import DistrictFollowClaimBlock from "./district/DistrictFollowClaimBlock";
import HeroDistrictSelector from "./HeroDistrictSelector";
import FeaturedStoriesAsync from "./FeaturedStoriesAsync";
import FeaturedStoriesSkeleton from "./FeaturedStoriesSkeleton";
import CitySignupCTA from "./CitySignupCTA";
import LoggedOutOnly from "./LoggedOutOnly";
import MobileCitySignupBar from "./MobileCitySignupBar";
import { slugify, formatLeaderName } from "@/lib/utils";
import { pickMayorFromPublicLeaders } from "@/lib/publicLeadersPick";
import { filterNavigableDistricts } from "@/lib/filterDistrictsByGeographicStructure";
import { loadPublicGeographicContext } from "@/lib/loadPublicGeographicContext";
import { resolvePublicGeographicContext } from "@/lib/publicGeographicUnit";

export const revalidate = 3600;

function getCanonicalCitySlug(city: Awaited<
  ReturnType<typeof listPublicCitiesForSitemap>
>[number]): string {
  return city.slug || slugify(city.name);
}

/** Pre-render launched city pages at build time for instant CDN delivery. */
export async function generateStaticParams() {
  try {
    const cities = await listPublicCitiesForSitemap();
    return cities
      .filter((c) => c.is_launched)
      .map((c) => ({ slug: getCanonicalCitySlug(c) }));
  } catch {
    // Backend down or misconfigured at build time (CI, preview); city pages still render on-demand.
    return [];
  }
}

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const sp = (await searchParams) || {};
  const idParam = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  const id = idParam ? Number(idParam) : null;

  let name = slug;
  let cityId: number | null = null;
  let state: string | null | undefined = null;
  let country: string | null | undefined = null;
  let datasetsCount: number | null = null;

  try {
    const cities = await listPublicCitiesForSitemap();
    const match =
      typeof id === "number" && Number.isFinite(id)
        ? cities.find((c) => c.id === id)
        : cities.find((c) => getCanonicalCitySlug(c) === slug);
    if (match) {
      cityId = match.id;
      name = match.name;
      state = match.state;
      country = match.country;
      datasetsCount = match.datasets_count;
    }
  } catch {
    // Keep a reasonable fallback; crawlers will retry.
  }

  const display =
    state && country && country !== "United States"
      ? `${name}, ${state}, ${country}`
      : state
        ? `${name}, ${state}`
        : country && country !== "United States"
          ? `${name}, ${country}`
          : name;

  // Include the mayor/executive's name in metadata so searches for them
  // surface this city dashboard.
  let mayorLabel: string | null = null;
  if (cityId) {
    try {
      const leaders = await getPublicLeadersForCity(cityId);
      // Mayor / city exec — prefer title match (at-large council rows also have null district)
      const mayor = pickMayorFromPublicLeaders(leaders);
      if (mayor) {
        mayorLabel =
          `${mayor.title || ""} ${mayor.name}`.trim() || mayor.name;
      }
    } catch {
      // no leader data
    }
  }

  const description = datasetsCount !== null
    ? `${display} on Transparent.city. Browse ${datasetsCount} public datasets and source-linked civic context.`
    : `${display} on Transparent.city. Browse public datasets and source-linked civic context.`;

  const keywords: string[] = [
    `${display} open data`,
    `${display} city dashboard`,
    `${display} public data`,
    ...(mayorLabel
      ? [mayorLabel, `${mayorLabel} ${name}`, `${name} mayor`]
      : []),
  ];

  const ogImage = "https://transparent.city/images/app-screenshot-dashboard.png";

  return {
    title: `${display} | Public Data Dashboard | Transparent City`,
    description,
    keywords,
    alternates: {
      canonical: `/c/${slug}`,
    },
    openGraph: {
      title: display,
      description,
      url: `/c/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${display} public data dashboard` }],
    },
    twitter: {
      card: "summary_large_image",
      title: display,
      description,
      images: [ogImage],
    },
  };
}

export default async function CityLandingPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = (await searchParams) || {};
  const idParam = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  const id = idParam ? Number(idParam) : null;

  let city:
    | (Awaited<ReturnType<typeof listPublicCitiesForSitemap>>[number] & {
        display: string;
      })
    | null = null;

  let citiesFetched = false;
  let redirectTo: string | null = null;
  try {
    const cities = await listPublicCitiesForSitemap();
    citiesFetched = true;
    const match =
      typeof id === "number" && Number.isFinite(id)
        ? cities.find((c) => c.id === id)
        : cities.find((c) => getCanonicalCitySlug(c) === slug);
    if (match) {
      const canonicalSlug = getCanonicalCitySlug(match);
      if (
        canonicalSlug &&
        ((typeof id === "number" && Number.isFinite(id)) || slug !== canonicalSlug)
      ) {
        redirectTo = `/c/${canonicalSlug}`;
      } else {
        const display =
          match.state && match.country && match.country !== "United States"
            ? `${match.name}, ${match.state}, ${match.country}`
            : match.state
              ? `${match.name}, ${match.state}`
              : match.country && match.country !== "United States"
                ? `${match.name}, ${match.country}`
                : match.name;
        city = { ...match, display };
      }
    }
  } catch {
    // If we can't reach the API, fall through rather than 404-ing
    // (crawlers will retry on the next revalidation).
  }

  if (redirectTo) {
    redirect(redirectTo);
  }

  // If we successfully fetched cities but found no match, this is an
  // invalid slug. Return a real 404 so search engines don't index it.
  if (citiesFetched && !city) {
    notFound();
  }

  const cityDisplayName = city?.display ?? slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  // Fetch mayor-level dashboard data, district list, and recent maps for CityDashboardSection.
  // Feed stories are fetched separately via FeaturedStoriesAsync (Suspense-streamed).
  let cityDetail: Awaited<ReturnType<typeof getPublicCityDetail>> | null = null;
  let comparisonsMap: Awaited<
    ReturnType<typeof getPublicMetricComparisonsBatch>
  > = {};
  let districts: number[] = [];
  let maps: Awaited<ReturnType<typeof listPublicMapsForCity>> = [];
  let leaders: Awaited<ReturnType<typeof getPublicLeadersForCity>> = [];
  let cityOrdering: PublicMetricOrderingResponse | null = null;
  let geographicContext = resolvePublicGeographicContext({});
  if (city?.id) {
    try {
      const [detail, mapsRes, leadersRes, cityDistrictsRes, orderingRes, geoContext] =
        await Promise.all([
        getPublicCityDetail(city.id),
        listPublicMapsForCity(city.id).catch(() => []),
        getPublicLeadersForCity(city.id).catch(() => []),
        getPublicCityDistricts(city.id).catch((): number[] => []),
        getPublicCityMetricOrdering(city.id).catch(() => null),
        loadPublicGeographicContext(city.id),
      ]);
      cityOrdering = orderingRes;
      cityDetail = detail;
      maps = mapsRes;
      leaders = leadersRes;
      geographicContext = geoContext;
      // Use city-level districts (any metric with district data); fallback to first metric
      if (Array.isArray(cityDistrictsRes) && cityDistrictsRes.length > 0) {
        districts = filterNavigableDistricts(
          cityDistrictsRes,
          geographicContext.subdivisionNames.keys(),
          cityDetail?.geographic_structures,
        );
      }

      const metrics = cityDetail?.metrics ?? [];
      if (metrics.length > 0) {
        // Fetch comparisons and fallback district data in parallel (was sequential)
        const [batchComparisons, fallbackDc] = await Promise.all([
          getPublicMetricComparisonsBatch({
            metric_ids: metrics.map((m) => m.id),
            district: 0,
            comparison_types: ["ytd"],
          }).catch(() => ({})),
          districts.length === 0 && metrics[0]
            ? getPublicMetricDistrictComparisons(metrics[0].id, "ytd").catch(() => null)
            : Promise.resolve(null),
        ]);
        comparisonsMap = batchComparisons;
        if (districts.length === 0 && fallbackDc?.districts) {
          districts = filterNavigableDistricts(
            fallbackDc.districts
              .map((d) => d.district)
              .filter((n): n is number => typeof n === "number" && n > 0),
            geographicContext.subdivisionNames.keys(),
            cityDetail?.geographic_structures,
          );
        }
      }
    } catch {
      // leave defaults
    }
  }

  const hasContent = (city?.datasets_count ?? 0) > 0
    || (cityDetail?.metrics?.length ?? 0) > 0
    || !!cityDetail?.main_portal_url;

  return (
    <CityPageClient>
      <CityStructuredData
        cityName={city?.name ?? slug}
        citySlug={slug}
        description={`${city?.display ?? slug} on Transparent.city. Browse public datasets and source-linked civic context.`}
        datasetsCount={city?.datasets_count}
        state={city?.state}
        country={city?.country}
      />
      <CityViewTracker citySlug={slug} cityId={city?.id} />
      <PublicNavBar>
        <CitySignupButton citySlug={slug} cityName={city?.name} cityId={city?.id} />
      </PublicNavBar>

      <main id="main-content">
      {/* Section 1: City Hero */}
      <section className="city-hero-v2">
        <div className="container city-hero-v2-row">
          <div>
            <h1 className="city-hero-v2-title">
              {city ? (
                <>
                  {city.emoji && <span style={{ marginRight: "0.15em" }}>{city.emoji}</span>}
                  {city.name}
                </>
              ) : slug}
            </h1>
            {city?.state && (
              <p className="city-hero-v2-state">
                {city.state}{city.country && city.country !== "United States" ? `, ${city.country}` : ""}
              </p>
            )}
          </div>
          <div className="city-hero-v2-meta">
            {districts.length > 0 ? (
              <HeroDistrictSelector
                slug={slug}
                districts={districts}
                mayorName={cityDetail?.mayor?.name}
                leaders={leaders}
                geographicContext={geographicContext}
              />
            ) : cityDetail?.mayor?.name ? (
              <span className="city-hero-v2-mayor-inline">Mayor: {formatLeaderName(cityDetail.mayor.name)}</span>
            ) : null}
            {city?.id && (
              <DistrictFollowClaimBlock cityId={city.id} district={0} slug={slug} cityDisplayName={city.name} />
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Dashboard */}
      <div className="container city-dashboard-wrapper">
        {!hasContent ? (
          <div className="city-coming-soon">
            <div className="city-coming-soon-emoji">🚧</div>
            <h2 className="city-coming-soon-title">
              {cityDisplayName} is coming soon
            </h2>
            <p className="city-coming-soon-desc">
              We&rsquo;re setting up the civic data dashboard for {cityDisplayName}.
              Sign up to be notified when it launches.
            </p>
            <div className="city-coming-soon-signup">
              <CitySignupCTA
                citySlug={slug}
                cityName={cityDisplayName}
                label={`Get notified when ${cityDisplayName} launches`}
              />
            </div>
            <a href="/add-your-city" className="city-coming-soon-add-cta">
              Know where to find {cityDisplayName}&rsquo;s public data?
              <span>Help us launch faster &rarr;</span>
            </a>
          </div>
        ) : city?.id ? (
          <CityDashboardSection
            cityDisplayName={cityDisplayName}
            slug={slug}
            metrics={cityDetail?.metrics ?? []}
            comparisonsMap={comparisonsMap}
            districts={districts}
            maps={maps}
            datasetsCount={city.datasets_count}
            orderings={cityOrdering?.orderings
              ?.filter((o) => o.metric_id != null)
              .map((o) => ({
                metric_id: o.metric_id!,
                category_order: o.category_order,
                metric_order: o.metric_order,
                category_name: o.category_name,
                subcategory_name: o.subcategory_name ?? null,
              }))}
            cityId={city.id}
            leaders={leaders}
            geographicContext={geographicContext}
            storiesSlot={
              <Suspense fallback={<FeaturedStoriesSkeleton />}>
                <FeaturedStoriesAsync
                  cityId={city.id}
                  slug={slug}
                  cityDisplayName={cityDisplayName}
                  cityEmoji={city.emoji ?? undefined}
                  metrics={cityDetail?.metrics}
                  comparisonsMap={comparisonsMap}
                />
              </Suspense>
            }
          />
        ) : (
          <CityDashboardSection
            cityDisplayName={cityDisplayName}
            slug={slug}
            metrics={cityDetail?.metrics ?? []}
            comparisonsMap={comparisonsMap}
            districts={districts}
            maps={maps}
          />
        )}
      </div>

      {/* Section 7: Explainer + Bottom CTA — only shown to logged-out users */}
      <LoggedOutOnly>
        <section className="city-explainer-section">
          <div className="container">
            <div className="city-explainer-inner">
              <p className="city-explainer-text">
                Sign up now and get your first weekly briefing this week.
                Crime trends, housing, city spending, and more from{" "}
                {city?.name ?? slug}&rsquo;s open data portal, with links to
                every number.
              </p>
              <div className="city-explainer-cta">
                <CitySignupCTA
                  citySlug={slug}
                  cityName={city?.name ?? slug}
                  cityId={city?.id}
                />
                <a
                  href={`/get/${slug}`}
                  style={{
                    display: "inline-block",
                    marginTop: 12,
                    fontSize: 13,
                    color: "var(--brand-primary, #ad35fa)",
                    textDecoration: "none",
                  }}
                >
                  Learn more about the {city?.name ?? slug} weekly →
                </a>
              </div>
            </div>
          </div>
        </section>
      </LoggedOutOnly>

      <MobileCitySignupBar cityName={city?.name ?? slug} citySlug={slug} cityId={city?.id} />
      </main>
      <PublicFooter citySlug={slug} feedbackPageUrl={`/c/${slug}`} feedbackPageType="city" />
    </CityPageClient>
  );
}
