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
import Loader from "@/components/Loader";
import Header from "@/components/Header";
import {
  trackSignupStart,
  trackSignupClick,
  trackSearchReferrer,
} from "@/lib/analytics";

import "./landing.css";

type ResearchCard = {
  id: number;
  title: string;
  text: string;
  permalinkPath: string;
  meta: string;
  visual_elements: Array<{
    type: string;
    placeholder: string;
    description: string;
    url: string;
  }>;
};

export default function Home() {
  const { isAuthenticated, isLoading, user, loginWithRedirect } = useAuth0();
  const router = useRouter();
  const [signupMenuOpen, setSignupMenuOpen] = useState(false);
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

  // Landing-hero screenshot carousel (matches original landing page)
  const [activeSlide, setActiveSlide] = useState(0);
  const [researchCards, setResearchCards] = useState<ResearchCard[]>([]);
  const [researchLoading, setResearchLoading] = useState(true);

  const normalizedCityQuery = useMemo(() => cityQuery.trim(), [cityQuery]);

  const handleSignup = async (intent: "resident" | "public-servant") => {
    if (isAuthenticated) {
      router.push("/dashboard");
      return;
    }
    
    // Track signup start
    trackSignupStart(intent);
    
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", intent);
    }

    // Track signup click
    trackSignupClick(intent);

    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
        prompt: "login",
      },
      appState: { returnTo: `/dashboard?signup=${intent}` },
    });
  };

  const isImageUrl = (url: string): boolean => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const lowerUrl = url.toLowerCase();
    return imageExtensions.some(ext => lowerUrl.includes(ext)) || 
           lowerUrl.startsWith('data:image/');
  };

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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setResearchLoading(true);
      try {
        const res = await fetch("/api/research/public?limit=6&status=completed");
        if (!res.ok) {
          throw new Error(`Failed to fetch research: ${res.status}`);
        }
        const data = (await res.json()) as { reports: ResearchCard[] };
        if (cancelled) return;

        if (data.reports && data.reports.length > 0) {
          setResearchCards(
            data.reports.map((r) => ({
              ...r,
              meta: "Research",
            })),
          );
        } else {
          setResearchCards([]);
        }
      } catch (e) {
        console.error("Failed to load research cards:", e);
        if (cancelled) return;
        setResearchCards([]);
      } finally {
        if (!cancelled) {
          setResearchLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
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

  // Show loader while checking auth status or redirecting authenticated users
  if (isLoading) {
    return <Loader />;
  }

  // If authenticated, show loader briefly while redirect happens
  if (isAuthenticated) {
    return <Loader />;
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
        <section className={styles.hero}>
          <div className={styles.container}>
            {/* Use the original landing-page hero language + imagery */}
            <div className="hero-content">
              <div className="hero-text">
                <span className="badge">📊 Your city's data, made clear</span>
                <h1 className="hero-title">Your City Just Got Easier to Understand</h1>
                <p className="hero-description">
                  See what's changing in your city. Get clear, source-linked views 
                  of the metrics, trends, and issues that matter to you— 
                  so you can stay informed and engaged with what's happening in your community.
                </p>

                <div className="hero-carousel" id="hero-carousel">
                  <div className="hero-carousel-inner">
                    <div className={`hero-slide ${activeSlide === 0 ? "is-active" : ""}`}>
                      <div className="android-phone-mockup">
                        <div className="phone-frame">
                          <div className="phone-bezel-top">
                            <div className="phone-camera" />
                            <div className="phone-speaker" />
                          </div>
                          <div className="phone-screen">
                            <Image
                              src="/images/app-screenshot-dashboard.png"
                              alt="Transparent.city district dashboard showing key metrics and trends across services"
                              className="phone-screenshot"
                              width={1080}
                              height={1920}
                              priority
                            />
                          </div>
                          <div className="phone-bezel-bottom" />
                          <div className="phone-button-volume-up" />
                          <div className="phone-button-volume-down" />
                          <div className="phone-button-power" />
                        </div>
                        <div className="phone-shadow" />
                      </div>
                    </div>

                    <div className={`hero-slide ${activeSlide === 1 ? "is-active" : ""}`}>
                      <div className="android-phone-mockup">
                        <div className="phone-frame">
                          <div className="phone-bezel-top">
                            <div className="phone-camera" />
                            <div className="phone-speaker" />
                          </div>
                          <div className="phone-screen">
                            <Image
                              src="/images/app-screenshot-2.png"
                              alt="Transparent.city alert view showing a spike on a district map and time series"
                              className="phone-screenshot"
                              width={1080}
                              height={1920}
                              priority={false}
                            />
                          </div>
                          <div className="phone-bezel-bottom" />
                          <div className="phone-button-volume-up" />
                          <div className="phone-button-volume-down" />
                          <div className="phone-button-power" />
                        </div>
                        <div className="phone-shadow" />
                      </div>
                    </div>
                  </div>

                  <div className="hero-carousel-dots" aria-label="Screenshot selector">
                    <button
                      type="button"
                      className={`hero-dot ${activeSlide === 0 ? "is-active" : ""}`}
                      aria-label="District dashboard view"
                      onClick={() => setActiveSlide(0)}
                    />
                    <button
                      type="button"
                      className={`hero-dot ${activeSlide === 1 ? "is-active" : ""}`}
                      aria-label="Alert map view"
                      onClick={() => setActiveSlide(1)}
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} id="who-this-is-for">
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Giving you the clarity you want</h2>
            <p className={styles.sectionLead}>
              For city staff: track what's changing in your area of focus and see what solutions are working. For residents: understand what's going on with your city through clear, data-driven insights.
            </p>

            <div className={styles.grid}>
              <div className={`${styles.card} ${styles.tile}`}>
                <div className={styles.audienceCardHeader}>
                  <div className={styles.tileTitle}>Residents</div>
                  <span className={styles.audienceTag}>For individuals</span>
                </div>
                <div className={styles.tileBody}>
                  Turn “what’s going on?” into something you can point to and share.
                </div>
                <ul className={styles.toolList}>
                  <li>City search + city pages</li>
                  <li>Maps and trend views (where available)</li>
                  <li>Source-linked research writeups</li>
                </ul>
              </div>

              <div className={`${styles.card} ${styles.tile}`}>
                <div className={styles.audienceCardHeader}>
                  <div className={styles.tileTitle}>City staff</div>
                  <span className={styles.audienceTag}>For government</span>
                </div>
                <div className={styles.tileBody}>
                  A shared baseline for decisions and public communication.
                </div>
                <ul className={styles.toolList}>
                  <li>Briefings and context for operational clarity</li>
                  <li>Consistent measurement across topics</li>
                  <li>Secure tools for .gov email addresses</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Recent research</h2>
            <p className={styles.sectionLead}>
              See how civic questions get answered with public data, maps, and 
              plain-language explanations you can understand and share.
            </p>

            <div className={styles.researchGrid}>
              {researchLoading ? (
                <div className={styles.tileBody}>Loading research...</div>
              ) : researchCards.length === 0 ? (
                <div className={styles.tileBody}>No research available</div>
              ) : (
                researchCards.map((r) => (
                  <Link
                    key={r.id}
                    href={r.permalinkPath}
                    className={styles.researchCard}
                  >
                    <div className={styles.researchImageWrapper}>
                      {r.visual_elements && r.visual_elements.length > 0 && r.visual_elements[0].url ? (
                        isImageUrl(r.visual_elements[0].url) ? (
                          <Image
                            src={r.visual_elements[0].url}
                            alt={r.visual_elements[0].description || `${r.title} preview`}
                            fill
                            style={{ objectFit: 'cover' }}
                            loading="lazy"
                          />
                        ) : (
                          <div className={styles.researchChartPlaceholder}>
                            <span>📊 Chart</span>
                          </div>
                        )
                      ) : (
                        <div className={styles.researchImagePlaceholder}>
                          <span>📄</span>
                        </div>
                      )}
                    </div>
                    <div className={styles.researchContent}>
                      <div className={styles.researchMeta}>{r.meta}</div>
                      <h3 className={styles.researchHeadline}>{r.title}</h3>
                      <p className={styles.researchDescription}>{r.text}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="cta">
          <div className="container">
            <div className="cta-content">
              <h2 className="cta-title">Ready to See How Your City Is Really Doing?</h2>
              <p className="cta-description">
                Start with San Francisco today. Use shared, verifiable facts to
                recognize what's working, question what isn't, and keep
                conversations between residents, advocates, and officials grounded
                in reality.
              </p>
              <div className="cta-buttons">
                <a
                  className="btn btn-primary btn-large"
                  href="https://dashboard.transparentsf.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open the SF Dashboard
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4 10H16M16 10L12 6M16 10L12 14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                <a href="/pro" className="btn btn-outline btn-large">
                  Partner or Join the Team
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
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
              <div className={styles.finePrint}>
                Facts for residents. Evidence for elected officials. Accountability for everyone.
                <br />
                <br />
                All data is sourced from official city open data portals with documented queries and direct links.
                <br />
                <br />
                &copy; 2026 Transparent.city
              </div>
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

