import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

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
  type PublicFeedStory,
} from "@/lib/publicApiClient";
import CitySignupButton from "./CitySignupButton";
import CityDashboardSection from "./CityDashboardSection";
import CityDashboardSectionWithOrdering from "./CityDashboardSectionWithOrdering";
import CityViewTracker from "./CityViewTracker";
import CityPageClient from "./CityPageClient";
import CityHeroNewsletter from "./CityHeroNewsletter";
import CustomizeMetricsTrigger from "./CustomizeMetricsTrigger";
import DistrictFollowClaimBlock from "./district/DistrictFollowClaimBlock";
import PublicNavBar from "@/components/PublicNavBar";

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
  if (city?.id) {
    try {
      const [detail, mapsRes, leadersRes, cityDistrictsRes, feedRes] = await Promise.all([
        getPublicCityDetail(city.id),
        listPublicMapsForCity(city.id).catch(() => []),
        getPublicLeadersForCity(city.id).catch(() => []),
        getPublicCityDistricts(city.id).catch((): number[] => []),
        listPublicFeedStories({ city_id: city.id, district: 0, limit: 6, order_by: "published_at" }).catch(() => ({ stories: [], count: 0 })),
      ]);
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
      <PublicNavBar>
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
      </PublicNavBar>

      {/* Compact hero: city name + quick context, then straight into the dashboard */}
      <section className="city-hero" style={{ paddingTop: 96 }}>
        <div className="container">
          <div className="city-hero-inner">
            <div className="city-hero-left">
              <h1 className="city-hero-title">
                {city ? `${city.emoji || "🏙️"} ${city.display}` : slug}
              </h1>
              <p className="city-hero-subtitle">
                {city
                  ? `${city.datasets_count} public datasets tracked, from citywide to block level.`
                  : "Public datasets tracked, from citywide to block level."}
              </p>
              {/* City official (mayor) */}
              {(cityDetail?.mayor || cityDetail?.mayor_subscriber_count != null) && city?.id && (
                <div className="hero-mayor-subscribers hero-official-row">
                  <span className="hero-mayor-name">
                    Mayor {cityDetail?.mayor?.name ?? "Citywide"}
                  </span>
                  <DistrictFollowClaimBlock cityId={city.id} district={0} slug={slug} />
                </div>
              )}
            </div>
            <div className="city-hero-right">
              <CityHeroNewsletter cityName={city?.display ?? slug} />
            </div>
          </div>
          {/* Category pills */}
          {uniqueCategories.length > 0 && (
            <div className="city-hero-categories">
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
      </section>

      {/* Dashboard: the main event */}
      <div className="container city-dashboard-wrapper">
        {city?.id ? (
          <CityDashboardSectionWithOrdering
            cityId={city.id}
            cityDisplayName={cityDisplayName}
            slug={slug}
            metrics={cityDetail?.metrics ?? []}
            comparisonsMap={comparisonsMap}
            districts={districts}
            maps={maps}
            leaders={leaders}
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

      {/* Feed: recent city stories from the feed producer */}
      {feedStories.length > 0 && (
        <section style={{ paddingTop: 40, paddingBottom: 40 }}>
          <div className="container">
            <header className="section-header" style={{ marginBottom: "1.25rem" }}>
              <span className="section-badge">What&rsquo;s happening</span>
              <h2 className="section-heading">Latest from {cityDisplayName}</h2>
            </header>
            <ul className="story-rows" style={{ maxWidth: 700 }}>
              {feedStories.map((story) => {
                const canonical =
                  story.short_hash
                    ? `/c/${slug}/stories/${story.short_hash}`
                    : story.detail_url;
                return (
                  <li key={story.id}>
                    <a
                      href={canonical}
                      className="story-row"
                    >
                      {story.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={story.image_url}
                          alt=""
                          className="story-row-img"
                          style={{ width: 72, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span className="story-row-title">{story.headline}</span>
                        {story.description && (
                          <p className="story-row-desc">{story.description}</p>
                        )}
                        {story.published_at && (
                          <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>
                            {new Date(story.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        )}
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* Benefits + sign-up CTA */}
      <section className="city-benefits-section">
        <div className="container">
          <h2 className="city-benefits-heading">
            This is just the public view. Sign up (free) to unlock the full picture.
          </h2>
          <div className="city-benefits-grid">
            <div className="city-benefit-card">
              <span className="city-benefit-icon">📊</span>
              <h3 className="city-benefit-title">Personalized dashboard</h3>
              <p className="city-benefit-desc">
                Customize which metrics you see, reorder categories, and save your
                layout so you can track the issues you care about most.
              </p>
            </div>
            <div className="city-benefit-card">
              <span className="city-benefit-icon">🗺️</span>
              <h3 className="city-benefit-title">Block-level maps</h3>
              <p className="city-benefit-desc">
                Interactive maps that show data at the neighborhood and block level,
                not just city averages. See what is happening where you actually live.
              </p>
            </div>
            <div className="city-benefit-card">
              <span className="city-benefit-icon">🔔</span>
              <h3 className="city-benefit-title">Alerts and updates</h3>
              <p className="city-benefit-desc">
                Follow your district or specific metrics and get notified when new data
                drops or when something changes significantly.
              </p>
            </div>
            <div className="city-benefit-card">
              <span className="city-benefit-icon">📝</span>
              <h3 className="city-benefit-title">Source-linked research</h3>
              <p className="city-benefit-desc">
                Every number links back to the public source it came from. Read AI-assisted
                research writeups that explain what the data actually means.
              </p>
            </div>
          </div>
          <div className="city-benefits-cta">
            <CitySignupButton />
          </div>
        </div>
      </section>

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
              <Link href="/claim" className="footer-link">
                Elected officials
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

