import Link from "next/link";

import type {
  PublicCityMetricItem,
  PublicMetricComparisons,
  PublicLeader,
  PublicMapListItem,
} from "@/lib/publicApiClient";
import type { MetricOrderingEntry } from "../../CityDashboardSection";
import CitySignupButton from "../../CitySignupButton";
import CityDashboardSection from "../../CityDashboardSection";
import DistrictFollowClaimBlock from "../DistrictFollowClaimBlock";
import DistrictListWithFollow from "../../DistrictListWithFollow";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import { formatLeaderName } from "@/lib/utils";
import { SignupEmailProvider } from "../../SignupEmailContext";
import { type MetricCardData } from "@/components/feed/templates/MetricSummaryCard";
import MetricFeedCard from "@/components/feed/MetricFeedCard";
import DistrictStoryCard from "./DistrictStoryCard";
import Breadcrumb from "@/components/Breadcrumb";
import {
  formatSubdivisionLabel,
  type PublicGeographicContext,
} from "@/lib/publicGeographicUnit";
import { getAtLargeCouncilMembers } from "@/lib/atLargeCouncilNav";

export type DistrictPageContentProps = {
  slug: string;
  d: number;
  city: {
    id: number;
    shortDisplay: string;
    display: string;
    state?: string | null;
    country?: string | null;
  };
  supervisorName: string | null;
  leaders: PublicLeader[];
  accentStories: Array<{
    id: number;
    headline: string;
    description?: string | null;
    short_hash?: string | null;
    detail_url?: string | null;
  }>;
  metrics: PublicCityMetricItem[];
  comparisonsMap: Record<number, PublicMetricComparisons>;
  districts: number[];
  maps: PublicMapListItem[];
  /** Admin-defined default ordering (used to sort categories and metrics). */
  orderings?: MetricOrderingEntry[];
  geographicContext?: PublicGeographicContext;
};

