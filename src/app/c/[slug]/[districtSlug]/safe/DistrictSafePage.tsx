import Link from "next/link";
import PublicNavBar from "@/components/PublicNavBar";
import Breadcrumb from "@/components/evergreen/Breadcrumb";
import GradeDisplay from "@/components/evergreen/GradeDisplay";
import TableOfContents from "@/components/evergreen/TableOfContents";
import SafetyScorecard from "@/components/evergreen/SafetyScorecard";
import TrendLineChart from "@/components/evergreen/TrendLineChart";
import CrimeBreakdownCards from "@/components/evergreen/CrimeBreakdownCards";
import StreetConditionsModule from "@/components/evergreen/StreetConditionsModule";
import CrimeMapSection from "@/components/evergreen/CrimeMapSection";
import DistrictPulse from "@/components/evergreen/DistrictPulse";
import SectionNav from "@/components/evergreen/SectionNav";
import JsonLd from "@/components/evergreen/JsonLd";
import ConversionSlot from "@/components/evergreen/conversion/ConversionSlot";
import type { DistrictSafePageProps } from "@/lib/evergreen/types";

interface Props extends DistrictSafePageProps {
  policeDashboardUrl?: string;
}

export default function DistrictSafePage({
  city,
  citySlug,
  state,
  district,
  districtSlug,
  districtNumber,
  lastUpdated,
  dataAvailability,
  safetyData,
  crimeBreakdown,
  streetConditions,
  pulse,
  relatedDistricts,
  crimeMapMetricIds,
  policeDashboardUrl,
}: Props) {
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
          return `Total crime rate has ${direction} ${Math.abs(Number(change))}% over the past 24 months.`;
        })()
      : undefined;

  const tocItems = [
    { id: "scorecard", label: "Scorecard" },
    ...(dataAvailability.crimeHistory && safetyData.trendData
      ? [{ id: "trend", label: "Trend" }]
      : []),
    ...(crimeBreakdown && dataAvailability.crimeIncidents
      ? [{ id: "crime", label: "Crime Breakdown" }]
      : []),
    ...(crimeMapMetricIds
      ? [{ id: "map", label: "Crime Map" }]
      : []),
    ...(streetConditions
      ? [{ id: "conditions", label: "Street Conditions" }]
      : []),
    ...(pulse
      ? [{ id: "pulse", label: "This Month" }]
      : []),
  ];

  return (
    <>
      <JsonLd
        faqs={[
          {
            question: `Is ${district} safe?`,
            answer: safetyData.verdictSummary,
          },
        ]}
      />

      <PublicNavBar>
        <Link href={`/c/${citySlug}`} className="nav-link">
          {city}
        </Link>
      </PublicNavBar>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "transparent.city", href: "/" },
            { label: city, href: `/c/${citySlug}` },
            { label: district, href: `/c/${citySlug}/${districtSlug}/safe` },
            { label: "Safety" },
          ]}
        />

        {/* Lede */}
        <header>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Is {district} Safe?
          </h1>
          <GradeDisplay
            safetyScore={safetyData.safetyScore}
            percentileRank={safetyData.percentileRank}
            locationName={district}
            comparisonLabel={`${city} districts`}
            lastUpdated={lastUpdated}
          />
          <p className="mt-4 text-gray-700 leading-relaxed">
            {safetyData.verdictSummary}
          </p>
        </header>

        {/* Table of Contents */}
        <TableOfContents items={tocItems} />

        {/* Safety Scorecard */}
        <SafetyScorecard
          data={safetyData}
          availability={dataAvailability}
          locationLabel={district}
          comparisonLabel="City avg"
          city={city}
          policeDashboardUrl={policeDashboardUrl}
          sourceAttribution={`${city} Police Department crime incident data`}
        />

        {/* Trend Chart */}
        {dataAvailability.crimeHistory && safetyData.trendData && (
          <TrendLineChart
            localData={safetyData.trendData}
            localLabel={district}
            comparisonData={safetyData.cityTrendData}
            comparisonLabel={`${city} average`}
            trendInsight={trendInsight}
          />
        )}

        {/* Crime Breakdown */}
        {crimeBreakdown && (
          <CrimeBreakdownCards
            data={crimeBreakdown}
            availability={dataAvailability}
          />
        )}

        {/* Crime Map */}
        {crimeMapMetricIds && (
          <CrimeMapSection
            metricIds={crimeMapMetricIds}
            lastUpdated={lastUpdated}
            district={districtNumber}
            locationName={district}
          />
        )}

        {/* Street Conditions */}
        {streetConditions && (
          <StreetConditionsModule
            data={streetConditions}
            availability={dataAvailability}
            city={city}
          />
        )}

        {/* Email capture CTA */}
        <ConversionSlot
          position="after_conditions"
          pageType="districtSafe"
          citySlug={citySlug}
          districtSlug={districtSlug}
        />

        {/* Pulse */}
        {pulse && (
          <div id="pulse">
            <DistrictPulse
              data={pulse}
              locationName={district}
              lastUpdated={lastUpdated}
            />
          </div>
        )}

        {/* Before footer CTA */}
        <ConversionSlot
          position="before_footer"
          pageType="districtSafe"
          citySlug={citySlug}
          districtSlug={districtSlug}
        />

        {/* Footer nav */}
        <SectionNav
          citySlug={citySlug}
          cityName={city}
          relatedDistricts={relatedDistricts}
          showCitySafeLink
        />

        {/* Sticky mobile CTA */}
        <ConversionSlot
          position="sticky_bottom"
          pageType="districtSafe"
          citySlug={citySlug}
          districtSlug={districtSlug}
        />
      </main>
    </>
  );
}
