import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { CityStructuredData } from "@/components/StructuredData";

import "../../landing.css";

import {
  listPublicCitiesForSitemap,
  getPublicCityDetail,
  getPublicMetricComparisonsBatch,
  getPublicMetricDistrictComparisons,
  getPublicCityDistricts,
  listPublicMapsForCity,
  getPublicLeadersForCity,
  listPublicFeedStories,
  getPublicCityMetricOrdering,
  type PublicFeedStory,
  type PublicMetricOrderingResponse,
} from "@/lib/publicApiClient";
import CitySignupButton from "./CitySignupButton";
import NavEmailSignup from "./NavEmailSignup";
import CityDashboardSection from "./CityDashboardSection";
import CityDashboardSectionWithOrdering from "./CityDashboardSectionWithOrdering";
import CityViewTracker from "./CityViewTracker";
import CityPageClient from "./CityPageClient";
import PublicNavBar from "@/components/PublicNavBar";
import KeyNumbersStrip from "./KeyNumbersStrip";
import DashboardCardGrid from "./DashboardCardGrid";
import DashboardSwitch from "./DashboardSwitch";
import CityMapPreview from "./CityMapPreview";
import FeaturedStories from "./FeaturedStories";
import CityHeroNewsletter from "./CityHeroNewsletter";
import PageFeedback from "@/components/PageFeedback";

export const revalidate = 3600;

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
        : cities.find((c) => c.slug === slug);
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
      // Mayor / city exec sits at district 0 or null
      const mayor = leaders.find((l) => l.district === 0 || l.district === null);
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
    },
  };
}

