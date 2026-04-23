"use client";

import styles from "./newsletter-landing.module.css";
import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import PublicFooter from "@/components/PublicFooter";
import Loader from "@/components/Loader";
import {
  trackSignupStart,
  trackSignupClick,
  getFunnelSessionId,
  recordFunnelEventBackend,
  type SignupEventContext,
} from "@/lib/analytics";
import { useProductEvent } from "@/lib/productAnalytics";
import { slugify } from "@/lib/utils";
import type { PublicCitySitemapItem } from "@/lib/publicApiClient";

interface NewsletterLandingClientProps {
  launchedCities?: PublicCitySitemapItem[];
}

const DATA_SOURCES = [
  { icon: "🏙️", label: "SF Open Data Portal", detail: "data.sfgov.org — 700+ official datasets" },
  { icon: "🚨", label: "Police Incident Reports", detail: "Daily crime + incident data" },
  { icon: "🏗️", label: "Building Permits (DBI)", detail: "New construction, alterations, complaints" },
  { icon: "📞", label: "311 Service Requests", detail: "Neighborhood complaints and city responses" },
  { icon: "🧹", label: "Public Works", detail: "Street cleaning, graffiti, encampments" },
  { icon: "🚒", label: "Fire & EMS Calls", detail: "Emergency response times and volumes" },
];

const AUDIENCE_CARDS = [
  {
    icon: "🏘️",
    title: "Neighborhood Resident",
    tag: "Most popular",
    tagColor: "purple" as const,
    body:
      "You pay taxes and live here. You deserve to know what's changing on your block — without having to wade through city meeting agendas.",
    features: [
      "Weekly digest tailored to your district",
      "Permit activity near your address",
      "311 trend summaries — is your block getting better or worse?",
      "Plain-language explanations, no jargon",
    ],
    primaryCta: "Get the free weekly",
    primaryAction: "signup" as const,
    secondaryLabel: "See a sample issue",
    secondaryHref: "/c/san-francisco",
  },
  {
    icon: "🗳️",
    title: "Engaged Voter",
    tag: "Accountability",
    tagColor: "blue" as const,
    body:
      "You vote in local elections and want to hold elected officials to measurable outcomes, not just campaign promises.",
    features: [
      "District-level metrics compared over time",
      "Supervisor accountability dashboard",
      "Trend alerts when key metrics shift",
      "Source-linked data — no spin, no anecdote",
    ],
    primaryCta: "See district data",
    primaryAction: "signup" as const,
    secondaryLabel: "Learn how it works",
    secondaryHref: "/about/seymour",
  },
  {
    icon: "📰",
    title: "Journalist or Researcher",
    tag: "Deep data",
    tagColor: "green" as const,
    body:
      "You need reproducible, source-backed numbers for stories and reports. We do the aggregation; you tell the story.",
    features: [
      "Every insight links back to the raw dataset",
      "Anomaly detection surfaces what's unusual",
      "Downloadable charts and embeddable visualizations",
      "Historical comparisons going back years",
    ],
    primaryCta: "Start exploring",
    primaryAction: "signup" as const,
    secondaryLabel: "See the methodology",
    secondaryHref: "/about/seymour",
  },
  {
    icon: "🏢",
    title: "Local Business Owner",
    tag: "Operational",
    tagColor: "amber" as const,
    body:
      "Permit activity, code enforcement, and foot-traffic signals can affect your bottom line. Stay one step ahead.",
    features: [
      "Permit filings near your location",
      "Code enforcement complaint trends",
      "Safety and cleanliness index for your block",
      "Monthly business climate summary",
    ],
    primaryCta: "Subscribe free",
    primaryAction: "signup" as const,
    secondaryLabel: "View sample data",
    secondaryHref: "/c/san-francisco",
  },
];

