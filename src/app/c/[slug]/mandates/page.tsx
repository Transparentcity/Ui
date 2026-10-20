import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import "../../../landing.css";

import {
  getPublicCityDetail,
  getPublicCityMetricOrdering,
  listPublicCitiesForSitemap,
  type PublicMetricOrderingResponse,
} from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";
import { resolveDisplayCategory } from "@/lib/metricOrderingDisplay";
import { LEGAL_STANDARDS_LABEL, isLegalMandateCategory, mandatesEnabled } from "@/lib/mandates";
import CityViewTracker from "../CityViewTracker";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import CitySignupButton from "../CitySignupButton";
import CitySignupCTA from "../CitySignupCTA";
import DistrictFollowClaimBlock from "../district/DistrictFollowClaimBlock";
import LoggedOutOnly from "../LoggedOutOnly";
import { SignupEmailProvider } from "../SignupEmailContext";
import MandateScorecardClient from "./MandateScorecardClient";

type City = Awaited<ReturnType<typeof listPublicCitiesForSitemap>>[number];

function getCanonicalCitySlug(city: City): string {
  return city.slug || slugify(city.name);
}

function cityDisplay(city: City): string {
  return city.state && city.country && city.country !== "United States"
    ? `${city.name}, ${city.state}, ${city.country}`
    : city.state
      ? `${city.name}, ${city.state}`
      : city.country && city.country !== "United States"
        ? `${city.name}, ${city.country}`
        : city.name;
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let display = slug;
  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => getCanonicalCitySlug(c) === slug);
    if (match) display = cityDisplay(match);
  } catch {
    // Keep fallback
  }
  return {
    title: `${LEGAL_STANDARDS_LABEL} | ${display}`,
    description: `Is ${display} meeting the standards state and local law require? Each one with the latest figure, whether it was met, and the law behind it.`,
    alternates: { canonical: `/c/${slug}/mandates` },
    // Dark launch: keep out of search until the scorecard is public.
    robots: { index: false, follow: false },
  };
}

export default async function CityMandatesPage({ params }: PageProps) {
  noStore();
  if (!mandatesEnabled()) notFound();

  const { slug } = await params;

  let match: City | undefined;
  try {
    const cities = await listPublicCitiesForSitemap();
    match = cities.find((c) => getCanonicalCitySlug(c) === slug);
  } catch {
    // noop
  }
  if (!match) notFound();
  const city = { ...match, display: cityDisplay(match) };

  // Same hero as the category page: mayor row, signup, category chips.
  // Each call swallows its own failure; the scorecard still renders without the chips.
  const [cityDetail, cityOrdering] = await Promise.all([
    getPublicCityDetail(city.id).catch(() => null),
    getPublicCityMetricOrdering(city.id).catch((): PublicMetricOrderingResponse | null => null),
  ]);
  const orderingByMetricId = new Map(
    (cityOrdering?.orderings ?? [])
      .filter((o) => o.metric_id != null)
      .map((o) => [o.metric_id!, o] as const)
  );
  const categories = Array.from(
    new Set(
      (cityDetail?.metrics ?? [])
        .filter((m) => !isLegalMandateCategory(m.category))
        .map((m) => {
          const ord = orderingByMetricId.get(m.id);
          return resolveDisplayCategory(ord?.category_name, m.category);
        })
    )
  ).sort((a, b) => a.localeCompare(b));

  return (
    <SignupEmailProvider>
      <CityViewTracker citySlug={slug} cityId={city.id} />
      <PublicNavBar>
        <CitySignupButton citySlug={slug} cityName={city.display} />
      </PublicNavBar>

      <section className="hero" style={{ paddingTop: 96 }}>
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <span className="badge">{LEGAL_STANDARDS_LABEL}</span>
              <h1 className="hero-title">
                {`${city.emoji || "🏙️"} ${city.display}`} — {LEGAL_STANDARDS_LABEL}
              </h1>
              <p className="hero-description">
                Is {city.name} meeting the standards state and local law require? Each one
                with the latest figure, whether it was met, and the law behind it.
              </p>

              {(cityDetail?.mayor || cityDetail?.mayor_subscriber_count != null) && (
                <div className="hero-mayor-subscribers hero-official-row">
                  <span className="hero-mayor-name">
                    Mayor {cityDetail?.mayor?.name ?? "Citywide"}
                  </span>
                  <DistrictFollowClaimBlock
                    cityId={city.id}
                    district={0}
                    slug={slug}
                    cityDisplayName={city.name}
                  />
                </div>
              )}

              <div className="hero-newsletter">
                <CitySignupCTA
                  citySlug={slug}
                  cityName={city.display}
                  label={`Sign up for ${city.display} updates`}
                />
              </div>

              <div className="hero-category-links">
                <Link href={`/c/${slug}`} className="hero-category-link">
                  Dashboard
                </Link>
                {categories.map((cat) => (
                  <Link
                    key={cat}
                    href={`/c/${slug}/category/${encodeURIComponent(cat)}`}
                    className="hero-category-link"
                  >
                    {cat}
                  </Link>
                ))}
                <Link
                  href={`/c/${slug}/mandates`}
                  className="hero-category-link hero-category-link-active"
                  aria-current="page"
                >
                  {LEGAL_STANDARDS_LABEL}
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="hero-background">
          <div className="gradient-orb orb-1" />
          <div className="gradient-orb orb-2" />
          <div className="gradient-orb orb-3" />
        </div>
      </section>

      <MandateScorecardClient cityId={city.id} slug={slug} cityName={city.name} />

      <LoggedOutOnly>
        <section className="city-explainer-section">
          <div className="container">
            <div className="city-explainer-inner">
              <p className="city-explainer-text">
                {city.name}&rsquo;s public data, explained once a week. Crime trends,
                housing, city services, and 311 reports, sourced from {city.name}&rsquo;s
                open data portal with links to every number.
              </p>
              <div className="city-explainer-cta">
                <CitySignupCTA citySlug={slug} cityName={city.name} />
              </div>
            </div>
          </div>
        </section>
      </LoggedOutOnly>

      <PublicFooter
        citySlug={slug}
        feedbackPageUrl={`/c/${slug}/mandates`}
        feedbackPageType="category"
      />
    </SignupEmailProvider>
  );
}
