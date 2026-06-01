"use client";

import styles from "./home.module.css";
import { useAuth0 } from "@auth0/auth0-react";
import PublicFooter from "@/components/PublicFooter";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  listPublicCitiesForSitemap,
  type PublicCitySitemapItem,
} from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";
import Loader from "@/components/Loader";
import Header from "@/components/Header";
import HomeFeedPreview from "@/components/feed/HomeFeedPreview";
import { trackSearchReferrer } from "@/lib/analytics";
import { startSignup } from "@/lib/signup";
import { useProductEvent } from "@/lib/productAnalytics";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import type { MetricCardData } from "@/components/feed/templates/MetricSummaryCard";

interface HomeClientProps {
  stories?: EnrichedFeedStory[];
  metricCards?: MetricCardData[];
  launchedCities?: PublicCitySitemapItem[];
}

export default function HomeClient({ stories, metricCards, launchedCities = [] }: HomeClientProps) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();
  const [cityList, setCityList] = useState(launchedCities);

  useEffect(() => {
    setCityList(launchedCities);
  }, [launchedCities]);

  // SSR/ISR can cache an empty list when the API is unreachable at build time.
  // Load launched cities in the browser so hero chips and CTA links still appear.
  useEffect(() => {
    if (cityList.length > 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const cities = await listPublicCitiesForSitemap();
        if (cancelled) return;
        const launched = cities
          .filter((c) => c.is_launched === true)
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 10);
        if (launched.length > 0) setCityList(launched);
      } catch {
        /* optional — page works without city links */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cityList.length]);

  const heroLaunchedCities = cityList.filter((c) => c.is_launched === true);

  // First-party landing event for the home page
  useProductEvent("home_page_view");

  const handleSignup = async () => {
    await startSignup(loginWithRedirect, "resident", {
      source_surface: "home_page",
    });
  };

  // Redirect authenticated users directly to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/home");
    }
  }, [isAuthenticated, isLoading, router]);

  // Track search referrer on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get("q") || urlParams.get("query");
    if (query) {
      trackSearchReferrer(query);
    }
  }, []);

  // Show loader while checking auth or redirecting authenticated users to dashboard
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
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.heroCentered}>
              <h1 className={styles.headline}>
                Know what&apos;s actually happening in your city.
              </h1>
              <p className={styles.subhead}>
                Your city publishes the data. We turn it into useful updates
                about your block and neighborhood.
              </p>

              <div className={styles.heroCtas}>
                <button
                  type="button"
                  onClick={() => void handleSignup()}
                  className={`${styles.button} ${styles.buttonPrimary} ${styles.heroBtn}`}
                >
                  Get the Free Weekly
                </button>

                <div className={styles.heroExplore}>
                  {heroLaunchedCities.length > 0 && (
                    <span className={styles.heroExploreLabel}>or explore:</span>
                  )}
                  {heroLaunchedCities.map((c) => (
                    <Link
                      key={c.id}
                      href={`/get/${c.slug || slugify(c.name)}`}
                      className={styles.heroCityLink}
                    >
                      {c.emoji ? `${c.emoji} ` : ""}{c.name}
                    </Link>
                  ))}
                  <Link href="/sitemap" className={styles.heroCityLink}>
                    {heroLaunchedCities.length > 0 ? "All cities →" : "Browse all cities →"}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle} style={{ textAlign: "center" }}>How it works</h2>
            <div className={styles.stepsRow}>
              <div className={styles.step}>
                <div className={styles.stepNumber}>1</div>
                <h3 className={styles.stepTitle}>Pick your city</h3>
                <p className={styles.stepDesc}>
                  We&apos;ve collected millions of data points from official city
                  sources and normalized them to spot what&apos;s changing.
                </p>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>2</div>
                <h3 className={styles.stepTitle}>See what&apos;s happening</h3>
                <p className={styles.stepDesc}>
                  We turn raw data into plain-language stories with charts
                  and source links.
                </p>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>3</div>
                <h3 className={styles.stepTitle}>Find changes early</h3>
                <p className={styles.stepDesc}>
                  Get a weekly digest tailored to your interests, or
                  browse anytime.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Feed preview (proof) ──────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.container}>
            <div className={styles.feedPreviewHeader}>
              <h2 className={styles.sectionTitle}>Recent stories</h2>
              <p className={styles.sectionLead}>
                Sign up to follow your city and get a weekly newsletter for what's happening in your city and on your block.
              </p>
            </div>
            <HomeFeedPreview initialStories={stories} metricCards={metricCards} />
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────────── */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>Your city publishes the data. We turn it into useful updates.</h2>
              <p className={styles.ctaDescription}>
                Sign up in 30 seconds to see how your city is working for your block and neighborhood.
              </p>
              <div className="cta-cities">
                <p className="cta-cities-label">
                  {heroLaunchedCities.length > 0 ? "Explore a city" : "Browse cities"}
                </p>
                <div className="cta-city-chips">
                  {heroLaunchedCities.map((c) => (
                    <Link
                      key={c.id}
                      href={`/get/${c.slug || slugify(c.name)}`}
                      className="cta-city-chip"
                    >
                      {c.emoji ? `${c.emoji} ` : ""}{c.name}
                    </Link>
                  ))}
                  <Link href="/sitemap" className="cta-city-chip">
                    Site map →
                  </Link>
                </div>
              </div>
              <div className={styles.ctaButtons}>
                <button
                  type="button"
                  onClick={() => void handleSignup()}
                  className={styles.ctaBtnPrimary}
                >
                  Get started
                </button>
                <a href="/add-your-city" className={styles.ctaBtnOutline}>
                  Request your city
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
