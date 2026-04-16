"use client";

import styles from "./home.module.css";
import { useAuth0 } from "@auth0/auth0-react";
import PublicFooter from "@/components/PublicFooter";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { PublicCitySitemapItem } from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";
import Loader from "@/components/Loader";
import Header from "@/components/Header";
import HomeFeedPreview from "@/components/feed/HomeFeedPreview";
import { trackSearchReferrer } from "@/lib/analytics";
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

  const handleSignup = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", "resident");
    }
    await loginWithRedirect({
      authorizationParams: { screen_hint: "signup" },
      appState: { returnTo: "/home?signup=resident" },
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
                Real stories from your own neighborhood.
              </p>

              <div className={styles.heroCtas}>
                <button
                  type="button"
                  onClick={handleSignup}
                  className={`${styles.button} ${styles.buttonPrimary} ${styles.heroBtn}`}
                >
                  Get the Free Weekly
                </button>

                {launchedCities.length > 0 && (
                  <div className={styles.heroExplore}>
                    <span className={styles.heroExploreLabel}>or explore:</span>
                    {launchedCities.map((c) => (
                      <Link
                        key={c.id}
                        href={`/c/${slugify(c.name)}`}
                        className={styles.heroCityLink}
                      >
                        {c.emoji ? `${c.emoji} ` : ""}{c.name}
                      </Link>
                    ))}
                  </div>
                )}
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

        {/* ── Final CTA ─────────────────────────────────────────────────── */}
        <section className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.ctaContent}>
              <h2 className={styles.ctaTitle}>Your city publishes the data. We make it useful.</h2>
              <p className={styles.ctaDescription}>
                Sign up in 30 seconds. Pick your city. Start reading stories backed by real numbers.
              </p>
              <div className={styles.ctaButtons}>
                <button
                  type="button"
                  onClick={handleSignup}
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
