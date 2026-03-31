import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import "../../../../landing.css";

import {
  listPublicCitiesForSitemap,
  getPublicCityDetail,
  getPublicMetricComparisonsBatch,
  getPublicMetricDistrictComparisons,
  getPublicCityDistricts,
  getPublicLeadersForCity,
  listPublicFeedStories,
  listPublicMapsForCity,
} from "@/lib/publicApiClient";
import CitySignupButton from "../../CitySignupButton";
import CityDashboardSection from "../../CityDashboardSection";
import DistrictFollowClaimBlock from "../DistrictFollowClaimBlock";
import EmailSignInLink from "../../EmailSignInLink";
import PublicNavBar from "@/components/PublicNavBar";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ slug: string; districtId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, districtId } = await params;
  const d = parseInt(districtId, 10);
  if (!Number.isFinite(d) || d < 1) {
    return { title: "District not found – Transparent.city" };
  }
  let cityName = slug;
  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => c.slug === slug);
    if (match) {
      cityName =
        match.state && match.country && match.country !== "United States"
          ? `${match.name}, ${match.state}, ${match.country}`
          : match.state
            ? `${match.name}, ${match.state}`
            : match.name;
    }
  } catch {
    // use slug
  }
  return {
    title: `${cityName} District ${d}`,
    description: `District ${d} dashboard and newsletter for ${cityName}. Metrics, charts, and monthly updates.`,
  };
}

export default async function DistrictPage({ params }: PageProps) {
  noStore();
  const { slug, districtId } = await params;
  const d = parseInt(districtId, 10);
  if (!Number.isFinite(d) || d < 1) notFound();

  let city: (Awaited<ReturnType<typeof listPublicCitiesForSitemap>>[number] & { display: string }) | null = null;
  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => c.slug === slug);
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

  try {
    const [detail, leadersRes, feedRes, mapsRes, cityDistrictsRes] = await Promise.all([
      getPublicCityDetail(city.id),
      getPublicLeadersForCity(city.id).catch(() => []),
      listPublicFeedStories({
        city_id: city.id,
        district: d,
        limit: 10,
        order_by: "published_at",
      }).catch(() => ({ stories: [], count: 0 })),
      listPublicMapsForCity(city.id).catch(() => []),
      getPublicCityDistricts(city.id).catch((): number[] => []),
    ]);
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

  const cityDisplayName = city.display;
  const base = `/c/${slug}`;
  const metrics = cityDetail?.metrics ?? [];
  const districtLeaders = leaders.filter((l) => l.district === d);
  const primaryLeader = districtLeaders[0];
  const leaderLabel = primaryLeader
    ? `${primaryLeader.title || ""} ${primaryLeader.name}`.trim() || primaryLeader.name
    : null;
  const pageTitle = leaderLabel
    ? `${cityDisplayName} District ${d} – ${leaderLabel}`
    : `${cityDisplayName} District ${d}`;

  return (
    <>
      <PublicNavBar>
        <Link href={`${base}/methodology`} className="nav-link">
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

      <section className="features public-page-section" style={{ paddingTop: 96, paddingBottom: 48 }}>
        <div className="container">
          <header className="section-header">
            <span className="section-badge">
              {leaderLabel ? "Elected official" : `District ${d}`}
            </span>
            <h1 className="page-title">{pageTitle}</h1>
            <p className="section-description body-text">
              {leaderLabel
                ? "District dashboard, metrics, and block-level context. Sign up for monthly updates; tap any metric for detail and charts."
                : `Dashboard and newsletter for District ${d}, including block-level context. Sign up below for monthly updates; tap any metric for detail and charts.`}
            </p>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link href={base} className="btn btn-outline">
                ← Back to citywide
              </Link>
            </div>
            <DistrictFollowClaimBlock cityId={city.id} district={d} slug={slug} />
          </header>

          {/* Single sign-up: one-time link (check your email), not newsletter redirect */}
          <div style={{ marginBottom: 16, maxWidth: 480 }}>
            <EmailSignInLink label={`To get updates for ${cityDisplayName} – District ${d}.`} />
          </div>

          {/* Recent district feed stories */}
          {feedStories.length > 0 && (
            <>
              <header className="section-header" style={{ marginTop: "2.5rem", marginBottom: "1rem" }}>
                <span className="section-badge">Updates</span>
                <h2 className="section-heading">Recent district updates</h2>
              </header>
              <ul className="story-rows" style={{ marginBottom: "2rem", maxWidth: 640 }}>
                {feedStories.map((story) => {
                  const canonical =
                    story.short_hash
                      ? `/c/${slug}/stories/${story.short_hash}`
                      : story.detail_url;
                  return (
                    <li key={story.id}>
                      <a href={canonical} className="story-row">
                        <span className="story-row-title">{story.headline}</span>
                        {story.description && (
                          <p className="story-row-desc">{story.description}</p>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* Full district dashboard (same table as city page, district-scoped) */}
      <CityDashboardSection
        cityDisplayName={cityDisplayName}
        slug={slug}
        metrics={metrics}
        comparisonsMap={comparisonsMap}
        districts={districts}
        maps={maps}
        district={d}
      />

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-column">
              <div className="brand-text">
                <span className="logo-transparent">transparent</span>
                <span className="logo-city">.city</span>
              </div>
              <p className="footer-description">
                Maps, metrics, and research built from public city data—from citywide to block level—so
                residents and elected officials can share the same picture of
                what’s happening.
              </p>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">Resources</h4>
              <Link href={`${base}/methodology`} className="footer-link">
                Methodology
              </Link>
              <Link href={base} className="footer-link">
                {cityDisplayName} (citywide)
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
    </>
  );
}
