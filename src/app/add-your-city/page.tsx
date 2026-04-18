"use client";

import Link from "next/link";
import { useState } from "react";
import "../landing.css";
import Header from "@/components/Header";
import PublicFooter from "@/components/PublicFooter";

export default function AddYourCityPage() {
  const [activeTab, setActiveTab] = useState<"add" | "improve">("add");
  const [formData, setFormData] = useState({
    city: "",
    dataPortalUrl: "",
    name: "",
    email: "",
    title: "",
    hasDataExperience: false,
    isCityGovernment: false,
  });
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formData.city) {
      setFormError("Please enter a city name.");
      return;
    }

    if (activeTab === "improve" && !formData.email) {
      setFormError("Please enter your email so we can get in touch.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/city-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: activeTab,
          city: formData.city,
          dataPortalUrl: formData.dataPortalUrl,
          name: formData.name,
          email: formData.email,
          title: formData.title,
          hasDataExperience: formData.hasDataExperience,
          isCityGovernment: formData.isCityGovernment,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      setFormSubmitted(true);
    } catch {
      setFormError(
        "Something went wrong. Please try again or email us directly at seymour@transparent.city."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const resetForm = () => {
    setFormSubmitted(false);
    setFormError("");
    setFormData({
      city: "",
      dataPortalUrl: "",
      name: "",
      email: "",
      title: "",
      hasDataExperience: false,
      isCityGovernment: false,
    });
  };

  return (
    <div className="add-city-wrapper">
      <Header />
      <main id="main-content" className="add-city-page">
        <div className="add-city-container">
          {/* Hero Section */}
          <section className="add-city-hero">
            <span className="badge">Add Your City</span>
            <h1 className="hero-title">Help Us Get Your City Right.</h1>
            <p className="hero-description">
              We track public data across hundreds of cities, but we need local
              knowledge to make it accurate and useful.
            </p>
          </section>

          {/* How it works - visual steps */}
          <section className="add-city-steps">
            <div className="add-city-step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3 className="step-title">We find the data</h3>
                <p className="step-body">
                  We look for your city's open data portal and public datasets
                  covering topics like public safety, housing, budgets, and
                  permits.
                </p>
              </div>
            </div>
            <div className="add-city-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3 className="step-title">We organize and analyze it</h3>
                <p className="step-body">
                  We turn raw data into briefings, trend analysis, and
                  consistent measurement so residents and city leaders can
                  actually use it.
                </p>
              </div>
            </div>
            <div className="add-city-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3 className="step-title">You help us get it right</h3>
                <p className="step-body">
                  We can't verify accuracy from the outside. Whether you work in
                  city government or care about local data, your knowledge helps
                  us match reality on the ground.
                </p>
              </div>
            </div>
          </section>

          {/* Tab selector */}
          <section className="add-city-card add-city-form-card">
            <div className="city-tabs">
              <button
                className={`city-tab ${activeTab === "add" ? "city-tab-active" : ""}`}
                onClick={() => {
                  setActiveTab("add");
                  resetForm();
                }}
              >
                Add my city
              </button>
              <button
                className={`city-tab ${activeTab === "improve" ? "city-tab-active" : ""}`}
                onClick={() => {
                  setActiveTab("improve");
                  resetForm();
                }}
              >
                Improve my city's data
              </button>
            </div>

            {activeTab === "add" && (
              <div className="tab-content">
                <p className="add-city-card-body">
                  Don't see your city on Transparent City yet? Tell us which one
                  to add. If you know where the city publishes its open data,
                  include that and we'll get started faster.
                </p>

                {!formSubmitted ? (
                  <form onSubmit={handleFormSubmit} className="champion-form">
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="city">
                          City and state{" "}
                          <span className="required">*</span>
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
                        <label htmlFor="dataPortalUrl">
                          Open data portal URL
                        </label>
                        <input
                          type="url"
                          id="dataPortalUrl"
                          name="dataPortalUrl"
                          value={formData.dataPortalUrl}
                          onChange={handleInputChange}
                          placeholder="e.g. https://data.cityname.gov"
                        />
                      </div>
                    </div>

                    <div className="form-divider" />

                    <p className="form-section-label">
                      Optional: tell us about yourself so we can follow up
                    </p>

                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="name">Name</label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          placeholder="Your name"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          placeholder="your@email.com"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="title">Title</label>
                      <input
                        type="text"
                        id="title"
                        name="title"
                        value={formData.title}
                        onChange={handleInputChange}
                        placeholder="e.g. City Manager, Data Analyst"
                      />
                    </div>

                    <div className="form-checkbox-row">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="hasDataExperience"
                          checked={formData.hasDataExperience}
                          onChange={handleInputChange}
                        />
                        <span>I have experience working with data</span>
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="isCityGovernment"
                          checked={formData.isCityGovernment}
                          onChange={handleInputChange}
                        />
                        <span>I work for or with city government</span>
                      </label>
                    </div>

                    {formError && (
                      <div className="form-error">{formError}</div>
                    )}

                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary btn-large"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Submitting..." : "Submit"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="form-success">
                    <h3>Thank you for suggesting your city!</h3>
                    <p>
                      We'll look into it and follow up if you left your contact
                      info. You can also reach us anytime at{" "}
                      <a href="mailto:seymour@transparent.city">
                        seymour@transparent.city
                      </a>
                      .
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "improve" && (
              <div className="tab-content">
                <p className="add-city-card-body">
                  Already see your city but notice something off? We need people
                  who know the local landscape to help us audit what we're
                  tracking, flag inaccuracies, and suggest additional data
                  sources or topics worth covering.
                </p>
                <p className="add-city-card-body">
                  This is hands-on work: reviewing the data we present, telling
                  us where it doesn't match what's happening on the ground, and
                  pointing us toward datasets or stories we're missing.
                </p>

                {!formSubmitted ? (
                  <form onSubmit={handleFormSubmit} className="champion-form">
                    <div className="form-group">
                      <label htmlFor="city">
                        City and state{" "}
                        <span className="required">*</span>
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

                    <div className="form-divider" />

                    <p className="form-section-label">
                      Tell us about yourself so we can coordinate
                    </p>

                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="name">Name</label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
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
                          placeholder="your@email.com"
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="title">Title</label>
                      <input
                        type="text"
                        id="title"
                        name="title"
                        value={formData.title}
                        onChange={handleInputChange}
                        placeholder="e.g. City Manager, Data Analyst, Resident"
                      />
                    </div>

                    <div className="form-checkbox-row">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="hasDataExperience"
                          checked={formData.hasDataExperience}
                          onChange={handleInputChange}
                        />
                        <span>I have experience working with data</span>
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="isCityGovernment"
                          checked={formData.isCityGovernment}
                          onChange={handleInputChange}
                        />
                        <span>I work for or with city government</span>
                      </label>
                    </div>

                    {formError && (
                      <div className="form-error">{formError}</div>
                    )}

                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary btn-large"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Submitting..." : "Get in touch"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="form-success">
                    <h3>Thank you for volunteering!</h3>
                    <p>
                      We'll reach out to coordinate. You can also email us
                      directly at{" "}
                      <a href="mailto:seymour@transparent.city">
                        seymour@transparent.city
                      </a>
                      .
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Coming soon callout */}
          <section className="add-city-callout">
            <div className="callout-icon">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="callout-content">
              <h3 className="callout-title">Coming soon</h3>
              <p className="callout-body">
                Advanced features including deep research, customizable
                metrics, and the ability to chat directly with the data. If
                you work in city government and want early access, let us
                know.
              </p>
              <a
                href="mailto:seymour@transparent.city"
                className="callout-link"
              >
                Email us at seymour@transparent.city
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 8H13M13 8L9 4M13 8L9 12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>
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
        <PublicFooter />
      </main>
    </div>
  );
}
