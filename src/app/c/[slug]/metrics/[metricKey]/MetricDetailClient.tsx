"use client";

import Link from "next/link";
import { useId, useEffect } from "react";
import type { PublicMetricDetail } from "@/lib/publicApiClient";
import MetricDetailContent from "@/components/MetricDetailContent";
import CitySignupButton from "../../CitySignupButton";
import { trackMetricView } from "@/lib/analytics";
import "@/app/landing.css";
import "@/components/MetricDetailModal.css";
import "./styles.css";

interface MetricDetailClientProps {
  metric: PublicMetricDetail;
  citySlug: string;
  district?: number | null;
}

export default function MetricDetailClient({
  metric,
  citySlug,
  district,
}: MetricDetailClientProps) {
  const baseId = useId();
  const logoMaskIdBl = `${baseId}-logo-mask-bl`;
  const logoMaskIdTr = `${baseId}-logo-mask-tr`;

  const cityName =
    metric.city_name ||
    citySlug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  // Track metric view
  useEffect(() => {
    trackMetricView(metric.metric_key, citySlug, district || undefined);
  }, [metric.metric_key, citySlug, district]);

  return (
    <div className="metric-detail-page">
      <nav className="metric-detail-nav">
        <div className="metric-detail-nav-inner">
          <Link href="/" className="metric-detail-nav-logo" aria-label="Transparent.city home">
            <div className="logo-corners">
              <svg
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                style={{ overflow: "visible" }}
              >
                <defs>
                  <mask
                    id={logoMaskIdBl}
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
                    <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
                    <rect x="16.666" y="-33.333" width="66.666" height="166.666" fill="black" transform="rotate(-45 50 50)" />
                    <rect x="50" y="-400" width="1200" height="1200" fill="black" transform="rotate(-45 50 50)" />
                  </mask>
                  <mask
                    id={logoMaskIdTr}
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
                    <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
                    <rect x="16.666" y="-33.333" width="66.666" height="166.666" fill="black" transform="rotate(-45 50 50)" />
                    <rect x="-1150" y="-400" width="1200" height="1200" fill="black" transform="rotate(-45 50 50)" />
                  </mask>
                </defs>
                <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask={`url(#${logoMaskIdBl})`} transform="translate(23.5%, -23.5%)" />
                <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask={`url(#${logoMaskIdTr})`} transform="translate(-23.5%, 23.5%)" />
              </svg>
            </div>
            <span className="logo-text">
              <span className="logo-transparent">transparent</span>
              <span className="logo-city">.city</span>
            </span>
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
        <MetricDetailContent
          metric={metric}
          cityName={cityName}
          district={district}
        />
      </div>

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
                Maps, metrics, and research built from public city data—so
                residents and elected officials can share the same picture of what's
                happening.
              </p>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">Resources</h4>
              <Link href={`/c/${citySlug}/methodology`} className="footer-link">
                Methodology
              </Link>
              <Link href="/sitemap" className="footer-link">
                Site Map
              </Link>
            </div>
          </div>
          <div className="footer-bottom">
            <p>
              &copy; 2026 Transparent.city. The difference between knowing and
              guessing is agency.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