export default function NewsletterLandingClient({
  launchedCities = [],
}: NewsletterLandingClientProps) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();

  useProductEvent("newsletter_landing_page_view");

  const handleSignup = async () => {
    const ctx: SignupEventContext = {
      source_surface: "newsletter_landing",
      signup_intent: "resident",
      landing_path: typeof window !== "undefined" ? window.location.pathname : null,
      funnel_session_id: getFunnelSessionId(),
    };
    trackSignupStart("resident", ctx);
    trackSignupClick("resident", ctx);
    recordFunnelEventBackend("signup_start", ctx);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", "resident");
      window.localStorage.setItem("transparentcity.signup_surface", "newsletter_landing");
    }
    await loginWithRedirect({
      authorizationParams: { screen_hint: "signup" },
      appState: { returnTo: `/home?signup=resident` },
    });
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/home");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || isAuthenticated) {
    return (
      <div className={styles.loaderScreen}>
        <Loader />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Header />

      <main id="main-content">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.heroCentered}>
              <div className={styles.kicker}>
                <span className={styles.kickerDot} />
                Free weekly newsletter
              </div>
              <h1 className={styles.headline}>
                Your city, explained in&nbsp;numbers.
              </h1>
              <p className={styles.subhead}>
                Every week we scan thousands of official city records and turn
                what changed into plain-language stories — with source links so
                you can verify everything.
              </p>
              <div className={styles.heroCtas}>
                <button
                  type="button"
                  onClick={() => void handleSignup()}
                  className={styles.btnPrimary}
                >
                  Get the free weekly briefing
                </button>
                {launchedCities.length > 0 && (
                  <div className={styles.heroExplore}>
                    <span className={styles.heroExploreLabel}>or browse:</span>
                    {launchedCities.map((c) => (
                      <Link
                        key={c.id}
                        href={`/c/${slugify(c.name)}`}
                        className={styles.heroCityLink}
                      >
                        {c.emoji ? `${c.emoji} ` : ""}
                        {c.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Newsletter mockup ─────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.container}>
            <div className={styles.mockupLayout}>
              <div className={styles.mockupText}>
                <p className={styles.eyebrow}>What you get</p>
                <h2 className={styles.sectionTitle}>
                  A real briefing, not a&nbsp;news blast
                </h2>
                <p className={styles.sectionBody}>
                  Each edition opens with the metrics that moved this week —
                  crime, permits, 311 complaints, response times — then
                  explains why they shifted and what it means for your
                  neighborhood.
                </p>
                <ul className={styles.checkList}>
                  <li>
                    <span className={styles.checkIcon}>✓</span>
                    Top 3–5 metric changes for your district
                  </li>
                  <li>
                    <span className={styles.checkIcon}>✓</span>
                    Charts that show the trend, not just the headline number
                  </li>
                  <li>
                    <span className={styles.checkIcon}>✓</span>
                    Direct links to the underlying public dataset
                  </li>
                  <li>
                    <span className={styles.checkIcon}>✓</span>
                    Context — is this actually unusual, or normal variance?
                  </li>
                </ul>
              </div>

              {/* Newsletter visual mockup */}
              <div className={styles.mockupEmail}>
                <div className={styles.emailChrome}>
                  <div className={styles.emailChromeBar}>
                    <span className={styles.emailDot} style={{ background: "#FF5F57" }} />
                    <span className={styles.emailDot} style={{ background: "#FEBC2E" }} />
                    <span className={styles.emailDot} style={{ background: "#28C840" }} />
                  </div>
                  <div className={styles.emailBody}>
                    <div className={styles.emailHeader}>
                      <span className={styles.emailBrand}>transparent.city</span>
                      <span className={styles.emailEdition}>District 5 · Weekly Briefing</span>
                    </div>
                    <div className={styles.emailDate}>Week of April 14, 2025</div>

                    <div className={styles.emailMetricRow}>
                      <div className={styles.emailMetric}>
                        <span className={styles.emailMetricArrow} data-dir="up">↑</span>
                        <div>
                          <div className={styles.emailMetricValue}>+18%</div>
                          <div className={styles.emailMetricLabel}>311 complaints</div>
                        </div>
                      </div>
                      <div className={styles.emailMetric}>
                        <span className={styles.emailMetricArrow} data-dir="down">↓</span>
                        <div>
                          <div className={styles.emailMetricValue}>−7%</div>
                          <div className={styles.emailMetricLabel}>Burglaries</div>
                        </div>
                      </div>
                      <div className={styles.emailMetric}>
                        <span className={styles.emailMetricArrow} data-dir="up">↑</span>
                        <div>
                          <div className={styles.emailMetricValue}>+24</div>
                          <div className={styles.emailMetricLabel}>New permits</div>
                        </div>
                      </div>
                    </div>

                    <div className={styles.emailStory}>
                      <div className={styles.emailStoryTag}>Top story</div>
                      <div className={styles.emailStoryHeadline}>
                        Illegal dumping complaints in the Haight up 23% this
                        month — and city response times are lagging
                      </div>
                      <div className={styles.emailStorySnippet}>
                        Data from the SF 311 system shows 84 illegal dumping
                        reports in District 5 since April 1st — a 23% increase
                        vs. the same period last year. Average response time is
                        now 4.2 days, up from 2.8 days in Q1.
                      </div>
                      <a href="#" className={styles.emailReadMore}>
                        Read full story with source data →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Data sources ─────────────────────────────────────────────────── */}
        <section className={styles.sourcesSection}>
          <div className={styles.container}>
            <div className={styles.sourcesCentered}>
              <p className={styles.eyebrow}>The data</p>
              <h2 className={styles.sectionTitle}>
                Every number traces back to a public record
              </h2>
              <p className={styles.sectionBody} style={{ maxWidth: "56ch", margin: "0 auto 32px" }}>
                We don&apos;t manufacture insights. We aggregate official city
                datasets, detect what changed, and explain it in plain language.
                Every story links back to the source so you can verify it
                yourself.
              </p>
              <div className={styles.sourcesGrid}>
                {DATA_SOURCES.map((src) => (
                  <div key={src.label} className={styles.sourceCard}>
                    <span className={styles.sourceIcon}>{src.icon}</span>
                    <div>
                      <div className={styles.sourceLabel}>{src.label}</div>
                      <div className={styles.sourceDetail}>{src.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Audience cards ───────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.container}>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <p className={styles.eyebrow}>Who it&apos;s for</p>
              <h2 className={styles.sectionTitle}>
                Useful for every kind of&nbsp;citizen
              </h2>
              <p className={styles.sectionBody} style={{ maxWidth: "52ch", margin: "0 auto" }}>
                Whether you&apos;re tracking a neighborhood issue, holding an
                official accountable, or covering city hall — the data is the
                same; what you do with it is up to you.
              </p>
            </div>
            <div className={styles.audienceGrid}>
              {AUDIENCE_CARDS.map((card) => (
                <div key={card.title} className={styles.audienceCard}>
                  <div className={styles.audienceIconWrap}>
                    <span className={styles.audienceIcon}>{card.icon}</span>
                  </div>
                  <div className={styles.audienceCardHeader}>
                    <h3 className={styles.audienceTitle}>{card.title}</h3>
                    <span
                      className={styles.audienceTag}
                      data-color={card.tagColor}
                    >
                      {card.tag}
                    </span>
                  </div>
                  <p className={styles.audienceBody}>{card.body}</p>
                  <ul className={styles.audienceFeatures}>
                    {card.features.map((f) => (
                      <li key={f}>
                        <span className={styles.featureCheck}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className={styles.audienceActions}>
                    <button
                      type="button"
                      onClick={() => void handleSignup()}
                      className={styles.audiencePrimaryBtn}
                    >
                      {card.primaryCta}
                    </button>
                    <Link href={card.secondaryHref} className={styles.audienceSecondaryLink}>
                      {card.secondaryLabel}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── District accountability spotlight ────────────────────────────── */}
        <section className={styles.accountabilitySection}>
          <div className={styles.container}>
            <div className={styles.accountabilityLayout}>
              <div className={styles.accountabilityText}>
                <p className={styles.eyebrowLight}>District dashboard</p>
                <h2 className={styles.accountabilityTitle}>
                  A real-time report card for your district supervisor
                </h2>
                <p className={styles.accountabilityBody}>
                  Every city district gets its own dashboard — a live summary
                  of how the district is performing across public safety,
                  cleanliness, permit activity, and city responsiveness.
                </p>
                <p className={styles.accountabilityBody}>
                  Elected supervisors manage their districts on your behalf. The
                  dashboard lets you see the metrics improving or declining
                  under their watch — not from a campaign flyer, but from the
                  same data the city uses internally.
                </p>
                <ul className={styles.accountabilityList}>
                  <li>
                    <span className={styles.accountabilityBullet}>→</span>
                    Compare this year&apos;s performance to the prior term
                  </li>
                  <li>
                    <span className={styles.accountabilityBullet}>→</span>
                    See which metrics are trending in the wrong direction
                  </li>
                  <li>
                    <span className={styles.accountabilityBullet}>→</span>
                    Get weekly email updates when district metrics shift
                  </li>
                  <li>
                    <span className={styles.accountabilityBullet}>→</span>
                    Share the dashboard link with your neighbors or local press
                  </li>
                </ul>
                <div className={styles.accountabilityActions}>
                  <button
                    type="button"
                    onClick={() => void handleSignup()}
                    className={styles.accountabilityPrimaryBtn}
                  >
                    Track your district
                  </button>
                  {launchedCities.length > 0 && (
                    <Link
                      href={`/c/${slugify(launchedCities[0].name)}`}
                      className={styles.accountabilitySecondaryLink}
                    >
                      Browse {launchedCities[0].name} data →
                    </Link>
                  )}
                </div>
              </div>

              <div className={styles.accountabilityVisual}>
                <div className={styles.districtCard}>
                  <div className={styles.districtCardHeader}>
                    <div>
                      <div className={styles.districtLabel}>District 5 · San Francisco</div>
                      <div className={styles.districtSupervisor}>Supervisor: Dean Preston</div>
                    </div>
                    <div className={styles.districtBadge}>Live data</div>
                  </div>

                  <div className={styles.districtMetrics}>
                    <div className={styles.districtMetric}>
                      <div className={styles.districtMetricTop}>
                        <span className={styles.districtMetricName}>Public Safety</span>
                        <span className={styles.districtMetricChange} data-dir="up">↑ 4%</span>
                      </div>
                      <div className={styles.districtMetricBar}>
                        <div className={styles.districtMetricFill} style={{ width: "62%" }} />
                      </div>
                      <span className={styles.districtMetricSub}>vs. same period last year</span>
                    </div>

                    <div className={styles.districtMetric}>
                      <div className={styles.districtMetricTop}>
                        <span className={styles.districtMetricName}>Street Cleanliness</span>
                        <span className={styles.districtMetricChange} data-dir="down">↓ 11%</span>
                      </div>
                      <div className={styles.districtMetricBar}>
                        <div className={styles.districtMetricFill} data-warn="true" style={{ width: "41%" }} />
                      </div>
                      <span className={styles.districtMetricSub}>311 complaint volume up</span>
                    </div>

                    <div className={styles.districtMetric}>
                      <div className={styles.districtMetricTop}>
                        <span className={styles.districtMetricName}>Permit Activity</span>
                        <span className={styles.districtMetricChange} data-dir="up">↑ 18%</span>
                      </div>
                      <div className={styles.districtMetricBar}>
                        <div className={styles.districtMetricFill} style={{ width: "75%" }} />
                      </div>
                      <span className={styles.districtMetricSub}>New construction filings</span>
                    </div>

                    <div className={styles.districtMetric}>
                      <div className={styles.districtMetricTop}>
                        <span className={styles.districtMetricName}>City Response Time</span>
                        <span className={styles.districtMetricChange} data-dir="down">↓ 8%</span>
                      </div>
                      <div className={styles.districtMetricBar}>
                        <div className={styles.districtMetricFill} data-warn="true" style={{ width: "54%" }} />
                      </div>
                      <span className={styles.districtMetricSub}>Average days to close a 311 case</span>
                    </div>
                  </div>

                  <div className={styles.districtCardFooter}>
                    <span className={styles.districtFooterText}>Source: SF Open Data · Updated daily</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>
                Your city publishes the data.
                <br />
                We make it useful.
              </h2>
              <p className={styles.ctaBody}>
                Sign up free. Pick your city and district. Get the first
                briefing in your inbox this week.
              </p>
              <div className={styles.ctaButtons}>
                <button
                  type="button"
                  onClick={() => void handleSignup()}
                  className={styles.ctaBtnPrimary}
                >
                  Get the free newsletter
                </button>
                <a href="/add-your-city" className={styles.ctaBtnOutline}>
                  Request your city
                </a>
              </div>
              <p className={styles.ctaDisclaimer}>
                No spam. Unsubscribe any time. We never sell your data.
              </p>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
