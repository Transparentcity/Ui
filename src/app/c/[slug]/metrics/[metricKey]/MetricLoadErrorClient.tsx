"use client";

import Link from "next/link";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import NavEmailSignup from "../../NavEmailSignup";
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
      <PublicNavBar>
        <NavEmailSignup citySlug={citySlug} cityName={cityName} />
      </PublicNavBar>
      <div className="metric-detail-content-wrapper">
        <div className="metric-load-error">
          <p className="metric-load-error-message">{message}</p>
          <Link href={`/c/${citySlug}`} className="metric-load-error-link">
            ← Back to {cityName}
          </Link>
        </div>
      </div>
      <PublicFooter citySlug={citySlug} />
    </div>
  );
}
