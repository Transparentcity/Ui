import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import "../../../landing.css";

import {
  getPublicCityDetail,
  listPublicCitiesForSitemap,
} from "@/lib/publicApiClient";
import { formatLeaderName, slugify } from "@/lib/utils";
import { mandatesEnabled } from "@/lib/mandates";
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
    title: `Legal Mandates | ${display}`,
    description: `Standards ${display} is required to meet by statute, with the latest figure, whether the city met it, and the law that requires it.`,
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

  // Same header as the city dashboard: title, state, mayor and follow.
  const cityDetail = await getPublicCityDetail(city.id).catch(() => null);

  return (
    <SignupEmailProvider>
      <CityViewTracker citySlug={slug} cityId={city.id} />
      <PublicNavBar>
        <CitySignupButton citySlug={slug} cityName={city.display} />
      </PublicNavBar>

      <main id="main-content">
      <section className="city-hero-v2">
        <div className="container city-hero-v2-row">
          <div>
            <Link href={`/c/${slug}`} className="city-hero-v2-back">
              &larr; {city.name} dashboard
            </Link>
            <h1 className="city-hero-v2-title">
              {city.emoji && <span style={{ marginRight: "0.15em" }}>{city.emoji}</span>}
              {city.name}&rsquo;s Legal Mandates
            </h1>
            {city.state && <p className="city-hero-v2-state">{city.state}</p>}
            <p className="city-hero-v2-desc">
              Standards {city.name} is required to meet by statute: federal and state law,
              and the city&rsquo;s own charter and code. Each one shows the latest figure,
              whether the city met it, and the law that requires it.
            </p>
          </div>
          <div className="city-hero-v2-meta">
            {cityDetail?.mayor?.name && (
              <span className="city-hero-v2-mayor-inline">
                Mayor: {formatLeaderName(cityDetail.mayor.name)}
              </span>
            )}
            <DistrictFollowClaimBlock
              cityId={city.id}
              district={0}
              slug={slug}
              cityDisplayName={city.name}
            />
          </div>
        </div>
      </section>

      <MandateScorecardClient cityId={city.id} slug={slug} cityName={city.name} />
      </main>

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
