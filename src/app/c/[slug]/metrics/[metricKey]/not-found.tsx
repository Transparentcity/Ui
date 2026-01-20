"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CitySignupButton from "../../CitySignupButton";
import "@/app/landing.css";
import "./styles.css";

function parseCitySlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/c\/([^/]+)\/metrics\//);
  return m ? m[1] : null;
}

function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function MetricNotFound() {
  const [citySlug, setCitySlug] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCitySlug(parseCitySlugFromPath(window.location.pathname));
    }
  }, []);

  const cityName = citySlug ? slugToName(citySlug) : "this city";
  const backHref = citySlug ? `/c/${citySlug}` : "/sitemap";

  return (
    <div className="metric-detail-page">
      <nav className="metric-detail-nav">
        <div className="metric-detail-nav-inner">
          <Link href="/" className="metric-detail-nav-logo">
            <span className="logo-transparent">transparent</span>
            <span className="logo-city">.city</span>
          </Link>
          <div className="metric-detail-nav-links">
            <Link href={backHref} className="metric-detail-nav-back">
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
          <h1 className="metric-load-error-title">Metric not found</h1>
          <p className="metric-load-error-message">
            This metric doesn’t exist or isn’t available. It may have been
            removed or the link might be incorrect.
          </p>
          <Link href={backHref} className="metric-load-error-link">
            ← Back to {cityName}
          </Link>
        </div>
      </div>
    </div>
  );
}
