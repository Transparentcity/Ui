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
  listPublicMapsForCity,
} from "@/lib/publicApiClient";
import EmailSignInLink from "../../EmailSignInLink";
import CitySignupButton from "../../CitySignupButton";
import CityViewTracker from "../../CityViewTracker";
import CustomizeMetricsTrigger from "../../CustomizeMetricsTrigger";
import DistrictFollowClaimBlock from "../../district/DistrictFollowClaimBlock";
import CategoryDashboardSection from "./CategoryDashboardSection";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ slug: string; category: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function decodeCategory(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { slug, category } = await params;
  const sp = (await searchParams) || {};
  const idParam = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  const id = idParam ? Number(idParam) : null;
  const categoryName = decodeCategory(category);

  let name = slug;
  let state: string | null | undefined = null;
  let country: string | null | undefined = null;

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
    }
  } catch {
    // Keep fallback for crawlers
  }

  const display =
    state && country && country !== "United States"
      ? `${name}, ${state}, ${country}`
      : state
        ? `${name}, ${state}`
        : country && country !== "United States"
          ? `${name}, ${country}`
          : name;

  const title = `${categoryName} | ${display}`;
  const description = `${categoryName} metrics and data for ${display}. Browse source-linked civic context on Transparent.city.`;

  return {
    title,
    description,
    alternates: {
      canonical:
        typeof id === "number" && Number.isFinite(id)
          ? `/c/${slug}/category/${encodeURIComponent(categoryName)}?id=${id}`
          : `/c/${slug}/category/${encodeURIComponent(categoryName)}`,
    },
  };
}

export default async function CityCategoryPage({
  params,
  searchParams,
}: PageProps) {
  noStore();
  const { slug, category } = await params;
  const sp = (await searchParams) || {};
  const idParam = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  const id = idParam ? Number(idParam) : null;
  const categoryName = decodeCategory(category);

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

  if (!city) {
    notFound();
  }

  const cityDisplayName = city.display;
  const idQuery =
    typeof id === "number" && Number.isFinite(id) ? `?id=${id}` : "";
  let cityDetail: Awaited<ReturnType<typeof getPublicCityDetail>> | null = null;
  let comparisonsMap: Awaited<
    ReturnType<typeof getPublicMetricComparisonsBatch>
  > = {};
  let districts: number[] = [];
  let maps: Awaited<ReturnType<typeof listPublicMapsForCity>> = [];

  try {
    const [detail, cityDistrictsRes, mapsRes] = await Promise.all([
      getPublicCityDetail(city.id),
      getPublicCityDistricts(city.id).catch((): number[] => []),
      listPublicMapsForCity(city.id).catch(() => []),
    ]);
    cityDetail = detail;
    maps = mapsRes;
    if (Array.isArray(cityDistrictsRes) && cityDistrictsRes.length > 0) {
      districts = [...cityDistrictsRes].sort((a, b) => a - b);
    }
    const allMetrics = cityDetail?.metrics ?? [];
    const categoryMetrics = allMetrics.filter(
      (m) => (m.category || "Uncategorized") === categoryName
    );

    if (categoryMetrics.length === 0) {
      notFound();
    }

    comparisonsMap = await getPublicMetricComparisonsBatch({
      metric_ids: categoryMetrics.map((m) => m.id),
      district: 0,
      comparison_types: ["ytd"],
    }).catch(() => ({}));

    if (districts.length === 0) {
      const dc = await getPublicMetricDistrictComparisons(
        categoryMetrics[0].id,
        "ytd"
      ).catch(() => null);
      if (dc?.districts)
        districts = dc.districts
          .map((d) => d.district)
          .filter((n) => n > 0)
          .sort((a, b) => a - b);
    }
  } catch {
    notFound();
  }

  const categoryMetricsList = (cityDetail?.metrics ?? []).filter(
    (m) => (m.category || "Uncategorized") === categoryName
  );

  return (
    <>
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
              <Link href={`/c/${slug}${idQuery}`} className="nav-link">
                {cityDisplayName}
              </Link>
              <CitySignupButton />
            </div>
          </div>
        </div>
      </nav>

      <section className="hero" style={{ paddingTop: 96 }}>
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <span className="badge">City page</span>
              <h1 className="hero-title">
                {city ? `${city.emoji || "🏙️"} ${cityDisplayName}` : slug} —{" "}
                {categoryName}
              </h1>
              <p className="hero-description">
                Metrics and data for {categoryName}. Browse source-linked civic
                context.
              </p>

              {/* City official (mayor): same treatment as district – follow + claim */}
              {(cityDetail?.mayor || cityDetail?.mayor_subscriber_count != null) && city?.id && (
                <div className="hero-mayor-subscribers hero-official-row">
                  <span className="hero-mayor-name">
                    Mayor {cityDetail?.mayor?.name ?? "Citywide"}
                  </span>
                  <DistrictFollowClaimBlock cityId={city.id} district={0} slug={slug} />
                </div>
              )}

              <div className="hero-newsletter">
                <EmailSignInLink label={`To get updates for ${cityDisplayName}.`} />
              </div>

              {(() => {
                const uniqueCategories = Array.from(
                  new Set(
                    (cityDetail?.metrics ?? [])
                      .map((m) => m.category)
                      .filter((c): c is string => Boolean(c))
                  )
                ).sort((a, b) => a.localeCompare(b));
                const hasMetrics = (cityDetail?.metrics?.length ?? 0) > 0;
                return (
                  (uniqueCategories.length > 0 || hasMetrics) && (
                    <div className="hero-category-links">
                      {uniqueCategories.map((cat) => (
                        <Link
                          key={cat}
                          href={`/c/${slug}/category/${encodeURIComponent(cat)}${idQuery}`}
                          className={`hero-category-link ${cat === categoryName ? "hero-category-link-active" : ""}`}
                        >
                          {cat}
                        </Link>
                      ))}
                      {hasMetrics && cityDetail && (
                        <CustomizeMetricsTrigger
                          cityId={city.id}
                          cityName={cityDisplayName}
                          metrics={cityDetail.metrics.map((m) => ({
                            id: m.id,
                            metric_name: m.metric_name,
                            category: m.category,
                            subcategory: m.subcategory ?? null,
                            sub_category: m.subcategory ?? null,
                          }))}
                        />
                      )}
                    </div>
                  )
                );
              })()}
            </div>
          </div>
        </div>
        <div className="hero-background">
          <div className="gradient-orb orb-1" />
          <div className="gradient-orb orb-2" />
          <div className="gradient-orb orb-3" />
        </div>
      </section>

      <CategoryDashboardSection
        cityDisplayName={cityDisplayName}
        slug={slug}
        categoryName={categoryName}
        metrics={categoryMetricsList}
        comparisonsMap={comparisonsMap}
        districts={districts}
        maps={maps}
      />

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
                residents and elected officials can share the same picture of
                what's happening.
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
              <Link href={`/c/${slug}${idQuery}`} className="footer-link">
                {cityDisplayName}
              </Link>
            </div>
          </div>
          <div className="footer-bottom">
            <p>
              &copy; 2026 Transparent.city.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