export default function DistrictPageContent({
  slug,
  d,
  city,
  supervisorName,
  leaders,
  accentStories,
  metrics,
  comparisonsMap,
  districts,
  maps,
  orderings,
  geographicContext,
}: DistrictPageContentProps) {
  const base = `/c/${slug}`;
  const year = new Date().getFullYear();
  const unitLabel = geographicContext?.unitLabel ?? "District";
  const unitLabelPlural = geographicContext?.unitLabelPlural ?? "Districts";
  const subdivisionName = geographicContext
    ? formatSubdivisionLabel(geographicContext, d)
    : `${unitLabel} ${d}`;
  const neighborhoodMode = geographicContext?.navigationMode === "neighborhood";
  const primaryLeader = leaders.find((l) => l.district === d);
  const leaderTitle = primaryLeader?.title || "Representative";
  const atLargeCouncil = neighborhoodMode ? getAtLargeCouncilMembers(leaders) : [];

  // Build up to 2 metric summary cards ranked by biggest movers
  const districtMetricCards: MetricCardData[] = (() => {
    if (!metrics.length || !comparisonsMap) return [];
    const candidates: Array<{ card: MetricCardData; absPct: number }> = [];
    for (const m of metrics) {
      const comp = comparisonsMap[m.id]?.comparisons?.ytd;
      if (!comp) continue;
      const curr = comp.current_period_value;
      const prior = comp.comparison_period_value;
      if (curr == null || prior == null || prior === 0) continue;
      const pct = ((curr - prior) / prior) * 100;
      const idx = candidates.length;
      const hoursAgo = idx * 12 + 2;
      candidates.push({
        card: {
          metric: m,
          comparison: comp,
          slug,
          cityName: `${city.shortDisplay} ${subdivisionName}`,
          publishedAt: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
        },
        absPct: Math.abs(pct),
      });
    }
    candidates.sort((a, b) => b.absPct - a.absPct);
    return candidates.slice(0, 2).map((c) => c.card);
  })();

  return (
    <SignupEmailProvider>
      <PublicNavBar>
        <CitySignupButton citySlug={slug} cityName={city.shortDisplay} />
      </PublicNavBar>

      <main id="main-content">
      {/* ── ACCOUNTABILITY HEADER ─────────────────────────────────────────── */}
      <section className="district-hero">
        <div className="container">

          <Breadcrumb items={[
            { label: city.shortDisplay, href: base },
            { label: subdivisionName },
          ]} />

          <div className="district-hero-inner">
            <div className="district-hero-left">
              {supervisorName ? (
                <>
                  <h1 className="district-supervisor-name">{supervisorName}</h1>
                  <p className="district-supervisor-role">
                    {leaderTitle} &middot; {subdivisionName} &middot; {city.shortDisplay}
                  </p>
                </>
              ) : (
                <>
                  <h1 className="district-supervisor-name">{subdivisionName}</h1>
                  {neighborhoodMode && atLargeCouncil.length > 0 && (
                    <p className="district-supervisor-role">
                      {city.shortDisplay} City Council serves all neighborhoods at large
                      {atLargeCouncil.length > 0
                        ? ` (${atLargeCouncil
                            .slice(0, 3)
                            .map((m) => formatLeaderName(m.name))
                            .join(", ")}${atLargeCouncil.length > 3 ? ", …" : ""})`
                        : ""}
                    </p>
                  )}
                </>
              )}

              <DistrictFollowClaimBlock
                cityId={city.id}
                district={d}
                slug={slug}
                cityDisplayName={city.shortDisplay}
                subdivisionLabel={subdivisionName}
              />

              {districts.length > 1 && (
                <nav className="district-nav-pills" aria-label={`Other ${unitLabelPlural.toLowerCase()}`}>
                  <span className="district-nav-label">{unitLabelPlural}:</span>
                  {districts.map((dn) => {
                    const rep = leaders.find((l) => l.district === dn);
                    const repName = rep ? formatLeaderName(rep.name) : undefined;
                    const label = geographicContext
                      ? formatSubdivisionLabel(geographicContext, dn)
                      : `${unitLabel} ${dn}`;
                    return (
                      <Link
                        key={dn}
                        href={`${base}/district/${dn}`}
                        className={`district-pill${dn === d ? " district-pill-active" : ""}`}
                        aria-current={dn === d ? "page" : undefined}
                        title={repName ? `${label} — ${repName}` : label}
                      >
                        {geographicContext?.subdivisionNames.get(dn) ?? dn}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </div>

          </div>
        </div>
      </section>

      {/* ── METRICS DASHBOARD ────────────────────────────────────────────── */}
      <div className="district-page-dashboard">
        <CityDashboardSection
          cityDisplayName={city.shortDisplay}
          slug={slug}
          metrics={metrics}
          comparisonsMap={comparisonsMap}
          districts={districts}
          maps={maps}
          district={d}
          leaders={leaders}
          cityId={city.id}
          orderings={orderings}
          geographicContext={geographicContext}
        />
      </div>

      {/* ── STORY ACCENT STRIP ───────────────────────────────────────────── */}
      <section className="district-stories-strip">
        <div className="container">
          <h2 className="district-stories-label">Latest from {subdivisionName}</h2>
          {accentStories.length > 0 || districtMetricCards.length > 0 ? (
            <div className="district-stories-row">
              {accentStories.map((story) => {
                const href = story.short_hash
                  ? `/c/${slug}/stories/${story.short_hash}`
                  : story.detail_url;
                if (!href) return null;
                return (
                  <DistrictStoryCard
                    key={story.id}
                    headline={story.headline}
                    description={story.description}
                    href={href}
                    cityName={city.shortDisplay}
                    district={d}
                    locationLabel={`${city.shortDisplay} ${subdivisionName}`}
                  />
                );
              })}
              {districtMetricCards.map((mc) => (
                <MetricFeedCard key={mc.metric.id} data={mc} hideActions />
              ))}
            </div>
          ) : (
            <p className="district-stories-empty">
              No recent stories for {subdivisionName} yet. Follow to get notified when new stories are published.
            </p>
          )}
        </div>
      </section>

      {/* ── OTHER DISTRICTS ─────────────────────────────────────────────── */}
      {districts.length > 1 && (
        <section className="container district-all-section">
          <h3 className="district-all-heading">
            All {city.shortDisplay} {unitLabelPlural.toLowerCase()}
          </h3>
          <DistrictListWithFollow
            cityId={city.id}
            slug={slug}
            cityDisplayName={city.shortDisplay}
            districts={districts}
            leaders={leaders}
            geographicContext={geographicContext}
          />
        </section>
      )}

      </main>
      <PublicFooter
        citySlug={slug}
        feedbackPageUrl={`${base}/district/${d}`}
        feedbackPageType="district"
      />
    </SignupEmailProvider>
  );
}
