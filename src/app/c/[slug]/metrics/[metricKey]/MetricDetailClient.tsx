"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { PublicMetricDetail, PublicMetricComparisons, PublicTimeSeriesSummary } from "@/lib/publicApiClient";
import MetricDetailContent from "@/components/MetricDetailContent";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import NavEmailSignup from "../../NavEmailSignup";
import CityHeroNewsletter from "../../CityHeroNewsletter";
import LoggedOutOnly from "../../LoggedOutOnly";
import { SignupEmailProvider } from "../../SignupEmailContext";
import { trackMetricView } from "@/lib/analytics";
import "@/app/landing.css";
import "@/components/MetricDetailModal.css";
import "./styles.css";

interface MetricDetailClientProps {
  metric: PublicMetricDetail;
  citySlug: string;
  district?: number | null;
  initialComparisons?: PublicMetricComparisons;
  initialTimeSeriesSummary?: PublicTimeSeriesSummary;
}

export default function MetricDetailClient({
  metric,
  citySlug,
  district,
  initialComparisons,
  initialTimeSeriesSummary,
}: MetricDetailClientProps) {
  const cityName =
    metric.city_name ||
    citySlug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  const year = new Date().getFullYear();

  // Track metric view
  useEffect(() => {
    trackMetricView(metric.metric_key, citySlug, district || undefined);
  }, [metric.metric_key, citySlug, district]);

  return (
    <SignupEmailProvider>
    <div className="metric-detail-page">
      <PublicNavBar>
        <NavEmailSignup citySlug={citySlug} cityName={cityName} />
      </PublicNavBar>
      <div className="metric-detail-content-wrapper">
        <nav className="metric-detail-breadcrumb" aria-label="Breadcrumb">
          <Link href={`/c/${citySlug}`} className="metric-detail-breadcrumb-link">
            {cityName}
          </Link>
          <span className="metric-detail-breadcrumb-sep">/</span>
          <Link href={`/c/${citySlug}/category/${encodeURIComponent(metric.category || "Metrics")}`} className="metric-detail-breadcrumb-link">
            {metric.category || "Metrics"}
          </Link>
        </nav>
        <h1 className="metric-detail-page-title">
          <span className="metric-detail-title-text">{metric.metric_name} in {year}</span>
          <a
            href="#about-this-data"
            className="metric-detail-about-link"
            aria-label="About this data"
            title="About this data"
          >
            ?
          </a>
        </h1>
        <MetricDetailContent
          metric={metric}
          cityName={cityName}
          citySlug={citySlug}
          district={district}
          initialComparisons={initialComparisons}
          initialTimeSeriesSummary={initialTimeSeriesSummary}
        />
      </div>

      <LoggedOutOnly>
        <section className="city-explainer-section">
          <div className="container">
            <div className="city-explainer-inner">
              <p className="city-explainer-text">
                {cityName}&rsquo;s public data, explained once a week.
                Crime trends, housing, city services, and 311 reports, sourced
                from {cityName}&rsquo;s open data portal with links to
                every number.
              </p>
              <div className="city-explainer-cta">
                <CityHeroNewsletter cityName={cityName} citySlug={citySlug} />
              </div>
            </div>
          </div>
        </section>
      </LoggedOutOnly>

      <PublicFooter
        citySlug={citySlug}
        feedbackPageUrl={`/c/${citySlug}/metrics/${metric.metric_key}`}
        feedbackPageType="metric-detail"
      />
    </div>
    </SignupEmailProvider>
  );
}
