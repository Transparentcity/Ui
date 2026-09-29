"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getPublicMetric, getPublicCityDetail, type PublicMetricDetail, type PublicCityDetail } from "@/lib/publicApiClient";
import { resolveMetricDatasetAttribution } from "@/lib/metricDatasetAttribution";
import { slugify } from "@/lib/utils";
import { parseLocalDate } from "@/lib/dateRange";
import Loader from "@/components/Loader";
import AnomalyInactiveBanner from "@/components/AnomalyInactiveBanner";
import AnomalySeriesChart from "@/components/AnomalySeriesChart";
import { loadAnomalyPageModel, type AnomalyPageModel } from "@/lib/anomalyPageData";
import { useTheme } from "@/contexts/ThemeContext";
import "./styles.css";

const AnomalyMap = dynamic(
  () => import("@/components/AnomalyMap"),
  { ssr: false }
);

/**
 * Format value for display
 */
function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return parseFloat(value.toString()).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Format percentage for display
 */
function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value)}%`;
}

/**
 * Calculate Z-score (sigma) from difference and std_dev
 */
function calculateZScore(difference: number, stdDev: number): number | null {
  if (!stdDev || stdDev === 0) return null;
  return Math.abs(difference) / stdDev;
}

export default function AnomalyChartPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const anomalyId = params.id as string;
  const isEmbedded = searchParams.get("embedded") === "true";
  const isThumbnail = searchParams.get("thumbnail") === "true";
  const forcedTheme =
    searchParams.get("theme") === "dark"
      ? "dark"
      : searchParams.get("theme") === "light"
        ? "light"
        : undefined;
  const effectiveTheme = forcedTheme ?? theme;

  const [anomaly, setAnomaly] = useState<AnomalyPageModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapData, setMapData] = useState<{
    location_data_count: number;
    period_start?: string | null;
    period_end?: string | null;
  } | null>(null);
  const [metricDetail, setMetricDetail] = useState<PublicMetricDetail | null>(null);
  const [cityDetail, setCityDetail] = useState<PublicCityDetail | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!forcedTheme || typeof document === "undefined") return;
    const root = document.documentElement;
    if (forcedTheme === "dark") {
      root.setAttribute("data-theme", "dark");
      root.classList.add("dark");
      return;
    }
    root.removeAttribute("data-theme");
    root.classList.remove("dark");
  }, [forcedTheme]);

  useEffect(() => {
    if (!anomalyId) {
      setError("No anomaly ID provided");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    loadAnomalyPageModel(anomalyId)
      .then((model) => {
        if (!cancelled) setAnomaly(model);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load anomaly data";
        console.warn("Error fetching anomaly:", err);
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [anomalyId]);

  useEffect(() => {
    if (!anomaly?.metricId) {
      setMetricDetail(null);
      return;
    }
    getPublicMetric(anomaly.metricId)
      .then(setMetricDetail)
      .catch((err) => {
        console.warn("Failed to load metric details:", err);
        setMetricDetail(null);
      });
  }, [anomaly?.metricId]);

  useEffect(() => {
    if (!metricDetail?.city_id) {
      setCityDetail(null);
      return;
    }
    getPublicCityDetail(metricDetail.city_id)
      .then(setCityDetail)
      .catch((err) => {
        console.warn("Failed to load city details:", err);
        setCityDetail(null);
      });
  }, [metricDetail?.city_id]);

  const mapDateStart = anomaly?.calculationStartDate ?? null;
  const mapDateEnd = anomaly?.calculationEndDate ?? null;

  const calculationDateRangeLabel =
    mapDateStart && mapDateEnd
      ? (() => {
          const start = parseLocalDate(mapDateStart);
          const end = parseLocalDate(mapDateEnd);
          const startStr = start.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          const endStr = end.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return `${startStr} – ${endStr}`;
        })()
      : null;

  const recentDateDisplay = mapDateStart
    ? (() => {
        const date = parseLocalDate(mapDateStart);
        const periodType = anomaly?.periodType || "month";
        if (periodType === "year") {
          return date.toLocaleDateString("en-US", { year: "numeric" });
        }
        if (periodType === "month") {
          return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        }
        if (periodType === "week" && mapDateEnd) {
          const end = parseLocalDate(mapDateEnd);
          const monStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const sunStr = end.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return `${monStr} – ${sunStr}`;
        }
        return date.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      })()
    : null;

  const zScore = anomaly
    ? calculateZScore(anomaly.difference, anomaly.stdDev)
    : null;

    // Share functionality
  const handleShare = async () => {
    const url = window.location.href;
    const title = anomaly
      ? `${anomaly.metricName || "Anomaly"} | TransparentCity`
      : "Anomaly Chart | TransparentCity";
    const text = anomaly
      ? `Check out this anomaly: ${anomaly.metricName || "Metric"}`
      : "Check out this anomaly chart";

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // User cancelled or error - fall through to fallback
      }
    }

    // Fallback: copy to clipboard
    navigator.clipboard.writeText(url);
  };

  if (loading) {
    return (
      <div className={`anomaly-page loading ${isEmbedded || isThumbnail ? "embedded" : ""} ${isThumbnail ? "thumbnail" : ""}`}>
        <div className="tc-loading-state tc-loading-state--stacked">
          <Loader size="md" color="dark" />
          {!isThumbnail && <span>Loading anomaly chart…</span>}
        </div>
      </div>
    );
  }

  if (error || !anomaly) {
    if (isThumbnail) return <div className="anomaly-page embedded thumbnail" />;
    if (isEmbedded) {
      return (
        <div className="anomaly-page embedded">
          <div className="error-container embedded-error">
            <p>This chart is no longer available.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="anomaly-page">
        <div className="error-container">
          <h1>Anomaly Not Found</h1>
          <p>This anomaly may have been updated or removed since the link was created.</p>
          <p style={{ marginTop: "1.5rem" }}>
            <Link href="/" style={{ color: "var(--accent-primary)", textDecoration: "underline" }}>
              Back to Transparent.city
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const showInactiveBanner = anomaly.runIsActive === false;

  // Thumbnail mode — chart only, no chrome, for feed card previews
  if (isThumbnail) {
    return (
      <div className="anomaly-page embedded thumbnail">
        {showInactiveBanner && <AnomalyInactiveBanner compact />}
        <div className="chart-container embedded-chart" ref={chartContainerRef}>
          <AnomalySeriesChart
            model={anomaly}
            height={220}
            thumbnail
            forcedTheme={forcedTheme}
            parentProvidesTitle={false}
          />
        </div>
      </div>
    );
  }

  // Embedded mode - minimal UI
  if (isEmbedded) {
    return (
      <div className="anomaly-page embedded">
        <div className="embedded-header">
          <Link href="/" className="embedded-brand">
            <div className="logo-corners-small">
              <svg
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                style={{ overflow: "visible" }}
              >
                <defs>
                  <mask
                    id="logo-mask-bl-embed"
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
                    <rect
                      x="8.333"
                      y="8.333"
                      width="83.333"
                      height="83.333"
                      rx="3"
                      ry="3"
                      fill="black"
                    />
                    <rect
                      x="16.666"
                      y="-33.333"
                      width="66.666"
                      height="166.666"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                    <rect
                      x="50"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                  </mask>
                  <mask
                    id="logo-mask-tr-embed"
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
                    <rect
                      x="8.333"
                      y="8.333"
                      width="83.333"
                      height="83.333"
                      rx="3"
                      ry="3"
                      fill="black"
                    />
                    <rect
                      x="16.666"
                      y="-33.333"
                      width="66.666"
                      height="166.666"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                    <rect
                      x="-1150"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                  </mask>
                </defs>
                <rect
                  className="brace"
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask="url(#logo-mask-bl-embed)"
                  fill="var(--text-primary)"
                />
                <rect
                  className="brace"
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask="url(#logo-mask-tr-embed)"
                  fill="var(--text-primary)"
                />
              </svg>
            </div>
            <span className="brand-text-small">
              <span className="brand-transparent">transparent</span>
              <span className="brand-city">.city</span>
            </span>
          </Link>
          <a
            href={`/a/${anomalyId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="embedded-link"
          >
            Open full view ↗
          </a>
        </div>
        {showInactiveBanner && <AnomalyInactiveBanner compact />}
        <div className="chart-container embedded-chart" ref={chartContainerRef}>
          <AnomalySeriesChart
            model={anomaly}
            height={320}
            embedded
            forcedTheme={forcedTheme}
            parentProvidesTitle={false}
          />
        </div>
      </div>
    );
  }

  // Full view mode - compute display values
  const metricName = anomaly.metricName || "this metric";
  const itemNoun = (anomaly.itemNoun || "items").toLowerCase();
  const cityName = anomaly.cityName;
  const groupValue = anomaly.groupValue;
  const locationLabel =
    anomaly.placeType && anomaly.placeType !== "citywide" && anomaly.placeKey
      ? `${anomaly.placeType} ${anomaly.placeKey}`
      : anomaly.district === 0
        ? "citywide"
        : `District ${anomaly.district}`;
  const pctChange = Math.abs(anomaly.percentChange);
  const isIncrease = anomaly.percentChange > 0;
  const changeType = isIncrease ? "spike" : "drop";

  // Format date for map caption
  const formatMapDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "";
    const date = parseLocalDate(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="anomaly-page">
      {/* Header */}
      <header className="anomaly-header">
        <Link href="/" className="brand">
          <div className="logo-corners">
            <svg
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              style={{ overflow: "visible" }}
            >
              <defs>
                <mask
                  id="logo-mask-bl"
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
                  id="logo-mask-tr"
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
              <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask="url(#logo-mask-bl)" fill="var(--text-primary)" />
              <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask="url(#logo-mask-tr)" fill="var(--text-primary)" />
            </svg>
          </div>
          <span className="brand-text">
            <span className="brand-transparent">transparent</span>
            <span className="brand-city">.city</span>
          </span>
        </Link>
        <div className="header-right">
          <button
            onClick={handleShare}
            className="share-button-header"
            aria-label="Share this chart"
            title="Share this chart"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
            Share
          </button>
        </div>
      </header>

      <article className="anomaly-article">
        {showInactiveBanner && (
          <AnomalyInactiveBanner className="anomaly-inactive-banner-full" />
        )}

        {/* Hero Section - Anomaly Announcement */}
        <div className="anomaly-hero">
          <div className="anomaly-badge">
            <span className="badge-icon">⚠️</span>
            <span className="badge-text">Data Anomaly Detected</span>
          </div>
          <h1 className="anomaly-headline">
            A {Math.round(pctChange)}% {changeType} in <span className="metric-highlight">{metricName}</span>
            {groupValue && (
              <> for <span className="group-highlight">{groupValue}</span></>
            )}
          </h1>
          <p className="anomaly-subheadline">
            {cityName ? `${cityName}, ` : ""}{locationLabel}
            {recentDateDisplay && ` • ${recentDateDisplay}`}
          </p>
          {calculationDateRangeLabel && (
            <p className="anomaly-calculation-range" aria-label="Date range for which this anomaly was calculated">
              Calculated for the period: {calculationDateRangeLabel}
            </p>
          )}
        </div>

        {/* Section: Time Series Chart */}
        <section className="anomaly-section">
          <h2 className="section-header">How does this compare to historical data?</h2>
          
          <div className="chart-container" ref={chartContainerRef}>
            <AnomalySeriesChart
              model={anomaly}
              height={400}
              forcedTheme={forcedTheme}
            />
          </div>

          {/* Chart caption */}
          <div className="section-caption">
            {(() => {
              const recentValue = formatValue(anomaly.recentMean);
              const comparisonValue = formatValue(anomaly.comparisonMean);
              const changeDirection = isIncrease ? "above" : "below";
              const comparisonWindowSize = anomaly.comparisonSize || 12;
              const comparisonWindowLabel = `previous ${comparisonWindowSize} ${anomaly.periodType}${comparisonWindowSize > 1 ? "s" : ""}`;
              
              return (
                <p>
                  The recent value of <strong>{recentValue} {itemNoun}</strong> is {Math.round(pctChange)}% {changeDirection} the 
                  historical average of <strong>{comparisonValue} {itemNoun}</strong> (based on the {comparisonWindowLabel}).
                  The shaded area represents the normal range (±2 standard deviations).
                  {zScore !== null && zScore >= 2 && (
                    <> This data point is <strong>{zScore.toFixed(1)}σ</strong> from the mean, indicating a statistically significant anomaly.</>
                  )}
                </p>
              );
            })()}
          </div>
        </section>

        {/* Section: Location Map - uses same date range as "Calculated for the period" */}
        {anomaly.metricId && mapDateStart && mapDateEnd && (
          <section className="anomaly-section">
            <h2 className="section-header">Where did these {itemNoun} happen?</h2>
            
            <AnomalyMap
              metricId={anomaly.metricId}
              startDate={mapDateStart}
              endDate={mapDateEnd}
              district={anomaly.district}
              groupField={anomaly.groupField ?? undefined}
              groupValue={anomaly.groupValue ?? undefined}
              height={350}
              hideHeader={true}
              basemapTheme={effectiveTheme === "dark" ? "dark" : "light"}
              onLoad={(data) => setMapData({
                location_data_count: data.location_data_count,
                period_start: data.period_start,
                period_end: data.period_end,
              })}
            />

            {/* Map caption: same period as anomaly; note when filtered by group */}
            {mapData && mapData.location_data_count > 0 && (
              <div className="section-caption">
                <p>
                  This map shows <strong>{mapData.location_data_count.toLocaleString()} {itemNoun}</strong>
                  {calculationDateRangeLabel
                    ? ` for the same period as above (${calculationDateRangeLabel}).`
                    : mapData.period_start && mapData.period_end
                      ? ` between ${formatMapDate(mapData.period_start)} and ${formatMapDate(mapData.period_end)}.`
                      : "."}
                  {anomaly.groupValue && (
                    <> Filtered to <strong>{anomaly.groupValue}</strong> (same as the anomaly above).</>
                  )}
                  {anomaly.district !== 0 && !anomaly.groupValue && ` In District ${anomaly.district}.`}
                  {" "}Each dot represents one {itemNoun.endsWith("s") ? itemNoun.slice(0, -1) : itemNoun}.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Section: Anomaly Details */}
        <section className="anomaly-section">
          <h2 className="section-header">What are the numbers?</h2>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Recent Value</div>
              <div className="stat-value">{formatValue(anomaly.recentMean)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Historical Average</div>
              <div className="stat-value">{formatValue(anomaly.comparisonMean)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Difference</div>
              <div className={`stat-value ${anomaly.difference > 0 ? "positive" : "negative"}`}>
                {anomaly.difference > 0 ? "+" : ""}{formatValue(anomaly.difference)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Percent Change</div>
              <div className={`stat-value ${anomaly.percentChange > 0 ? "positive" : "negative"}`}>
                {formatPercent(anomaly.percentChange)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Standard Deviation</div>
              <div className="stat-value">{formatValue(anomaly.stdDev)}</div>
            </div>
            {zScore !== null && (
              <div className="stat-card">
                <div className="stat-label">Z-Score</div>
                <div className="stat-value">{zScore.toFixed(2)}σ</div>
              </div>
            )}
          </div>
        </section>

        {/* Section: About This Data */}
        {metricDetail && (
          <section className="anomaly-section about-data-section">
            <h2 className="section-header">About this data</h2>
            
            <div className="about-data-content">
              {metricDetail.definition && (
                <p className="data-definition">{metricDetail.definition}</p>
              )}
              
              <p className="data-source">
                This data comes from{" "}
                {(() => {
                  const portalUrl = cityDetail?.main_portal_url || null;
                  const portalDomain = cityDetail?.main_domain || (portalUrl ? (() => {
                    try {
                      return new URL(portalUrl).hostname.replace(/^www\./, "");
                    } catch {
                      return portalUrl;
                    }
                  })() : null);
                  const { datasetName, datasetUrl } = resolveMetricDatasetAttribution(
                    metricDetail,
                    { portalUrl, portalDomain }
                  );
                  const resolvedCityName = cityDetail?.name || metricDetail.city_name || cityName;

                  if (!datasetName) {
                    return (
                      <>
                        a public dataset maintained by {resolvedCityName || "the city"}
                        {portalUrl ? (
                          <>
                            {" on "}
                            <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="data-link">
                              {portalDomain || "the city's open data portal"}
                            </a>
                          </>
                        ) : (
                          " on the city's open data portal"
                        )}
                        .
                      </>
                    );
                  }

                  return (
                    <>
                      {datasetUrl ? (
                        <a href={datasetUrl} target="_blank" rel="noopener noreferrer" className="data-link">
                          {datasetName}
                        </a>
                      ) : (
                        <strong>{datasetName}</strong>
                      )}
                      {resolvedCityName && (
                        <>
                          , a public dataset maintained by {resolvedCityName}
                          {portalUrl ? (
                            <>
                              {" on "}
                              <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="data-link">
                                {portalDomain || "the city's open data portal"}
                              </a>
                            </>
                          ) : (
                            " on the city's open data portal"
                          )}
                        </>
                      )}
                      .
                    </>
                  );
                })()}
              </p>
              
              {anomaly.metricId && cityDetail?.name && (
                <Link href={`/c/${slugify(cityDetail.name)}/metrics/${metricDetail.metric_key}`} className="view-metric-link">
                  View full metric details →
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Logged Out Footer */}
        <footer className="anomaly-footer">
          <div className="footer-content">
            <p className="footer-text">
              This anomaly was detected by <strong>transparent.city</strong>, a civic data transparency platform
              that monitors public datasets for unusual patterns.
            </p>
            <div className="footer-links">
              <Link href="/" className="footer-link">
                Explore more data →
              </Link>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}

