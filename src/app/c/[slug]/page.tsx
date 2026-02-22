import type { Metadata } from "next";
import Link from "next/link";

import "../../landing.css";

import {
  listPublicCitiesForSitemap,
  getPublicCityDetail,
  getPublicMetricComparisonsBatch,
  getPublicMetricDistrictComparisons,
  listPublicMapsForCity,
} from "@/lib/publicApiClient";
import CitySignupButton from "./CitySignupButton";
import CityDashboardSection from "./CityDashboardSection";
import CityDashboardSectionWithOrdering from "./CityDashboardSectionWithOrdering";
import CityViewTracker from "./CityViewTracker";
import CityPageClient from "./CityPageClient";
import CityHeroNewsletter from "./CityHeroNewsletter";
import CustomizeMetricsTrigger from "./CustomizeMetricsTrigger";

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
  const description =
    datasetsCount !== null
      ? `${display} on Transparent.city. Browse ${datasetsCount} public datasets and source-linked civic context.`
      : `${display} on Transparent.city. Browse public datasets and source-linked civic context.`;

  return {
    title: display,
    description,
    alternates: {
      canonical:
        typeof id === "number" && Number.isFinite(id)
          ? `/c/${slug}?id=${id}`
          : `/c/${slug}`,
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
  if (city?.id) {
    try {
      cityDetail = await getPublicCityDetail(city.id);
      const metrics = cityDetail?.metrics ?? [];
      if (metrics.length > 0) {
        comparisonsMap = await getPublicMetricComparisonsBatch({
          metric_ids: metrics.map((m) => m.id),
          district: 0,
          comparison_types: ["ytd"],
        }).catch(() => ({}));
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
      maps = await listPublicMapsForCity(city.id).catch(() => []);
    } catch {
      // leave defaults
    }
  }

  const uniqueCategories = Array.from(
    new Set(
      (cityDetail?.metrics ?? [])
        .map((m) => m.category)
        .filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => a.localeCompare(b));

  return (
    <CityPageClient>
      <CityViewTracker citySlug={slug} cityId={city?.id} />
      <nav className="navbar">
        <div className="container">
          <div className="nav-content">
            <Link href="/" className="logo" style={{ textDecoration: "none" }}>
              <span className="logo-text">
                <span className="logo-transparent">transparent</span>
                <span className="logo-city">.city</span>
              </span>
            </Link>
            <div className="nav-links">
              <Link href={`/c/${slug}/methodology`} className="nav-link">
                Methodology
              </Link>
              <a
                href="https://www.transparentsf.com"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link"
              >
                Newsletter
              </a>
              <Link href="/sitemap" className="nav-link">
                Site map
              </Link>
              <Link href="/" className="nav-link">
                Home
              </Link>
              <CitySignupButton />
            </div>
          </div>
        </div>
      </nav>

      <section className="hero" style={{ paddingTop: 56 }}>
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <span className="badge">City page</span>
              <h1 className="hero-title">
                {city ? `${city.emoji || "🏙️"} ${city.display}` : slug}
              </h1>
              <p className="hero-description">
                {city
                  ? `Browse ${city.datasets_count} public datasets and source-linked civic context.`
                  : "Browse public datasets and source-linked civic context."}
              </p>

              {/* Mayor and subscriber count - prominent in hero */}
              {(cityDetail?.mayor || cityDetail?.mayor_subscriber_count != null) && (
                <div className="hero-mayor-subscribers">
                  {cityDetail?.mayor && (
                    <span className="hero-mayor-name">Mayor {cityDetail.mayor.name}</span>
                  )}
                  {cityDetail?.mayor && cityDetail?.mayor_subscriber_count != null && (
                    <span className="hero-mayor-sep"> · </span>
                  )}
                  {cityDetail?.mayor_subscriber_count != null && (
                    <span className="hero-subscriber-count">
                      {cityDetail.mayor_subscriber_count} followers
                    </span>
                  )}
                </div>
              )}
              
              {/* Newsletter Signup - Above the fold */}
              <div className="hero-newsletter">
                <CityHeroNewsletter cityName={city?.display ?? slug} />
              </div>

              {/* Category links and customize metrics - below newsletter */}
              {(uniqueCategories.length > 0 || (city?.id && (cityDetail?.metrics?.length ?? 0) > 0)) && (
                <div className="hero-category-links">
                  {uniqueCategories.map((cat) => (
                    <Link
                      key={cat}
                      href={`/c/${slug}/category/${encodeURIComponent(cat)}`}
                      className="hero-category-link"
                    >
                      {cat}
                    </Link>
                  ))}
                  {city?.id && (cityDetail?.metrics?.length ?? 0) > 0 && (
                    <CustomizeMetricsTrigger
                      cityId={city.id}
                      cityName={city.display}
                      metrics={(cityDetail!.metrics ?? []).map((m) => ({
                        id: m.id,
                        metric_name: m.metric_name,
                        category: m.category,
                        subcategory: m.subcategory ?? null,
                        sub_category: m.subcategory ?? null,
                      }))}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="hero-background">
          <div className="gradient-orb orb-1" />
          <div className="gradient-orb orb-2" />
          <div className="gradient-orb orb-3" />
        </div>
      </section>

      {city?.id ? (
        <CityDashboardSectionWithOrdering
          cityId={city.id}
          cityDisplayName={cityDisplayName}
          slug={slug}
          metrics={cityDetail?.metrics ?? []}
          comparisonsMap={comparisonsMap}
          districts={districts}
          maps={maps}
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

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-column">
              <div className="logo">
                <span className="logo-text">
                  <span className="logo-transparent">transparent</span>
                  <span className="logo-city">.city</span>
                </span>
              </div>
              <p className="footer-description">
                Maps, metrics, and research built from public city data—so
                residents and elected officials can share the same picture of what’s
                happening.
              </p>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">Resources</h4>
              <Link href={`/c/${slug}/methodology`} className="footer-link">
                Methodology
              </Link>
              <Link href="/sitemap" className="footer-link">
                Site Map
              </Link>
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

