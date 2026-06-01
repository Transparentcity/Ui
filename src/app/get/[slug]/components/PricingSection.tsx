"use client";

import { useAuth0 } from "@auth0/auth0-react";
import styles from "../get-landing.module.css";

const FREE_FEATURES = [
  "Full access for your first month",
  "Weekly briefing for your city",
  "District-level personalisation",
  "Every number links to source data",
  "Cancel any time",
];

const PAID_FEATURES = [
  "Everything in the free month",
  "Ongoing weekly briefings",
  "Anomaly alerts when trends shift",
  "Dashboard access for your city",
  "Priority support",
];

type Props = {
  citySlug: string;
  cityName: string;
  cityId?: number | null;
};

export default function PricingSection({ citySlug, cityName, cityId }: Props) {
  const { isAuthenticated, loginWithRedirect } = useAuth0();

  const handleSignup = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", "resident");
      window.localStorage.setItem("transparentcity.signup_surface", "city_get_landing_pricing");
      window.localStorage.setItem("transparentcity.follow_city_slug", citySlug);
      window.localStorage.setItem("transparentcity.follow_city_name", cityName);
      if (typeof cityId === "number") {
        window.localStorage.setItem("transparentcity.follow_city_id", String(cityId));
      }
      const params = new URLSearchParams({
        signup: "resident",
        follow_city_slug: citySlug,
        follow_city_name: cityName,
      });
      if (typeof cityId === "number") params.set("follow_city_id", String(cityId));
      try {
        sessionStorage.setItem("auth_return_after_check_email", `/home?${params.toString()}`);
      } catch { /* ignore */ }
    }

    await loginWithRedirect({
      authorizationParams: { screen_hint: "signup" },
      appState: {
        returnTo: `/home?signup=resident&follow_city_slug=${citySlug}&follow_city_name=${encodeURIComponent(cityName)}`,
      },
    });
  };

  return (
    <section className={styles.pricingSection}>
      <div className="container">
        <header className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>Pricing</span>
          <h2 className={styles.sectionHeading}>Start free for one month</h2>
          <p className={styles.sectionSubheading}>
            No credit card required. Full access from day one.
          </p>
        </header>

        <div className={styles.pricingGrid}>
          {/* Free trial */}
          <div className={styles.pricingCard}>
            <div className={styles.pricingHeader}>
              <h3 className={styles.pricingTitle}>First month</h3>
              <div className={styles.pricingPrice}>
                <span className={styles.priceAmount}>$0</span>
                <span className={styles.pricePeriod}> / month</span>
              </div>
            </div>
            <ul className={styles.pricingFeatures}>
              {FREE_FEATURES.map((f) => (
                <li key={f} className={styles.pricingFeatureItem}>
                  <span className={styles.pricingCheck}>✓</span> {f}
                </li>
              ))}
            </ul>
            {!isAuthenticated && (
              <button onClick={handleSignup} className={styles.pricingCtaSecondary}>
                Get started free
              </button>
            )}
          </div>

          {/* Ongoing — featured */}
          <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
            <div className={styles.pricingFeaturedBadge}>Most popular</div>
            <div className={styles.pricingHeader}>
              <h3 className={styles.pricingTitle}>Ongoing</h3>
              <div className={styles.pricingPrice}>
                <span className={styles.priceAmount}>$5</span>
                <span className={styles.pricePeriod}> / month</span>
              </div>
              <p className={styles.pricingAfterTrial}>After your free first month</p>
            </div>
            <ul className={styles.pricingFeatures}>
              {PAID_FEATURES.map((f) => (
                <li key={f} className={styles.pricingFeatureItem}>
                  <span className={styles.pricingCheck}>✓</span> {f}
                </li>
              ))}
            </ul>
            {!isAuthenticated && (
              <button onClick={handleSignup} className={styles.pricingCtaPrimary}>
                Start free, $5/mo after
              </button>
            )}
          </div>
        </div>

        <p className={styles.pricingNote}>
          Payment processing is coming soon. Sign up now and your free month starts immediately, with no
          interruption when billing launches.
        </p>
      </div>
    </section>
  );
}
