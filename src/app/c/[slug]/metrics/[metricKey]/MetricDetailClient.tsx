"use client";

import Link from "next/link";
import type { PublicMetricDetail } from "@/lib/publicApiClient";
import MetricDetailContent from "@/components/MetricDetailContent";
import CitySignupButton from "../../CitySignupButton";
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
  const cityName =
    metric.city_name ||
    citySlug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

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
        <MetricDetailContent
          metric={metric}
          citySlug={citySlug}
          cityName={cityName}
          district={district}
        />
      </div>
    </div>
  );
}
