import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import "../../../landing.css";

import { LEGAL_STANDARDS_LABEL, mandatesEnabled } from "@/lib/mandates";
import CityViewTracker from "../CityViewTracker";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import CitySignupButton from "../CitySignupButton";
import CitySignupCTA from "../CitySignupCTA";
import CitySubpageHero, { findSubpageCity } from "../CitySubpageHero";
import LoggedOutOnly from "../LoggedOutOnly";
import { SignupEmailProvider } from "../SignupEmailContext";
import MandateScorecardClient from "./MandateScorecardClient";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const display = (await findSubpageCity(slug))?.display ?? slug;
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

  const city = await findSubpageCity(slug);
  if (!city) notFound();

  return (
    <SignupEmailProvider>
      <CityViewTracker citySlug={slug} cityId={city.id} />
      <PublicNavBar>
        <CitySignupButton citySlug={slug} cityName={city.display} />
      </PublicNavBar>

      {/* Same hero as the category page: mayor row, signup, category chips. */}
      <CitySubpageHero
        city={city}
        slug={slug}
        badge={LEGAL_STANDARDS_LABEL}
        title={
          <>
            {`${city.emoji || "🏙️"} ${city.display}`} — {LEGAL_STANDARDS_LABEL}
          </>
        }
        description={
          <>
            Is {city.name} meeting the standards state and local law require? Each one
            with the latest figure, whether it was met, and the law behind it.
          </>
        }
        current={{ href: `/c/${slug}/mandates`, label: LEGAL_STANDARDS_LABEL }}
      />

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
