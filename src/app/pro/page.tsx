"use client";

import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { useState } from "react";
import "../landing.css";
import Header from "@/components/Header";

export default function AddYourCityPage() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    interests: "",
    howCanHelp: "",
  });
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const handlePublicServantSignup = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", "public-servant");
    }

    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
        prompt: "login",
      },
      appState: { returnTo: "/dashboard" },
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Validate required fields
    if (!formData.name || !formData.email || !formData.city) {
      setFormError("Please fill in all required fields.");
      return;
    }

    // For now, we'll just show success - in production, this would send to an API
    try {
      // Could integrate with an API endpoint here
      console.log("City Champion form submitted:", formData);
      setFormSubmitted(true);
    } catch {
      setFormError("Something went wrong. Please try again or email us directly.");
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="add-city-wrapper">
      <Header />
      <main className="add-city-page">
        <div className="add-city-container">
          {/* Hero Section */}
          <section className="add-city-hero">
          <span className="badge">Add Your City</span>
          <h1 className="hero-title">Help Us Get Your City Right.</h1>
          <p className="hero-description">
            We're already tracking public data across 600+ cities. Now we need local
            partners to help make it useful.
          </p>
        </section>

        {/* City Staff Section */}
        <section className="add-city-card">
          <div className="add-city-card-header">
            <h2 className="add-city-card-title">City Staff</h2>
            <span className="audience-pill">For government</span>
          </div>
          <p className="add-city-card-tagline">
            A shared factual baseline for decisions and public communication.
          </p>
          <p className="add-city-card-body">
            You need clarity on what's changing, what's working, and how to
            communicate it to residents. Transparent City organizes the public data
            streams that matter most and presents them in formats you can actually
            use: briefings, trend analysis, and consistent measurement across topics.
          </p>
          <p className="add-city-card-body">
            We're already tracking your city. Let's make sure you're getting what you
            need from it.
          </p>
          <p className="add-city-card-body">
            <strong>Pro tools are free for anyone with a .gov email address.</strong>
          </p>
          <button
            onClick={handlePublicServantSignup}
            disabled={isLoading || isAuthenticated}
            className="btn btn-primary btn-large"
          >
            {isAuthenticated ? "Go to dashboard" : "Sign up with your .gov account"}
          </button>
        </section>

        {/* City Champions Section */}
        <section className="add-city-card">
          <div className="add-city-card-header">
            <h2 className="add-city-card-title">City Champions</h2>
            <span className="audience-pill resident-pill">For engaged residents</span>
          </div>
          <p className="add-city-card-tagline">
            Help your city get the transparency it deserves.
          </p>
          <p className="add-city-card-body">
            We've already built data connections for hundreds of cities, but we can't
            verify accuracy or spot gaps from the outside. City Champions are local
            volunteers who know what questions matter in their communities, what data
            sources we're missing, and whether what we're showing matches reality on
            the ground.
          </p>
          <p className="add-city-card-body">
            Champions also work with local media and civic groups to help them find
            and use the data they need for their own reporting and advocacy.
          </p>
          <p className="add-city-card-body">
            Your local knowledge helps city staff get better answers and helps your
            neighbors see what's really happening.
          </p>
          
          {!showForm && !formSubmitted && (
            <button
              onClick={() => setShowForm(true)}
              className="btn btn-primary btn-large"
            >
              Contact us to become a City Champion
            </button>
          )}

          {/* City Champion Form */}
          {showForm && !formSubmitted && (
            <div className="champion-form-container">
              <h3 className="champion-form-title">Become a City Champion</h3>
              <form onSubmit={handleFormSubmit} className="champion-form">
                <div className="form-group">
                  <label htmlFor="name">
                    Name <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    placeholder="Your name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">
                    Email <span className="required">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    placeholder="your@email.com"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Phone (optional)</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="city">
                    City <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    required
                    placeholder="e.g. San Francisco, CA"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="interests">
                    What are you interested in learning about your city?
                  </label>
                  <textarea
                    id="interests"
                    name="interests"
                    value={formData.interests}
                    onChange={handleInputChange}
                    rows={4}
                    placeholder="Tell us what topics or data you'd like to see..."
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="howCanHelp">How do you think you can help?</label>
                  <textarea
                    id="howCanHelp"
                    name="howCanHelp"
                    value={formData.howCanHelp}
                    onChange={handleInputChange}
                    rows={4}
                    placeholder="Your background, connections, or ideas..."
                  />
                </div>

                {formError && <div className="form-error">{formError}</div>}

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary btn-large">
                    Submit
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="btn btn-outline"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Form Success Message */}
          {formSubmitted && (
            <div className="form-success">
              <h3>Thank you for your interest!</h3>
              <p>
                We've received your submission and will be in touch soon at{" "}
                <a href="mailto:hello@transparentcity.com">hello@transparentcity.com</a>
              </p>
            </div>
          )}
        </section>

        {/* Back to home link */}
        <div className="add-city-back">
          <Link href="/" className="back-link">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M16 10H4M4 10L8 6M4 10L8 14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to home
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="add-city-footer">
        <div className="add-city-footer-container">
          <div className="add-city-footer-grid">
            <div>
              <div className="add-city-footer-brand">
                transparent<span className="brand-dot-city">.city</span>
              </div>
              <div className="add-city-footer-fine-print">
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
              <div className="add-city-footer-title">Start</div>
              <div className="add-city-footer-links">
                <Link href="/">Home</Link>
                <Link href="/pro">Add Your City</Link>
                <Link href="/sitemap">Site map</Link>
              </div>
            </div>
            <div>
              <div className="add-city-footer-title">Updates</div>
              <div className="add-city-footer-links">
                <a
                  href="https://www.transparentsf.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Newsletter
                </a>
                <a href="mailto:hello@transparentcity.com">Contact</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
    </div>
  );
}
