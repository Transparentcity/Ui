"use client";

import Link from "next/link";
import PublicNavBar from "@/components/PublicNavBar";
import NavEmailSignup from "../NavEmailSignup";
import CityHeroNewsletter from "../CityHeroNewsletter";
import Breadcrumb from "@/components/evergreen/Breadcrumb";
import GradeDisplay from "@/components/evergreen/GradeDisplay";
import TableOfContents from "@/components/evergreen/TableOfContents";
import SafetyScorecard from "@/components/evergreen/SafetyScorecard";
import TrendLineChart from "@/components/evergreen/TrendLineChart";
import CrimeBreakdownCards from "@/components/evergreen/CrimeBreakdownCards";
import StreetConditionsModule from "@/components/evergreen/StreetConditionsModule";
import CrimeMapSection from "@/components/evergreen/CrimeMapSection";
import PeerCityTable from "@/components/evergreen/PeerCityTable";
import SectionNav from "@/components/evergreen/SectionNav";
import JsonLd from "@/components/evergreen/JsonLd";
import ConversionSlot from "@/components/evergreen/conversion/ConversionSlot";
import SafeSection from "@/components/evergreen/SafeSection";
import type { CitySafePageProps } from "@/lib/evergreen/types";

interface Props extends CitySafePageProps {
  policeDashboardUrl?: string;
}

