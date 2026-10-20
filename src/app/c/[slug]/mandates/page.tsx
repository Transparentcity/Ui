import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import "../../../landing.css";

import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";
import { mandatesEnabled } from "@/lib/mandates";
import CityViewTracker from "../CityViewTracker";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import CitySignupButton from "../CitySignupButton";
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
    title: `Legal standards | ${display}`,
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

  return (
    <SignupEmailProvider>
      <CityViewTracker citySlug={slug} cityId={city.id} />
      <PublicNavBar>
        <CitySignupButton citySlug={slug} cityName={city.display} />
      </PublicNavBar>

      <section className="hero" style={{ padding: "96px 0 40px" }}>
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <h1 className="hero-title">
                {`${city.emoji || "🏙️"} Is ${city.name} meeting its legal standards?`}
              </h1>
              <div className="hero-category-links">
                <Link href={`/c/${slug}`} className="hero-category-link">
                  ← {city.name} dashboard
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

      <section style={{ padding: "8px 0 64px" }}>
        <div className="container">
          <MandateScorecardClient cityId={city.id} slug={slug} cityName={city.name} />
        </div>
      </section>

      <PublicFooter
        citySlug={slug}
        feedbackPageUrl={`/c/${slug}/mandates`}
        feedbackPageType="category"
      />
    </SignupEmailProvider>
  );
}
