"use client";

import Link from "next/link";
import "../../styles.css";
import "./chart-view.css";

export default function ChartNotFound() {
  return (
    <div className="chart-view-page">
      <nav className="metric-detail-nav">
        <div className="metric-detail-nav-inner">
          <Link href="/" className="metric-detail-nav-logo" aria-label="Transparent.city home">
            <span className="logo-text">
              <span className="logo-transparent">transparent</span>
              <span className="logo-city">.city</span>
            </span>
          </Link>
        </div>
      </nav>
      <main className="chart-view-main">
        <div className="chart-view-inner">
          <h1 className="chart-view-title">Chart not found</h1>
          <p className="chart-view-caption">
            This time series chart doesn’t exist or isn’t available. It may have been removed or the link might be incorrect.
          </p>
          <Link href="/" className="chart-view-back">
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