export default async function CityLandingPage({ params, searchParams }: PageProps) {
  noStore();
  const { slug } = await params;
  const sp = (await searchParams) || {};
  const idParam = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  const id = idParam ? Number(idParam) : null;

  let city:
    | (Awaited<ReturnType<typeof listPublicCitiesForSitemap>>[number] & {
        display: string;
      })
    | null = null;

  try {
    const cities = await listPublicCitiesForSitemap();
    const match =
      typeof id === "number" && Number.isFinite(id)
        ? cities.find((c) => c.id === id)
        : cities.find((c) => c.slug === slug);
    if (match) {
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
  } catch {
    // noop
  }

  const cityDisplayName = city?.display ?? slug;
  // Fetch mayor-level dashboard data, district list, and recent maps for CityDashboardSection
  let cityDetail: Awaited<ReturnType<typeof getPublicCityDetail>> | null = null;
  let comparisonsMap: Awaited<
    ReturnType<typeof getPublicMetricComparisonsBatch>
  > = {};
  let districts: number[] = [];
  let maps: Awaited<ReturnType<typeof listPublicMapsForCity>> = [];
  let leaders: Awaited<ReturnType<typeof getPublicLeadersForCity>> = [];
  let feedStories: PublicFeedStory[] = [];
  let cityOrdering: PublicMetricOrderingResponse | null = null;
  if (city?.id) {
    try {
      const [detail, mapsRes, leadersRes, cityDistrictsRes, feedRes, orderingRes] = await Promise.all([
        getPublicCityDetail(city.id),
        listPublicMapsForCity(city.id).catch(() => []),
        getPublicLeadersForCity(city.id).catch(() => []),
        getPublicCityDistricts(city.id).catch((): number[] => []),
        listPublicFeedStories({ city_id: city.id, district: 0, limit: 6, order_by: "published_at" }).catch(() => ({ stories: [], count: 0 })),
        getPublicCityMetricOrdering(city.id).catch(() => null),
      ]);
      cityOrdering = orderingRes;
      feedStories = feedRes.stories ?? [];
      cityDetail = detail;
      maps = mapsRes;
      leaders = leadersRes;
      // Use city-level districts (any metric with district data); fallback to first metric
      if (Array.isArray(cityDistrictsRes) && cityDistrictsRes.length > 0) {
        districts = [...cityDistrictsRes].sort((a, b) => a - b);
      }
      const metrics = cityDetail?.metrics ?? [];
      if (metrics.length > 0) {
        comparisonsMap = await getPublicMetricComparisonsBatch({
          metric_ids: metrics.map((m) => m.id),
          district: 0,
          comparison_types: ["ytd"],
        }).catch(() => ({}));
        if (districts.length === 0) {
          const dc = await getPublicMetricDistrictComparisons(
            metrics[0].id,
            "ytd"
          ).catch(() => null);
          if (dc?.districts)
            districts = dc.districts
              .map((d) => d.district)
              .filter((n) => n > 0)
              .sort((a, b) => a - b);
        }
      }
    } catch {
      // leave defaults
    }
  }

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
        <NavEmailSignup citySlug={slug} cityName={city?.name} />
      </PublicNavBar>

      {/* Section 1: City Hero */}
      <section className="city-hero-v2">
        <div className="container city-hero-v2-inner">
          <div className="city-hero-v2-left">
            <h1 className="city-hero-v2-title">
              {city ? `${city.emoji || ""} ${city.display}` : slug}
            </h1>
            {city?.datasets_count && (
              <p className="city-hero-v2-datasets">{city.datasets_count} public datasets</p>
            )}
          </div>
          <div className="city-hero-v2-right">
            <p className="city-hero-v2-subtitle">
              {city?.name
                ? `${city.name}'s public data, tracked and explained.`
                : "Public data, tracked and explained."}
            </p>
            {cityDetail?.mayor?.name && (
              <p className="city-hero-v2-mayor">
                Mayor {cityDetail.mayor.name}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Key Numbers Strip */}
      {cityDetail?.is_launched !== false && (
        <KeyNumbersStrip
          slug={slug}
          metrics={cityDetail?.metrics ?? []}
          comparisonsMap={comparisonsMap}
        />
      )}

      {/* Section 3: Dashboard */}
      <div className="container city-dashboard-wrapper">
        {cityDetail && cityDetail.is_launched === false ? (
          <div style={{
            textAlign: "center",
            padding: "64px 24px",
            maxWidth: 540,
            margin: "0 auto",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 12 }}>
              {cityDisplayName} is coming soon
            </h2>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
              We&rsquo;re setting up the civic data dashboard for {cityDisplayName}.
              Sign up below to be notified when it launches.
            </p>
          </div>
        ) : city?.id ? (
          <DashboardSwitch
            cardGrid={
              <DashboardCardGrid
                cityDisplayName={cityDisplayName}
                slug={slug}
                metrics={cityDetail?.metrics ?? []}
                comparisonsMap={comparisonsMap}
                districts={districts}
                maps={maps}
                orderings={cityOrdering?.orderings?.filter((o) => o.metric_id != null).map((o) => ({
                  metric_id: o.metric_id!,
                  category_order: o.category_order,
                  metric_order: o.metric_order,
                  category_name: o.category_name,
                  subcategory_name: o.subcategory_name ?? null,
                }))}
                cityId={city.id}
                leaders={leaders}
              />
            }
            tableView={
              <CityDashboardSectionWithOrdering
                cityId={city.id}
                cityDisplayName={cityDisplayName}
                slug={slug}
                metrics={cityDetail?.metrics ?? []}
                comparisonsMap={comparisonsMap}
                districts={districts}
                maps={maps}
                leaders={leaders}
                cityOrdering={cityOrdering?.orderings ?? []}
              />
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

      {/* Section 4: Map Preview */}
      {maps.length > 0 && cityDetail?.is_launched !== false && (
        <CityMapPreview
          cityName={city?.name ?? slug}
          slug={slug}
          maps={maps}
        />
      )}

      {/* Section 5: Featured Stories */}
      {cityDetail?.is_launched !== false && feedStories.length > 0 && (
        <FeaturedStories
          slug={slug}
          cityDisplayName={cityDisplayName}
          stories={feedStories}
        />
      )}

      {/* Section 6: Explainer + Bottom CTA */}
      <section className="city-explainer-section">
        <div className="container">
          <div className="city-explainer-inner">
            <p className="city-explainer-text">
              Transparent City tracks live government data across 600+ cities so
              residents and officials share the same picture of what is happening.
              Every number links to its public source. Sign up to customize your
              dashboard, explore block-level maps, and get weekly briefings.
            </p>
            <div className="city-explainer-cta">
              <CityHeroNewsletter
                cityName={city?.name ?? slug}
                citySlug={slug}
                label="Sign up free for the full picture."
              />
            </div>
          </div>
        </div>
      </section>

      <div className="container" style={{ paddingBottom: 40 }}>
        <PageFeedback pageUrl={`/c/${slug}`} pageType="city" />
      </div>

      <footer className="footer city-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-column">
              <div className="brand-text">
                <span className="logo-transparent">transparent</span>
                <span className="logo-city">.city</span>
              </div>
              <p className="footer-description">
                Maps, metrics, and research built from public city data so residents and
                elected officials can share the same picture of what is happening.
              </p>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">Explore</h4>
              <Link href={`/c/${slug}/methodology`} className="footer-link">
                Methodology
              </Link>
              <Link href="/sitemap" className="footer-link">
                All cities
              </Link>
              <Link href="/" className="footer-link">
                Home
              </Link>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">Get involved</h4>
              <Link href="/pro" className="footer-link">
                Add your city
              </Link>
              <a
                href="https://www.transparentsf.com"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-link"
              >
                Newsletter
              </a>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">Contact</h4>
              <a href="mailto:hello@transparentcity.com" className="footer-link">
                hello@transparentcity.com
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>
              &copy; 2026 Transparent.city. The difference between knowing and
              guessing is agency.
            </p>
          </div>
        </div>
      </footer>
    </CityPageClient>
  );
}

