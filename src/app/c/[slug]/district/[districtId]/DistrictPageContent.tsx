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
import PublicNavBar from "@/components/PublicNavBar";

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

  return (
    <>
      <PublicNavBar>
        <Link href="/sitemap" className="nav-link">
          Site map
        </Link>
        <Link href="/" className="nav-link">
          Home
        </Link>
        <CitySignupButton />
      </PublicNavBar>

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
                    District {d} Supervisor &middot; {city.shortDisplay}
                  </p>
                </>
              ) : (
                <h1 className="district-supervisor-name">District {d}</h1>
              )}

              <p className="district-accountability-tag">
                Public accountability dashboard &middot; {year}
              </p>

              <DistrictFollowClaimBlock cityId={city.id} district={d} slug={slug} />

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

      {/* ── STORY ACCENT STRIP ───────────────────────────────────────────── */}
      {accentStories.length > 0 && (
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
                    <span className="district-story-headline">{story.headline}</span>
                    {story.description && (
                      <span className="district-story-desc">{story.description}</span>
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      )}

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

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-column">
              <div className="brand-text">
                <span className="logo-transparent">transparent</span>
                <span className="logo-city">.city</span>
              </div>
              <p className="footer-description">
                Maps, metrics, and research built from public city data—from citywide to
                block level—so residents and elected officials share the same picture of
                what&rsquo;s happening.
              </p>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">Resources</h4>
              <Link href={`${base}/methodology`} className="footer-link">
                Methodology
              </Link>
              <Link href={base} className="footer-link">
                {city.shortDisplay} (citywide)
              </Link>
              <Link href="/sitemap" className="footer-link">
                Site Map
              </Link>
            </div>
          </div>
          <div className="footer-bottom">
            <p>
              &copy; 2026 Transparent.city. The difference between knowing and
              guessing is agency.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
