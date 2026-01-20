"use client";

import Link from "next/link";
import CitySignupButton from "../../CitySignupButton";
import "@/app/landing.css";
import "./styles.css";

interface MetricLoadErrorClientProps {
  citySlug: string;
  message: string;
}

function citySlugToName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function MetricLoadErrorClient({
  citySlug,
  message,
}: MetricLoadErrorClientProps) {
  const cityName = citySlugToName(citySlug);

  return (
    <div className="metric-detail-page">
      <nav className="metric-detail-nav">
        <div className="metric-detail-nav-inner">
          <Link href="/" className="metric-detail-nav-logo">
            <span className="logo-transparent">transparent</span>
            <span className="logo-city">.city</span>
          </Link>
          <div className="metric-detail-nav-links">
            <Link href={`/c/${citySlug}`} className="metric-detail-nav-back">
              ← Back to {cityName}
            </Link>
            <Link href="/" className="metric-detail-nav-link">
              Home
            </Link>
            <CitySignupButton />
          </div>
        </div>
      </nav>
      <div className="metric-detail-content-wrapper">
        <div className="metric-load-error">
          <p className="metric-load-error-message">{message}</p>
          <Link href={`/c/${citySlug}`} className="metric-load-error-link">
            ← Back to {cityName}
          </Link>
        </div>
      </div>
    </div>
  );
}
