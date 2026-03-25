"use client";

import styles from "./home.module.css";
import { useAuth0 } from "@auth0/auth0-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  searchPublicCities,
  type PublicCitySearchResult,
} from "@/lib/publicApiClient";
import { listPublicFeedPlaces, listPublicFeedStories, type FeedPlace } from "@/lib/apiClient";
import Loader from "@/components/Loader";
import Header from "@/components/Header";
import HomeFeedPreview from "@/components/feed/HomeFeedPreview";
import { trackSearchReferrer } from "@/lib/analytics";


export default function Home() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();

  const handleSignupCitizen = async () => {
    await loginWithRedirect({
      authorizationParams: { screen_hint: "signup" },
      appState: { returnTo: "/dashboard?signup=resident" },
    });
  };

  const handleSignupCityStaff = async () => {
    await loginWithRedirect({
      authorizationParams: { screen_hint: "signup" },
      appState: { returnTo: "/dashboard?signup=public-servant" },
    });
  };
  const [cityQuery, setCityQuery] = useState("");
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [cityResults, setCityResults] = useState<PublicCitySearchResult[]>([]);
  const [suggestedCities, setSuggestedCities] = useState<PublicCitySearchResult[]>(
    [],
  );
  const [cityLoading, setCityLoading] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchTimeoutRef = useRef<number | null>(null);
  const lastRequestIdRef = useRef(0);

  // Live cities and stats from public APIs
  type LiveCity = { city_id: number; city_name: string; city_emoji: string; slug: string };
  const [liveCities, setLiveCities] = useState<LiveCity[]>([]);
  const [storyCount, setStoryCount] = useState<number | null>(null);
  const [cityCount, setCityCount] = useState<number | null>(null);

  // Landing-hero screenshot carousel (matches original landing page)
  const [activeSlide, setActiveSlide] = useState(0);

  const normalizedCityQuery = useMemo(() => cityQuery.trim(), [cityQuery]);


  const slugify = (text: string): string => {
    const slug = text.trim().toLowerCase();
    return slug
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const runCitySearch = async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setCityResults([]);
      setCityError(null);
      setCityLoading(false);
      setSelectedIndex(-1);
      return;
    }

    const requestId = ++lastRequestIdRef.current;
    setCityLoading(true);
    setCityError(null);

    try {
      const results = await searchPublicCities(q, 10);
      if (lastRequestIdRef.current !== requestId) return; // stale
      setCityResults(Array.isArray(results) ? results : []);
      setSelectedIndex(-1);
      setCityLoading(false);
    } catch (e) {
      if (lastRequestIdRef.current !== requestId) return; // stale
      setCityResults([]);
      setSelectedIndex(-1);
      setCityLoading(false);
      setCityError(e instanceof Error ? e.message : "City search failed");
    }
  };

  const loadSuggestedCities = async () => {
    // Mirror the platform landing behavior: show SF first until the user types.
    try {
      const results = await searchPublicCities("San Francisco", 10);
      const sfFirst = [...results].sort((a, b) => {
        const aIsSf = a.name.toLowerCase() === "san francisco" ? 0 : 1;
        const bIsSf = b.name.toLowerCase() === "san francisco" ? 0 : 1;
        if (aIsSf !== bIsSf) return aIsSf - bIsSf;
        return a.display_name.localeCompare(b.display_name);
      });
      setSuggestedCities(sfFirst);
      setCityResults(sfFirst);
      setCityError(null);
      setCityLoading(false);
      setSelectedIndex(-1);
    } catch (e) {
      setSuggestedCities([]);
      setCityResults([]);
      setCityError(e instanceof Error ? e.message : "City search failed");
      setCityLoading(false);
      setSelectedIndex(-1);
    }
  };

  const scheduleCitySearch = (query: string) => {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = window.setTimeout(() => {
      void runCitySearch(query);
    }, 300);
  };

  const selectCity = (city: PublicCitySearchResult) => {
    const display = city.display_name || city.name;
    const slug = slugify(city.name);

    setCityQuery(display);
    setCityDropdownOpen(false);
    setSelectedIndex(-1);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.preferred_city_slug", slug);
      window.localStorage.setItem("transparentcity.preferred_city_name", display);
      window.localStorage.setItem("transparentcity.preferred_city_id", String(city.id));
    }

    router.push(`/c/${slug}`);
  };

  // Redirect authenticated users directly to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);


  useEffect(() => {
    const slideCount = 2;
    const interval = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slideCount);
    }, 8000);

    return () => window.clearInterval(interval);
  }, []);

  // Load live cities and story count from public APIs
  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      try {
        const [placesRes, storiesRes] = await Promise.all([
          listPublicFeedPlaces(),
          listPublicFeedStories({ limit: 1 }),
        ]);
        if (cancelled) return;
        // Deduplicate by city_id (places include per-district entries)
        const seen = new Set<number>();
        const unique: LiveCity[] = [];
        for (const p of placesRes.places) {
          if (!seen.has(p.city_id)) {
            seen.add(p.city_id);
            unique.push({
              city_id: p.city_id,
              city_name: p.city_name,
              city_emoji: p.city_emoji,
              slug: slugify(p.city_name),
            });
          }
        }
        setLiveCities(unique);
        if (storiesRes.count > 0) setStoryCount(storiesRes.count);
        const metricCities = placesRes.cities_with_metrics_count;
        if (metricCities && metricCities > 0) setCityCount(metricCities);
      } catch {
        // Non-critical; page still works without stats
      }
    }
    void loadStats();
    return () => { cancelled = true; };
  }, []);

  // Track search referrer on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get("q") || urlParams.get("query");
    if (query) {
      trackSearchReferrer(query);
    }
  }, []);


  const handleCityQueryChange = (query: string) => {
    setCityQuery(query);
    setCityDropdownOpen(true);
    scheduleCitySearch(query);
  };

  const handleCityFocus = () => {
    setCityDropdownOpen(true);
    const q = cityQuery.trim();
    if (q.length < 2) {
      if (suggestedCities.length) {
        setCityResults(suggestedCities);
        setSelectedIndex(-1);
      } else {
        setCityLoading(true);
        void loadSuggestedCities();
      }
      return;
    }
    scheduleCitySearch(cityQuery);
  };

  const handleCityDropdownClose = () => {
    setCityDropdownOpen(false);
    setSelectedIndex(-1);
  };

  const handleCityKeyDown = (e: React.KeyboardEvent) => {
    if (!cityDropdownOpen) return;
    if (!cityResults.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, cityResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      const city = cityResults[selectedIndex];
      if (city) selectCity(city);
    } else if (e.key === "Escape") {
      setCityDropdownOpen(false);
      setSelectedIndex(-1);
    }
  };

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
      <Header
        showCityPicker={true}
        cityQuery={cityQuery}
        onCityQueryChange={handleCityQueryChange}
        cityResults={cityResults}
        cityLoading={cityLoading}
        cityError={cityError}
        selectedIndex={selectedIndex}
        onCitySelect={selectCity}
        onCityKeyDown={handleCityKeyDown}
        cityDropdownOpen={cityDropdownOpen}
        onCityFocus={handleCityFocus}
        onCityDropdownClose={handleCityDropdownClose}
      />

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.heroCentered}>
              <h1 className={styles.headline}>
                Know what&apos;s actually happening in your city
              </h1>
              <p className={styles.subhead}>
                Crime trending down? Permits spiking? 311 complaints changing?
                We turn your city&apos;s open data into clear, source-linked stories
                you can read in 30 seconds.
              </p>

              {/* Stats bar */}
              {(cityCount || liveCities.length > 0 || storyCount) && (
                <div className={styles.statsBar}>
                  {(cityCount ?? liveCities.length) > 0 && (
                    <div className={styles.stat}>
                      <span className={styles.statNumber}>{cityCount ?? liveCities.length}</span>
                      <span className={styles.statLabel}>{(cityCount ?? liveCities.length) === 1 ? "city tracked" : "cities tracked"}</span>
                    </div>
                  )}
                  {storyCount && (
                    <div className={styles.stat}>
                      <span className={styles.statNumber}>{storyCount.toLocaleString()}+</span>
                      <span className={styles.statLabel}>stories generated</span>
                    </div>
                  )}
                  <div className={styles.stat}>
                    <span className={styles.statNumber}>100%</span>
                    <span className={styles.statLabel}>sourced from open data</span>
                  </div>
                </div>
              )}

              <div className={styles.heroCtas}>
                <button
                  type="button"
                  onClick={handleSignupCitizen}
                  className={`${styles.button} ${styles.buttonPrimary} ${styles.heroBtn}`}
                >
                  Get your city feed, free
                </button>

                {liveCities.length > 0 && (
                  <div className={styles.heroExplore}>
                    <span className={styles.heroExploreLabel}>or explore:</span>
                    {liveCities.slice(0, 4).map((c) => (
                      <Link
                        key={c.city_id}
                        href={`/c/${c.slug}`}
                        className={styles.heroCityLink}
                      >
                        {c.city_emoji ? `${c.city_emoji} ` : ""}{c.city_name}
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
              <h2 className={styles.sectionTitle}>See what the feed looks like</h2>
              <p className={styles.sectionLead}>
                These are real stories from the last few days, generated automatically from public data.
                Sign up to follow your city and get stories tailored to your district.
              </p>
            </div>
            <HomeFeedPreview />
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
                  Search for your city and we&apos;ll pull the latest open data
                  from official portals automatically.
                </p>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>2</div>
                <h3 className={styles.stepTitle}>Get your feed</h3>
                <p className={styles.stepDesc}>
                  We analyze trends, anomalies, and changes, then write
                  plain-language stories with charts and source links.
                </p>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>3</div>
                <h3 className={styles.stepTitle}>Stay informed</h3>
                <p className={styles.stepDesc}>
                  New stories appear as data updates. Get alerts for
                  spikes, weekly digests, or browse whenever you want.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Audience cards ────────────────────────────────────────────── */}
        <section className={styles.section} id="who-this-is-for">
          <div className={styles.container}>
            <h2 className={styles.sectionTitle} style={{ textAlign: "center" }}>Built for two audiences</h2>
            <div className={styles.audienceGrid}>
              <div className={styles.audienceCard}>
                <div className={styles.audienceIconWrap}>
                  <span className={styles.audienceIcon}>&#x1F3D8;&#xFE0F;</span>
                </div>
                <div className={styles.audienceCardHeader}>
                  <div className={styles.audienceTitle}>Residents</div>
                  <span className={styles.audienceTag}>Free</span>
                </div>
                <p className={styles.audienceBody}>
                  Stop guessing about what&apos;s happening in your neighborhood.
                  Get concrete numbers you can share and reference, and flag
                  what matters directly to your district supervisor.
                </p>
                <ul className={styles.audienceFeatures}>
                  <li>
                    <span className={styles.featureCheck}>&#x2713;</span>
                    See crime, permits, and 311 trends for your district
                  </li>
                  <li>
                    <span className={styles.featureCheck}>&#x2713;</span>
                    Get alerted when something spikes or drops
                  </li>
                  <li>
                    <span className={styles.featureCheck}>&#x2713;</span>
                    Flag any story to send feedback to your rep
                  </li>
                  <li>
                    <span className={styles.featureCheck}>&#x2713;</span>
                    Every number links back to the source data
                  </li>
                </ul>
                <div className={styles.audienceActions}>
                  <button
                    type="button"
                    onClick={handleSignupCitizen}
                    className={styles.audiencePrimaryBtn}
                  >
                    Sign up free
                  </button>
                </div>
              </div>

              <div className={styles.audienceCard}>
                <div className={styles.audienceIconWrap}>
                  <span className={styles.audienceIcon}>&#x1F3DB;&#xFE0F;</span>
                </div>
                <div className={styles.audienceCardHeader}>
                  <div className={styles.audienceTitle}>Officials &amp; city staff</div>
                  <span className={styles.audienceTag}>Free for .gov</span>
                </div>
                <p className={styles.audienceBody}>
                  See the same data your constituents see. Claim your verified
                  profile, respond to resident feedback, and use shared metrics
                  as the baseline for public communication.
                </p>
                <ul className={styles.audienceFeatures}>
                  <li>
                    <span className={styles.featureCheck}>&#x2713;</span>
                    Verified .gov profile so residents know it&apos;s you
                  </li>
                  <li>
                    <span className={styles.featureCheck}>&#x2713;</span>
                    Receive and respond to flagged citizen feedback
                  </li>
                  <li>
                    <span className={styles.featureCheck}>&#x2713;</span>
                    Ready-to-share briefings for meetings and emails
                  </li>
                  <li>
                    <span className={styles.featureCheck}>&#x2713;</span>
                    Track whether policies and interventions are working
                  </li>
                </ul>
                <div className={styles.audienceActions}>
                  <Link href="/claim" className={styles.audiencePrimaryBtn}>
                    Claim your official profile
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignupCityStaff}
                    className={styles.audienceSecondaryLink}
                    style={{ background: "none", border: "none", cursor: "pointer", font: "inherit" }}
                  >
                    I&apos;m city staff {"\u2192"}
                  </button>
                </div>
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
                  onClick={handleSignupCitizen}
                  className={styles.ctaBtnPrimary}
                >
                  Get started free
                </button>
                <a href="/pro" className={styles.ctaBtnOutline}>
                  Add your city
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div>
              <div className={styles.brandText}>
                transparent<span className={styles.brandDotCity}>.city</span>
              </div>
              <p className={styles.finePrint}>
                Facts for residents. Evidence for city staff. Accountability for everyone.
              </p>
              <p className={styles.finePrint}>
                All data sourced from official city open data portals with documented queries and direct links.
              </p>
              <p className={styles.finePrint} style={{ marginTop: 12 }}>
                &copy; 2026 Transparent.city
              </p>
            </div>
            <div>
              <div className={styles.sideTitle}>Start</div>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                <Link className={styles.link} href="/landing">
                  Learn more
                </Link>
                <Link className={styles.link} href="/pro">
                  Add Your City
                </Link>
                <Link className={styles.link} href="/debug/health">
                  API health
                </Link>
                <Link className={styles.link} href="/sitemap">
                  Site map
                </Link>
              </div>
            </div>
            <div>
              <div className={styles.sideTitle}>Updates</div>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                <a
                  className={styles.link}
                  href="https://www.transparentsf.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Newsletter
                </a>
                <a className={styles.link} href="mailto:hello@transparentcity.com">
                  Contact
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

