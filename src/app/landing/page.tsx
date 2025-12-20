"use client";

// Preserved legacy "salesy" landing page (formerly `/`).
// We keep it available at `/landing` so the default homepage can evolve
// without losing this template.

import "../landing.css";
import { useAuth0 } from "@auth0/auth0-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import Header from "@/components/Header";

export default function LandingPage() {
  const { isAuthenticated, isLoading, user, loginWithRedirect } = useAuth0();
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const slideCount = 3;
    const interval = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slideCount);
    }, 8000);

    return () => window.clearInterval(interval);
  }, []);

  const handleSignup = async () => {
    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
        prompt: "login",
      },
      appState: { returnTo: "/dashboard" },
    });
  };

  return (
    <>
      <Header showCityPicker={false} />

      {/* Hero Section (simplified version of landing.html) */}
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <span className="badge">📊 Democratizing city data</span>
              <h1 className="hero-title">Everyone Deserves Transparent Government</h1>
              <p className="hero-description">
                From public safety to city services, Transparent.city turns
                official city data into clear, source-linked summaries of what’s
                actually changing in your neighborhood. See where things are
                improving, where they aren’t, and have the receipts to credit or
                challenge your public officials fairly.
              </p>

              <div className="hero-visual">
                <div className="hero-carousel" id="hero-carousel">
                  <div className="hero-carousel-inner">
                    <div
                      className={`hero-slide ${activeSlide === 0 ? "is-active" : ""}`}
                    >
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
                    <div
                      className={`hero-slide ${activeSlide === 1 ? "is-active" : ""}`}
                    >
                      <div className="android-phone-mockup">
                        <div className="phone-frame">
                          <div className="phone-bezel-top">
                            <div className="phone-camera" />
                            <div className="phone-speaker" />
                          </div>
                          <div className="phone-screen">
                            <Image
                              src="/images/app-screenshot-2.png"
                              alt="Transparent.city alert view showing a spike in drug crime incidents on a district map and time series"
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
                    <div
                      className={`hero-slide ${activeSlide === 2 ? "is-active" : ""}`}
                    >
                      <div className="android-phone-mockup">
                        <div className="phone-frame">
                          <div className="phone-bezel-top">
                            <div className="phone-camera" />
                            <div className="phone-speaker" />
                          </div>
                          <div className="phone-screen">
                            <Image
                              src="/images/newsletter.png"
                              alt="Transparent.city newsletter view showing a monthly report for San Francisco"
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
                      </div>
                    </div>
                  </div>
                  <div
                    className="hero-carousel-dots"
                    aria-label="Screenshot selector"
                  >
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
                    <button
                      type="button"
                      className={`hero-dot ${activeSlide === 2 ? "is-active" : ""}`}
                      aria-label="Newsletter monthly report view"
                      onClick={() => setActiveSlide(2)}
                    />
                  </div>
                </div>
              </div>

              <div className="hero-cta">
                <button
                  id="hero-signup-btn"
                  className="btn btn-primary btn-large"
                  onClick={handleSignup}
                  disabled={isLoading}
                >
                  {isAuthenticated ? "Go to Dashboard" : "Sign up now"}
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
                </button>
                <a
                  href="https://dashboard.transparentsf.com/citywide/daniel-lurie/map"
                  id="hero-explore-btn"
                  className="btn btn-outline btn-large"
                >
                  Explore San Francisco
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M8 5L15 10L8 15V5Z" fill="currentColor" />
                  </svg>
                </a>
              </div>
              <p
                style={{
                  fontSize: "0.9rem",
                  color: "var(--text-secondary)",
                  marginTop: "12px",
                }}
              >
                Or see a recent monthly report from TransparentSF at{" "}
                <a
                  href="https://www.transparentsf.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  www.transparentsf.com
                </a>
                .
              </p>

              <div className="social-proof">
                <div className="avatars">
                  <div
                    className="avatar"
                    style={{
                      background:
                        "linear-gradient(135deg, #ad35fa 0%, #7c3aed 100%)",
                    }}
                  />
                  <div
                    className="avatar"
                    style={{
                      background:
                        "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    }}
                  />
                  <div
                    className="avatar"
                    style={{
                      background:
                        "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                    }}
                  />
                  <div
                    className="avatar"
                    style={{
                      background:
                        "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                    }}
                  />
                </div>
                <div className="social-proof-text">
                  <div className="rating">
                    ⭐⭐⭐⭐⭐ <span>4.9/5</span>
                  </div>
                  <p>
                    Used in conversations between residents, neighborhood groups,
                    and public officials in San Francisco
                  </p>
                </div>
              </div>
              {isAuthenticated && user && (
                <p
                  style={{
                    marginTop: "12px",
                    fontSize: "0.9rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  Signed in as {user.email || user.name}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="hero-background">
          <div className="gradient-orb orb-1" />
          <div className="gradient-orb orb-2" />
          <div className="gradient-orb orb-3" />
        </div>
      </section>

      {/* Who We Serve Section */}
      <section id="who-we-serve" className="who-we-serve">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">Who We Serve</span>
            <h2 className="section-title">
              Shared Facts for People Who Care About Their City
            </h2>
            <p className="section-description">
              Transparent.city is for anyone who wants a city that works
              better—from neighbors trying to fix a dangerous intersection, to
              public officials deciding where to focus staff and budget—with
              everyone looking at the same shared facts.
            </p>
          </div>
          <div className="user-types-grid">
            <div className="user-type-card">
              <div className="user-type-icon">👥</div>
              <h3 className="user-type-title">Residents &amp; Neighbors</h3>
              <p className="user-type-description">
                Turn “something feels off” into “here’s what changed, here’s the
                data, and here’s how we should recognize what’s working—or push
                to fix what isn’t.”
              </p>
              <ul className="user-type-benefits">
                <li>✅ District dashboards for crime, 311, permits, and more</li>
                <li>✅ Clear month-over-month and year-over-year trends</li>
                <li>✅ Alerts called out in plain language</li>
                <li>
                  ✅ Shareable charts for emails, neighborhood meetings, and
                  public comment
                </li>
              </ul>
              <div className="user-type-cta">
                <a
                  href="https://dashboard.transparentsf.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                >
                  Open the SF Dashboard
                </a>
              </div>
            </div>
            <div className="user-type-card user-type-card-with-phone">
              <div className="user-type-icon">🏛️</div>
              <h3 className="user-type-title">Supervisors &amp; City Staff</h3>
              <p className="user-type-description">
                Get a clear read on what’s happening in your district, so you
                can see what’s working, where things need attention, and respond
                to residents with transparent, shared facts.
              </p>
              <ul className="user-type-benefits">
                <li>
                  ✅ See a district “control panel” across safety, services,
                  housing, and more
                </li>
                <li>✅ Spot alerts automatically and get regular briefs</li>
                <li>✅ Ask Seymour custom questions about trends and impacts</li>
                <li>
                  ✅ Walk into hearings and meetings with ready-made charts and
                  talking points
                </li>
              </ul>
              <div
                style={{
                  textAlign: "left",
                  margin: "12px 0 24px",
                  fontSize: "0.9rem",
                  color: "var(--text-secondary)",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  Examples of Seymour’s recent work:
                </div>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  <li style={{ marginBottom: 4 }}>
                    <a
                      href="https://platform.transparentsf.com/api/writeups/permalink/15"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Traffic Calming in District 5 – Data &amp; Context
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://platform.transparentsf.com/api/writeups/permalink/16"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Schools and Homeless 311 Calls – Overlaps &amp; Maps
                    </a>
                  </li>
                </ul>
              </div>
              <div className="user-type-cta">
                <button
                  id="official-signup-btn"
                  className="btn btn-primary"
                  onClick={handleSignup}
                  disabled={isLoading}
                >
                  Start as a Public Official
                </button>
              </div>
            </div>
            <div className="user-type-card">
              <div className="user-type-icon">🏢</div>
              <h3 className="user-type-title">Organizations &amp; Media</h3>
              <p className="user-type-description">
                Ground your reporting, advocacy, and planning in verifiable,
                district-level data instead of one-off anecdotes.
              </p>
              <ul className="user-type-benefits">
                <li>
                  ✅ Dig into safety, housing, business activity, and services
                  with ready-made deep dives
                </li>
                <li>
                  ✅ Export charts and data directly into your reports and
                  stories
                </li>
                <li>
                  ✅ Track ordinances and legislation tied to real-world metrics
                </li>
                <li>✅ Get custom research and briefings to support your work</li>
              </ul>
              <div className="user-type-cta">
                <button className="btn btn-outline">
                  Explore Organization Plans
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">Product</span>
            <h2 className="section-title">A Civic Data Engine Built for Accountability</h2>
            <p className="section-description">
              Transparent.city doesn’t just show you charts. It builds a shared,
              verifiable picture of how your city is doing—so residents and
              officials can focus on actually improving it.
            </p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🧩</div>
              <h3 className="feature-title">Unified Public Data Layer</h3>
              <p className="feature-description">
                We pull in official public datasets—crime reports, 311 calls,
                permits, budgets, and more—and normalize them into one
                consistent view of your city.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3 className="feature-title">Signals, Not Noise</h3>
              <p className="feature-description">
                The engine constantly scans for meaningful changes: spikes,
                drops, and long-term shifts by district and topic, instead of
                drowning you in raw tables.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔗</div>
              <h3 className="feature-title">Source-Linked &amp; Documented</h3>
              <p className="feature-description">
                Every metric links back to the original public data and a
                plain-language methods page, so you can verify numbers and share
                them with confidence.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🗣️</div>
              <h3 className="feature-title">Seymour, Your Civic Explainer</h3>
              <p className="feature-description">
                Ask questions in natural language—“did property crime actually
                go up here?”—and get answers with charts, comparisons, and
                source links.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3 className="feature-title">District Dashboards &amp; Briefs</h3>
              <p className="feature-description">
                Each district gets a control panel and regular written briefs
                summarizing what improved, what worsened, and where attention is
                needed.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🛠️</div>
              <h3 className="feature-title">APIs &amp; Exports</h3>
              <p className="feature-description">
                Pull Transparent.city data into your own tools and reports, or
                share ready-made charts with your community and colleagues.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">How It Works</span>
            <h2 className="section-title">From Raw Records to Real Leverage</h2>
            <p className="section-description">
              The point isn’t just knowing the numbers. It’s having enough
              clarity that you and your public officials can focus on fixing
              specific problems together.
            </p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <h3 className="step-title">We Ingest &amp; Analyze Public Data</h3>
              <p className="step-description">
                We connect to official city data—crime, 311, permits, budgets,
                elections, and more—clean it up, normalize it, and analyze it
                over time so real shifts and patterns are easy to see.
              </p>
            </div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-number">2</div>
              <h3 className="step-title">You Show Up With Receipts</h3>
              <p className="step-description">
                Dashboards, briefings, and Seymour’s explanations give you
                ready-to-use charts and language—so you can give credit when
                things improve, push for fixes when they don’t, and keep every
                conversation grounded in the same shared facts.
              </p>
            </div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-number">3</div>
              <h3 className="step-title">We Get a Better City</h3>
              <p className="step-description">
                When residents, advocates, and officials are all working from
                the same picture of what’s working and what isn’t, it’s easier
                to focus on specific problems, test solutions, and hold the
                right people accountable—together.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="pricing">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">Pricing</span>
            <h2 className="section-title">
              Open to the Public. Power Tools for People in the Work.
            </h2>
            <p className="section-description">
              City dashboards stay free to residents. Advanced tools and
              services support public officials and organizations that need
              deeper analysis.
            </p>
          </div>
          <div className="pricing-grid">
            <div className="pricing-card pricing-featured">
              <div className="featured-badge">Public Access</div>
              <div className="pricing-header">
                <h3 className="pricing-title">Residents</h3>
                <div className="pricing-price">
                  <span className="price">Free</span>
                </div>
                <p className="period">For individuals and neighborhood groups</p>
              </div>
              <ul className="pricing-features">
                <li>✅ Open dashboards for supported cities</li>
                <li>✅ Key district metrics and trends</li>
                <li>✅ Public newsletters and written briefs</li>
                <li
                  style={{
                    color: "var(--text-muted)",
                    marginTop: 12,
                    borderTop: "1px dashed var(--border)",
                    paddingTop: 12,
                  }}
                >
                  <strong>Coming soon:</strong>
                </li>
                <li>➕ Custom alerts by topic or place</li>
                <li>➕ Saved views and notes for your group</li>
                <li>➕ Deeper historical comparisons</li>
              </ul>
              <button
                className="btn btn-primary pricing-btn"
                onClick={handleSignup}
                disabled={isLoading}
              >
                Start Free
              </button>
            </div>

            <div className="pricing-card">
              <div className="pricing-header">
                <h3 className="pricing-title">Public Officials</h3>
                <div className="pricing-price">
                  <span className="price">Free</span>
                </div>
                <p className="period">With verified .gov or city email</p>
              </div>
              <ul className="pricing-features">
                <li>✅ Full access to district dashboards and tooling</li>
                <li>✅ Advanced alerts and trend views</li>
                <li>✅ Custom briefing packs for hearings and meetings</li>
                <li>✅ Priority support for data questions</li>
                <li>✅ “Verified Official” badge inside the product</li>
              </ul>
              <button
                className="btn btn-outline pricing-btn"
                onClick={handleSignup}
                disabled={isLoading}
              >
                Verify &amp; Join
              </button>
            </div>

            <div className="pricing-card">
              <div className="pricing-header">
                <h3 className="pricing-title">Organizations</h3>
                <div className="pricing-price">
                  <span className="price">Pilot / Trial</span>
                </div>
                <p className="period">Media, non-profits, and businesses</p>
              </div>
              <ul className="pricing-features">
                <li>✅ 14-day pilot for your city, district, or topic</li>
                <li>✅ Organization dashboards and exports</li>
                <li>✅ API and data access for your own tools</li>
                <li>✅ Ordinance and policy tracking tied to metrics</li>
                <li>✅ White-label reports and internal briefings</li>
                <li>✅ Team access and collaboration</li>
              </ul>
              <button
                className="btn btn-outline pricing-btn"
                onClick={handleSignup}
                disabled={isLoading}
              >
                Start Free Trial
              </button>
            </div>
          </div>
          <div className="pricing-note">
            <p>
              💡 <strong>Enterprise or multi-city?</strong> We partner with
              governments, foundations, and large organizations on custom
              deployments.{" "}
              <a href="mailto:hello@transparentcity.com">Contact us</a> to
              discuss.
            </p>
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
              recognize what’s working, question what isn’t, and keep
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
              <a href="/join-the-team" className="btn btn-outline btn-large">
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

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-column">
              <div className="logo">
                <span className="logo-text">
                  <span className="logo-transparent">transparent</span>
                  <span className="logo-city">.city</span>
                </span>
              </div>
              <p className="footer-description">
                Built entirely on public city data, fully source-linked and
                documented—so everyone can see the same picture of how their
                city is doing.
              </p>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">For Residents</h4>
              <a href="#who-we-serve" className="footer-link">
                How It Helps
              </a>
              <a href="#features" className="footer-link">
                Dashboards &amp; Briefs
              </a>
              <a href="#pricing" className="footer-link">
                Free Access
              </a>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">For Officials</h4>
              <a href="#who-we-serve" className="footer-link">
                District Tools
              </a>
              <a href="#pricing" className="footer-link">
                Official Access
              </a>
              <a
                href="mailto:officials@transparentcity.com"
                className="footer-link"
              >
                Contact Us
              </a>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">For Organizations</h4>
              <a href="#who-we-serve" className="footer-link">
                Use Cases
              </a>
              <a href="#pricing" className="footer-link">
                Pilots &amp; Plans
              </a>
              <a href="mailto:hello@transparentcity.com" className="footer-link">
                Partnerships
              </a>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">Resources</h4>
              <a href="#" className="footer-link">
                Documentation
              </a>
              <a href="#" className="footer-link">
                API Access
              </a>
              <a href="#" className="footer-link">
                Privacy Policy
              </a>
              <a href="/sitemap" className="footer-link">
                Site Map
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>
              &copy; 2025 Transparent.city. Building a shared, verifiable picture
              of city performance, one city at a time.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}



