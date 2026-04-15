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
import CitySignupCTA from "../../CitySignupCTA";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import { improveGenericHeadline } from "@/lib/feed/headlineCleanup";
import { formatLeaderName } from "@/lib/utils";
import { SignupEmailProvider } from "../../SignupEmailContext";
import { type MetricCardData } from "@/components/feed/templates/MetricSummaryCard";
import MetricFeedCard from "@/components/feed/MetricFeedCard";
import Breadcrumb from "@/components/Breadcrumb";

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
}: DistrictPageContentProps) {
  const base = `/c/${slug}`;
  const year = new Date().getFullYear();
  const primaryLeader = leaders.find((l) => l.district === d);
  const leaderTitle = primaryLeader?.title || "Representative";

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
          cityName: `${city.shortDisplay} District ${d}`,
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
            { label: `District ${d}` },
          ]} />

          <div className="district-hero-inner">
            <div className="district-hero-left">
              {supervisorName ? (
                <>
                  <h1 className="district-supervisor-name">{supervisorName}</h1>
                  <p className="district-supervisor-role">
                    District {d} {leaderTitle} &middot; {city.shortDisplay}
                  </p>
                </>
              ) : (
                <h1 className="district-supervisor-name">District {d}</h1>
              )}

              <p className="district-accountability-tag">
                Public accountability dashboard &middot; {year}
              </p>

              <DistrictFollowClaimBlock cityId={city.id} district={d} slug={slug} cityDisplayName={city.shortDisplay} />

              <CitySignupCTA citySlug={slug} cityName={city.shortDisplay} label={`Sign up for District ${d} updates`} />

              {districts.length > 1 && (
                <nav className="district-nav-pills" aria-label="Other districts">
                  <span className="district-nav-label">Districts:</span>
                  {districts.map((dn) => {
                    const rep = leaders.find((l) => l.district === dn);
                    const repName = rep ? formatLeaderName(rep.name) : undefined;
                    return (
                      <Link
                        key={dn}
                        href={`${base}/district/${dn}`}
                        className={`district-pill${dn === d ? " district-pill-active" : ""}`}
                        aria-current={dn === d ? "page" : undefined}
                        title={repName ? `District ${dn} — ${repName}` : `District ${dn}`}
                      >
                        {dn}
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
        />
      </div>

      {/* ── STORY ACCENT STRIP ───────────────────────────────────────────── */}
      <section className="district-stories-strip">
        <div className="container">
          <span className="district-stories-label">Latest from District {d}</span>
          {accentStories.length > 0 || districtMetricCards.length > 0 ? (
            <>
              <div className="district-stories-row">
                {accentStories.map((story) => {
                  const href = story.short_hash
                    ? `/c/${slug}/stories/${story.short_hash}`
                    : story.detail_url || null;
                  const content = (
                    <>
                      <span className="district-story-headline">{improveGenericHeadline(story.headline, { description: story.description })}</span>
                      {story.description && (
                        <span className="district-story-desc">{story.description}</span>
                      )}
                    </>
                  );
                  return href ? (
                    <a key={story.id} href={href} className="district-story-card">
                      {content}
                    </a>
                  ) : (
                    <div key={story.id} className="district-story-card">
                      {content}
                    </div>
                  );
                })}
              </div>
              {districtMetricCards.length > 0 && (
                <div className="district-metric-cards">
                  {districtMetricCards.map((mc) => (
                    <MetricFeedCard key={mc.metric.id} data={mc} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="district-stories-empty">
              No recent stories for District {d} yet. Follow to get notified when new stories are published.
            </p>
          )}
        </div>
      </section>

      {/* ── OTHER DISTRICTS ─────────────────────────────────────────────── */}
      {districts.length > 1 && (
        <section className="container district-all-section">
          <h3 className="district-all-heading">
            All {city.shortDisplay} districts
          </h3>
          <DistrictListWithFollow
            cityId={city.id}
            slug={slug}
            cityDisplayName={city.shortDisplay}
            districts={districts}
            leaders={leaders}
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