export default function CitySafePage({
  city,
  citySlug,
  state,
  lastUpdated,
  dataAvailability,
  safetyData,
  crimeBreakdown,
  streetConditions,
  peerCityRankings,
  safestDistricts,
  leastSafeDistricts,
  crimeMapMetricIds,
  policeDashboardUrl,
}: Props) {
  const currentRank = peerCityRankings?.find((r) => r.isCurrentCity)?.rank;

  const trendInsight =
    safetyData.trendData && safetyData.trendData.length > 1
      ? (() => {
          const first = safetyData.trendData[0];
          const last = safetyData.trendData[safetyData.trendData.length - 1];
          const change = (
            ((last.value - first.value) / first.value) *
            100
          ).toFixed(0);
          const direction = Number(change) < 0 ? "decreased" : "increased";
          return `Overall crime rate has ${direction} ${Math.abs(Number(change))}% over the past 24 months.`;
        })()
      : undefined;

  const isImproving = trendInsight?.includes("decreased");

  const tocItems = [
    { id: "scorecard", label: "Scorecard" },
    ...(dataAvailability.crimeHistory && safetyData.trendData
      ? [{ id: "trend", label: "Trend" }]
      : []),
    ...(dataAvailability.crimeIncidents
      ? [{ id: "crime", label: "Crime Breakdown" }]
      : []),
    ...(crimeMapMetricIds
      ? [{ id: "map", label: "Crime Map" }]
      : []),
    ...(peerCityRankings && peerCityRankings.length > 0
      ? [{ id: "peer-comparison", label: "Peer Cities" }]
      : []),
    { id: "conditions", label: "Street Conditions" },
  ];

  return (
    <>
      <JsonLd
        faqs={[
          {
            question: `Is ${city} safe?`,
            answer: safetyData.verdictSummary,
          },
        ]}
      />

      <PublicNavBar>
        <NavEmailSignup citySlug={citySlug} cityName={city} />
      </PublicNavBar>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "transparent.city", href: "/" },
            { label: city, href: `/c/${citySlug}` },
            { label: "Safety" },
          ]}
        />

        {/* Lede */}
        <header>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Is {city} Safe?
          </h1>
          <GradeDisplay
            safetyScore={safetyData.safetyScore}
            percentileRank={safetyData.percentileRank}
            locationName={city}
            comparisonLabel="major US cities we track"
            lastUpdated={lastUpdated}
          />

          {/* Positive trend callout */}
          {isImproving && (
            <div className="mt-3 rounded-md border-l-4 border-l-emerald-500 bg-emerald-50 px-4 py-2.5">
              <p className="text-sm font-semibold text-emerald-800">
                Crime is trending down in {city}
              </p>
              {currentRank && (
                <p className="text-sm text-emerald-700">
                  Ranked #{currentRank} for safety improvement among 15 major US
                  cities
                </p>
              )}
            </div>
          )}

          {!isImproving && currentRank && (
            <p className="mt-2 text-sm text-purple-700 font-medium">
              Ranked #{currentRank} for safety improvement among 15 major US
              cities
            </p>
          )}

          <p className="mt-3 text-gray-700 leading-relaxed">
            {safetyData.verdictSummary}
          </p>

          {/* Inline newsletter CTA (above the fold) */}
          <div className="mt-4">
            <CityHeroNewsletter
              cityName={city}
              citySlug={citySlug}
              label={`Get ${city}'s free weekly briefing.`}
            />
          </div>
        </header>

        {/* Table of Contents */}
        <TableOfContents items={tocItems} />

        {/* Safety Scorecard */}
        <SafeSection>
          <SafetyScorecard
            data={safetyData}
            availability={dataAvailability}
            locationLabel={city}
            comparisonLabel="Peer city median"
            city={city}
            policeDashboardUrl={policeDashboardUrl}
            sourceAttribution={`${city} Police Department crime incident data`}
          />
        </SafeSection>

        {/* Trend Chart */}
        <SafeSection>
          {dataAvailability.crimeHistory && safetyData.trendData && (
            <TrendLineChart
              localData={safetyData.trendData}
              localLabel={city}
              trendInsight={trendInsight}
            />
          )}
        </SafeSection>

        {/* Crime Breakdown */}
        <SafeSection>
          <CrimeBreakdownCards
            data={crimeBreakdown}
            availability={dataAvailability}
          />
        </SafeSection>

        {/* Crime Map (self-hides when unavailable) */}
        <SafeSection>
          {crimeMapMetricIds && (
            <CrimeMapSection
              metricIds={crimeMapMetricIds}
              lastUpdated={lastUpdated}
              locationName={city}
            />
          )}
        </SafeSection>

        {/* Peer City Comparison */}
        <SafeSection>
          {peerCityRankings && peerCityRankings.length > 0 && (
            <div id="peer-comparison">
              <PeerCityTable rankings={peerCityRankings} currentCity={city} />
            </div>
          )}
        </SafeSection>

        {/* Street Conditions */}
        <SafeSection>
          <StreetConditionsModule
            data={streetConditions}
            availability={dataAvailability}
            city={city}
          />
        </SafeSection>

        {/* District Rankings */}
        <SafeSection>
          <SectionNav
            citySlug={citySlug}
            cityName={city}
            districtRankings={safestDistricts}
            rankingLabel="Safest Districts"
          />
        </SafeSection>
        <SafeSection>
          <SectionNav
            citySlug={citySlug}
            cityName={city}
            districtRankings={leastSafeDistricts}
            rankingLabel="Districts to Research Further"
          />
        </SafeSection>

        {/* Sticky mobile CTA */}
        <ConversionSlot
          position="sticky_bottom"
          pageType="citySafe"
          citySlug={citySlug}
        />
      </main>

      {/* Explainer + bottom CTA (matching dashboard) */}
      <section className="city-explainer-section">
        <div className="container">
          <div className="city-explainer-inner">
            <p className="city-explainer-text">
              {city}&rsquo;s public data, explained once a week.
              Crime trends, housing, city services, and 311 reports, sourced
              from {city}&rsquo;s open data portal with links to
              every number.
            </p>
            <div className="city-explainer-cta">
              <CityHeroNewsletter
                cityName={city}
                citySlug={citySlug}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer (matching dashboard) */}
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
              <Link href={`/c/${citySlug}/methodology`} className="footer-link">
                Methodology
              </Link>
              <Link href="/sitemap" className="footer-link">
                All cities
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
              &copy; {new Date().getFullYear()} Transparent.city.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
