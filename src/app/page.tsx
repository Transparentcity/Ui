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
  const cityPickerRef = useRef<HTMLDivElement | null>(null);

  // Landing-hero screenshot carousel (matches original landing page)
  const [activeSlide, setActiveSlide] = useState(0);
  const [researchCards, setResearchCards] = useState<ResearchCard[]>([]);
  const [researchLoading, setResearchLoading] = useState(true);

  const normalizedCityQuery = useMemo(() => cityQuery.trim(), [cityQuery]);

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

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (cityPickerRef.current && !cityPickerRef.current.contains(target)) {
        setCityDropdownOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
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

  const handleLogin = async () => {
    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "login",
        prompt: "login",
      },
      appState: { returnTo: "/dashboard" },
    });
  };

  const handleSignup = async (intent: "resident" | "public-servant") => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", intent);
    }

    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
        prompt: "login",
      },
      appState: { returnTo: `/dashboard?signup=${intent}` },
    });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.container}>
          <div className={styles.headerInner}>
            <Link
              href="/"
              className={styles.brand}
              aria-label="Transparent.city home"
            >
              <svg
                className={styles.brandMark}
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                style={{ overflow: "visible" }}
              >
                <defs>
                  <mask
                    id="logo-mask-bl-home"
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
                    <rect
                      x="8.333"
                      y="8.333"
                      width="83.333"
                      height="83.333"
                      rx="3"
                      ry="3"
                      fill="black"
                    />
                    <rect
                      x="16.666"
                      y="-33.333"
                      width="66.666"
                      height="166.666"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                    <rect
                      x="50"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                  </mask>
                  <mask
                    id="logo-mask-tr-home"
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
                    <rect
                      x="8.333"
                      y="8.333"
                      width="83.333"
                      height="83.333"
                      rx="3"
                      ry="3"
                      fill="black"
                    />
                    <rect
                      x="16.666"
                      y="-33.333"
                      width="66.666"
                      height="166.666"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                    <rect
                      x="-1150"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                  </mask>
                </defs>
                <rect
                  className={styles.logoBrace}
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask="url(#logo-mask-bl-home)"
                  transform="translate(23.5%, -23.5%)"
                />
                <rect
                  className={styles.logoBrace}
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask="url(#logo-mask-tr-home)"
                  transform="translate(-23.5%, 23.5%)"
                />
              </svg>
              <span className={styles.brandText}>
                transparent<span className={styles.brandDotCity}>.city</span>
              </span>
            </Link>

            <div className={styles.cityPicker} ref={cityPickerRef}>
              <input
                className={styles.cityInput}
                value={cityQuery}
                placeholder="Start with San Francisco — or search for your city…"
                onChange={(e) => {
                  setCityQuery(e.target.value);
                  setCityDropdownOpen(true);
                  scheduleCitySearch(e.target.value);
                }}
                onFocus={() => {
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
                }}
                onKeyDown={(e) => {
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
                }}
              />

              {cityDropdownOpen && (
                <div
                  className={styles.cityDropdown}
                  role="listbox"
                  aria-label="City options"
                >
                  {cityLoading && (
                    <div className={styles.cityOption} role="option" aria-selected={false}>
                      <div>Searching…</div>
                      <div className={styles.cityMeta}>Type at least 2 characters</div>
                    </div>
                  )}

                  {!cityLoading && cityError && (
                    <div className={styles.cityOption} role="option" aria-selected={false}>
                      <div>City search unavailable</div>
                      <div className={styles.cityMeta}>{cityError}</div>
                    </div>
                  )}

                  {!cityLoading && !cityError && normalizedCityQuery.length < 2 && (
                    <>
                      {cityResults.length ? null : (
                        <div
                          className={styles.cityOption}
                          role="option"
                          aria-selected={false}
                        >
                          <div>Start with San Francisco</div>
                          <div className={styles.cityMeta}>
                            Or search by city, state, or country
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {!cityLoading &&
                    !cityError &&
                    normalizedCityQuery.length >= 2 &&
                    cityResults.map((city, idx) => (
                      <div
                        key={`${city.id}-${city.display_name}`}
                        className={styles.cityOption}
                        role="option"
                        aria-selected={idx === selectedIndex}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectCity(city);
                        }}
                        style={{
                          background:
                            idx === selectedIndex ? "rgba(17, 24, 39, 0.05)" : "transparent",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {city.emoji ? (
                            <span aria-hidden style={{ fontSize: 18 }}>
                              {city.emoji}
                            </span>
                          ) : null}
                          <div>{city.display_name}</div>
                        </div>
                        <div className={styles.cityMeta}>Browse</div>
                      </div>
                    ))}

                  {/* Suggested cities (shown before typing) */}
                  {!cityLoading &&
                    !cityError &&
                    normalizedCityQuery.length < 2 &&
                    cityResults.map((city, idx) => (
                      <div
                        key={`${city.id}-${city.display_name}`}
                        className={styles.cityOption}
                        role="option"
                        aria-selected={idx === selectedIndex}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectCity(city);
                        }}
                        style={{
                          background:
                            idx === selectedIndex
                              ? "rgba(17, 24, 39, 0.05)"
                              : "transparent",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {city.emoji ? (
                            <span aria-hidden style={{ fontSize: 18 }}>
                              {city.emoji}
                            </span>
                          ) : null}
                          <div>{city.display_name}</div>
                        </div>
                        <div className={styles.cityMeta}>Suggested</div>
                      </div>
                    ))}

                  {!cityLoading &&
                    !cityError &&
                    normalizedCityQuery.length >= 2 &&
                    cityResults.length === 0 && (
                      <div className={styles.cityOption} role="option" aria-selected={false}>
                        <div>No cities found</div>
                        <div className={styles.cityMeta}>Try another spelling</div>
                      </div>
                    )}
                </div>
              )}
            </div>

            <nav className={styles.navRight} aria-label="Top navigation">
              <a
                className={styles.link}
                href="https://www.transparentsf.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Newsletter
              </a>
              <Link className={styles.link} href="/pro">
                For city staff
              </Link>
              <Link className={styles.link} href="/landing">
                Product
              </Link>

              <button
                className={styles.button}
                onClick={handleLogin}
                disabled={isLoading}
              >
                {isAuthenticated ? "Dashboard" : "Sign in"}
              </button>

              <div className={styles.menuWrap}>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  onClick={() => setSignupMenuOpen((v) => !v)}
                  disabled={isLoading}
                  aria-haspopup="menu"
                  aria-expanded={signupMenuOpen}
                >
                  {isAuthenticated ? "Go to dashboard" : "Sign up"}
                </button>
                {signupMenuOpen && !isAuthenticated && (
                  <div className={styles.menu} role="menu" aria-label="Sign up options">
                    <button
                      className={styles.menuItem}
                      role="menuitem"
                      onClick={() => handleSignup("resident")}
                      disabled={isLoading}
                    >
                      <div className={styles.menuItemTitle}>I’m a resident</div>
                      <div className={styles.menuItemDesc}>
                        Follow a city, read research, and get the map view.
                      </div>
                    </button>
                    <button
                      className={styles.menuItem}
                      role="menuitem"
                      onClick={() => handleSignup("public-servant")}
                      disabled={isLoading}
                    >
                      <div className={styles.menuItemTitle}>I’m a public servant</div>
                      <div className={styles.menuItemDesc}>
                        Tools for staff: briefs, context, and operational clarity.
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </nav>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.container}>
            {/* Use the original landing-page hero language + imagery */}
            <div className="hero-content">
              <div className="hero-text">
                <span className="badge">📊 Your city's data, made clear</span>
                <h1 className="hero-title">Everyone Deserves Transparent Government</h1>
                <p className="hero-description">
                  See what's changing in your city. Get clear, source-linked views 
                  of the metrics, trends, and issues that matter to you as a resident— 
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

                <div className="hero-cta" style={{ gap: 12, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary btn-large"
                    onClick={() => handleSignup("resident")}
                    disabled={isLoading}
                  >
                    {isAuthenticated ? "Go to Dashboard" : "Get updates (Resident)"}
                  </button>
                  <button
                    className="btn btn-secondary btn-large"
                    onClick={() => handleSignup("public-servant")}
                    disabled={isLoading}
                  >
                    {isAuthenticated ? "Dashboard (Staff)" : "City staff / policy"}
                  </button>
                  <a
                    href="https://dashboard.transparentsf.com/citywide/daniel-lurie/map"
                    className="btn btn-outline btn-large"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Explore San Francisco
                  </a>
                </div>

                {isAuthenticated && user && (
                  <div style={{ marginTop: 12, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                    Signed in as {user.email || user.name}
                  </div>
                )}

                <div style={{ marginTop: 10, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                  Working in government? <Link href="/pro">Start here</Link>.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} id="who-this-is-for">
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Built for how you work</h2>
            <p className={styles.sectionLead}>
              Get the clarity you need: understand your city as a resident, build 
              stronger stories as a researcher, and make better decisions as a leader.
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
                  <div className={styles.tileTitle}>Researchers &amp; journalists</div>
                  <span className={styles.audienceTag}>For reporting</span>
                </div>
                <div className={styles.tileBody}>
                  Faster paths from claim → data → chart → explanation.
                </div>
                <ul className={styles.toolList}>
                  <li>Permalink research pages (shareable, citeable)</li>
                  <li>Embedded charts and maps for stories</li>
                  <li>Methods that show how numbers were produced</li>
                </ul>
              </div>

              <div className={`${styles.card} ${styles.tile}`}>
                <div className={styles.audienceCardHeader}>
                  <div className={styles.tileTitle}>Policy makers</div>
                  <span className={styles.audienceTag}>For government</span>
                </div>
                <div className={styles.tileBody}>
                  A shared baseline for decisions and public communication.
                </div>
                <ul className={styles.toolList}>
                  <li>Briefings and context for operational clarity</li>
                  <li>Consistent measurement across topics</li>
                  <li>A Pro path for staff tooling</li>
                </ul>
                <div className={styles.ctaRow} style={{ marginTop: 12 }}>
                  <Link className={styles.button} href="/pro">
                    City staff: Pro tools
                  </Link>
                </div>
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
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div>
              <div className={styles.brandText}>
                transparent<span className={styles.brandDotCity}>.city</span>
              </div>
              <div className={styles.finePrint}>
                Facts for residents. Evidence for leaders. Accountability for everyone.
              </div>
            </div>
            <div>
              <div className={styles.sideTitle}>Start</div>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                <Link className={styles.link} href="/landing">
                  Learn more
                </Link>
                <Link className={styles.link} href="/pro">
                  Pro
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

