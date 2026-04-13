import Link from "next/link";

import type {
  PublicCityMetricItem,
  PublicMetricComparisons,
  PublicLeader,
  PublicMapListItem,
} from "@/lib/publicApiClient";
import type { MetricOrderingEntry } from "../../CityDashboardSection";
import NavEmailSignup from "../../NavEmailSignup";
import CityDashboardSection from "../../CityDashboardSection";
import DistrictFollowClaimBlock from "../DistrictFollowClaimBlock";
import EmailSignInLink from "../../EmailSignInLink";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import { improveGenericHeadline } from "@/lib/feed/headlineCleanup";
import { SignupEmailProvider } from "../../SignupEmailContext";
import { type MetricCardData } from "@/components/feed/templates/MetricSummaryCard";
import MetricFeedCard from "@/components/feed/MetricFeedCard";

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
        <NavEmailSignup citySlug={slug} cityName={city.shortDisplay} />
      </PublicNavBar>

      <main id="main-content">
      {/* ── ACCOUNTABILITY HEADER ─────────────────────────────────────────── */}
      <section className="district-hero">
        <div className="container">

          {/* Breadcrumb context */}
          <div className="district-breadcrumb">
            <Link href={base} className="district-breadcrumb-link">
              {city.shortDisplay}
            </Link>
            <span className="district-breadcrumb-sep">/</span>
            <span>District {d}</span>
          </div>

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

              <DistrictFollowClaimBlock cityId={city.id} district={d} slug={slug} />

              <EmailSignInLink label={`Get District ${d} updates for ${city.shortDisplay}.`} />

              {districts.length > 1 && (
                <nav className="district-nav-pills" aria-label="Other districts">
                  <span className="district-nav-label">Districts:</span>
                  {districts.map((dn) => (
                    <Link
                      key={dn}
                      href={`${base}/district/${dn}`}
                      className={`district-pill${dn === d ? " district-pill-active" : ""}`}
                      aria-current={dn === d ? "page" : undefined}
                    >
                      {dn}
                    </Link>
                  ))}
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
      {(accentStories.length > 0 || districtMetricCards.length > 0) && (
        <section className="district-stories-strip">
          <div className="container">
            <span className="district-stories-label">Latest from District {d}</span>
            <div className="district-stories-row">
              {accentStories.map((story) => {
                const href = story.short_hash
                  ? `/c/${slug}/stories/${story.short_hash}`
                  : story.detail_url;
                return (
                  <a key={story.id} href={href ?? "#"} className="district-story-card">
                    <span className="district-story-headline">{improveGenericHeadline(story.headline, { description: story.description })}</span>
                    {story.description && (
                      <span className="district-story-desc">{story.description}</span>
                    )}
                  </a>
                );
              })}
            </div>
            {districtMetricCards.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                {districtMetricCards.map((mc) => (
                  <MetricFeedCard key={mc.metric.id} data={mc} onHide={() => {}} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── OTHER DISTRICTS ─────────────────────────────────────────────── */}
      {districts.length > 1 && (
        <section className="container" style={{ paddingTop: 32, paddingBottom: 16 }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 12 }}>
            All {city.shortDisplay} districts
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {districts.map((dn) => {
              const rep = leaders.find((l) => l.district === dn);
              const repName = rep ? ` \u2013 ${(rep.title || "")} ${rep.name}`.trim() : "";
              return (
                <Link
                  key={dn}
                  href={`${base}/district/${dn}`}
                  className="nav-link"
                  style={{
                    fontSize: 14,
                    fontWeight: dn === d ? 700 : 400,
                    textDecoration: "none",
                  }}
                >
                  District {dn}{repName}
                </Link>
              );
            })}
          </div>
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
