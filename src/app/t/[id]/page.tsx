"use client";

import type { ReactNode } from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useSearchParams, useRouter, usePathname } from "next/navigation";
import TimeSeriesChart, { type PeriodType } from "@/components/TimeSeriesChart";
import Loader from "@/components/Loader";
import { API_BASE } from "@/lib/apiBase";
import "./styles.css";

interface TimeSeriesDataPoint {
  time_period: string;
  numeric_value: number;
  group_value?: string;
}

interface TimeSeriesMetadata {
  chart_id: number;
  object_name?: string;
  field_name?: string;
  y_axis_label?: string;
  period_type?: string;
  group_field?: string;
  district?: number;
  chart_title?: string;
  caption?: string;
  item_noun?: string;
  city_name?: string;
}

interface TimeSeriesResponse {
  metadata: TimeSeriesMetadata;
  data: TimeSeriesDataPoint[];
  count: number;
  sibling_chart_ids?: Record<string, number> | null;
}

function parsePeriodQuery(value: string | null): PeriodType | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === "day" || v === "week" || v === "month" || v === "year" || v === "ytd") {
    return v;
  }
  return null;
}

/** Prefer native stored series for the period; YTD uses daily series when listed. */
function resolveChartIdForPeriod(
  period: PeriodType,
  permalinkChartId: string,
  siblings: Record<string, number> | undefined | null
): string {
  if (period === "ytd") {
    const dayId = siblings?.["day"];
    if (dayId != null) return String(dayId);
    return permalinkChartId;
  }
  const sid = siblings?.[period];
  if (sid != null) return String(sid);
  return permalinkChartId;
}

function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return parseFloat(value.toString()).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, val) => acc + val, 0) / values.length;
}

function aggregateTimeSeries(data: TimeSeriesDataPoint[]): TimeSeriesDataPoint[] {
  const map = new Map<string, { sum: number; count: number }>();
  data.forEach((point) => {
    const key = `${point.time_period}|${point.group_value || ""}`;
    const existing = map.get(key) || { sum: 0, count: 0 };
    map.set(key, {
      sum: existing.sum + (point.numeric_value || 0),
      count: existing.count + 1,
    });
  });
  return Array.from(map.entries()).map(([key, { sum }]) => {
    const [time_period, group_value] = key.split("|");
    return { time_period, numeric_value: sum, group_value: group_value || undefined };
  });
}

export default function TimeSeriesChartPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const chartId = params.id as string;
  const periodParam = searchParams.get("period");
  const isEmbedded = searchParams.get("embedded") === "true";
  const forcedTheme =
    searchParams.get("theme") === "dark"
      ? "dark"
      : searchParams.get("theme") === "light"
        ? "light"
        : undefined;

  const [timeSeries, setTimeSeries] = useState<TimeSeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Period change: fetch in-place; do not use full-page loading. */
  const [chartRefreshing, setChartRefreshing] = useState(false);
  const [periodChangeError, setPeriodChangeError] = useState<string | null>(null);

  const fetchTimeSeries = useCallback(
    async (permalinkId: string, periodFromUrl: string | null) => {
      let response = await fetch(`${API_BASE}/api/time-series/public/${permalinkId}`);
      if (!response.ok) {
        response = await fetch(`${API_BASE}/api/time-series/${permalinkId}`, {
          credentials: "include",
        });
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch time series: ${response.status} ${response.statusText}`);
      }
      const firstData: TimeSeriesResponse = await response.json();
      const siblings = firstData.sibling_chart_ids || {};
      const metaPeriod = (
        firstData.metadata?.period_type || "month"
      ).toLowerCase() as PeriodType;
      const urlPeriod = parsePeriodQuery(periodFromUrl);
      const effectivePeriod = (urlPeriod ?? metaPeriod) as PeriodType;
      const effectiveId = resolveChartIdForPeriod(effectivePeriod, permalinkId, siblings);
      if (effectiveId !== permalinkId) {
        let r2 = await fetch(`${API_BASE}/api/time-series/public/${effectiveId}`);
        if (!r2.ok) {
          r2 = await fetch(`${API_BASE}/api/time-series/${effectiveId}`, {
            credentials: "include",
          });
        }
        if (!r2.ok) {
          throw new Error(`Failed to fetch time series: ${r2.status} ${r2.statusText}`);
        }
        return (await r2.json()) as TimeSeriesResponse;
      }
      return firstData;
    },
    []
  );

  // Only reload full page when the route chart id changes — not when ?period= changes.
  useEffect(() => {
    if (!chartId) {
      setError("No chart ID provided");
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setPeriodChangeError(null);

    (async () => {
      try {
        const periodFromUrl = searchParams.get("period");
        const data = await fetchTimeSeries(chartId, periodFromUrl);
        if (ac.signal.aborted) return;
        setTimeSeries(data);
      } catch (err: unknown) {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load time series data");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => {
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read searchParams inside only when chartId changes; including searchParams would re-run on every ?period= change and flash full-page loading
  }, [chartId, fetchTimeSeries]);

  const onPeriodChange = useCallback(
    async (p: PeriodType) => {
      if (!chartId) return;
      setChartRefreshing(true);
      setPeriodChangeError(null);
      try {
        const data = await fetchTimeSeries(chartId, p);
        setTimeSeries(data);
        const next = new URLSearchParams(searchParams.toString());
        next.set("period", p);
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      } catch (err: unknown) {
        setPeriodChangeError(
          err instanceof Error ? err.message : "Could not load data for this period."
        );
      } finally {
        setChartRefreshing(false);
      }
    },
    [chartId, fetchTimeSeries, pathname, router, searchParams]
  );

  const fullViewHref = useMemo(() => {
    const q = new URLSearchParams(searchParams.toString());
    q.delete("embedded");
    const s = q.toString();
    return `/t/${chartId}${s ? `?${s}` : ""}`;
  }, [chartId, searchParams]);

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
    if (timeSeries?.metadata) {
      const metricName =
        timeSeries.metadata.object_name ||
        timeSeries.metadata.field_name ||
        "Time Series";
      const cityName = timeSeries.metadata.city_name;
      let pageTitle = cityName ? `${cityName} — ${metricName}` : metricName;
      pageTitle += " | TransparentCity";
      document.title = pageTitle;
    } else {
      document.title = "Time Series Chart | TransparentCity";
    }
  }, [timeSeries]);

  const aggregated = useMemo(() => {
    if (!timeSeries?.data) return [];
    return aggregateTimeSeries(timeSeries.data);
  }, [timeSeries]);

  const allValues = useMemo(() => {
    return aggregated.map((d) => d.numeric_value);
  }, [aggregated]);

  const handleShare = async () => {
    const url = window.location.href;
    const title = timeSeries
      ? `${timeSeries.metadata.object_name || "Time Series"} | TransparentCity`
      : "Time Series Chart | TransparentCity";
    const text = timeSeries
      ? `Check out this time series: ${timeSeries.metadata.object_name || "Metric"}`
      : "Check out this time series chart";

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch { /* user cancelled */ }
    }
    navigator.clipboard.writeText(url);
  };

  if (loading) {
    return (
      <div className={`time-series-page loading ${isEmbedded ? "embedded" : ""}`}>
        <div className="tc-loading-state tc-loading-state--stacked">
          <Loader size="md" color="dark" />
          <span>Loading chart…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`time-series-page ${isEmbedded ? "embedded" : ""}`}>
        <div className="error-container">
          <h1>Time Series Not Available</h1>
          <p>{error}</p>
          {!isEmbedded && <p>This time series may not exist or the link may be incorrect.</p>}
        </div>
      </div>
    );
  }

  if (!timeSeries || aggregated.length === 0) {
    return (
      <div className={`time-series-page ${isEmbedded ? "embedded" : ""}`}>
        <div className="error-container">
          <h1>Time Series Not Found</h1>
          <p>No time series data available.</p>
        </div>
      </div>
    );
  }

  const metadata = timeSeries.metadata;
  const metricName = metadata.object_name || metadata.field_name || "Time Series Chart";

  const metaPeriod =
    (metadata.period_type?.toLowerCase() as PeriodType) || "month";
  const urlPeriod = parsePeriodQuery(periodParam);
  const displayPeriod = (urlPeriod ?? metaPeriod) as PeriodType;

  if (isEmbedded) {
    return (
      <div className="time-series-page embedded">
        <div className="embedded-header">
          <a href="/" className="embedded-brand">
            <BrandLogo size="small" />
            <span className="brand-text-small">
              <span className="brand-transparent">transparent</span>
              <span className="brand-city">.city</span>
            </span>
          </a>
          {metadata.city_name && (
            <span className="embedded-city-name">{metadata.city_name}</span>
          )}
          <a
            href={fullViewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="embedded-link"
          >
            Open full view ↗
          </a>
        </div>
        <div className="embedded-chart-wrapper">
          {periodChangeError && (
            <p className="time-series-period-error" role="alert" style={{ margin: "0 0 8px", fontSize: 14 }}>
              {periodChangeError}
            </p>
          )}
          <ChartRefreshOverlay refreshing={chartRefreshing}>
            <TimeSeriesChart
              key={`${metadata.chart_id}-${displayPeriod}`}
              data={aggregated}
              metadata={metadata}
              height={380}
              defaultPeriod={displayPeriod}
              fullBleed={true}
              hidePeriodSelector={false}
              showExternalTitle={false}
              forcedTheme={forcedTheme}
              onPeriodChange={onPeriodChange}
            />
          </ChartRefreshOverlay>
        </div>
      </div>
    );
  }

  // Full view mode
  const hasMultipleGroups = new Set(aggregated.map((d) => d.group_value).filter(Boolean)).size > 1;

  return (
    <div className="time-series-page">
      <header className="time-series-header">
        <a href="/" className="brand">
          <BrandLogo size="large" />
          <span className="brand-text">
            <span className="brand-transparent">transparent</span>
            <span className="brand-city">.city</span>
          </span>
        </a>
        {metadata.city_name && (
          <div className="header-city-name">{metadata.city_name}</div>
        )}
        <div className="header-right">
          <button
            onClick={handleShare}
            className="share-button-header"
            aria-label="Share this chart"
            title="Share this chart"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Share
          </button>
        </div>
      </header>

      <article className="time-series-article">
        <div className="time-series-info">
          <div className="time-series-title-section">
            <h1 className="time-series-title">{metricName}</h1>
            {(metadata.city_name || (hasMultipleGroups && metadata.group_field)) && (
              <div className="time-series-subtitle">
                {metadata.city_name && (
                  <>
                    <span className="time-series-city">{metadata.city_name}</span>
                    {metadata.district !== undefined && metadata.district !== 0 && (
                      <>
                        <span className="time-series-separator">&bull;</span>
                        <span className="time-series-district">District {metadata.district}</span>
                      </>
                    )}
                    {metadata.period_type && (
                      <>
                        <span className="time-series-separator">&bull;</span>
                        <span className="time-series-period">{metadata.period_type} period</span>
                      </>
                    )}
                  </>
                )}
                {hasMultipleGroups && metadata.group_field && (
                  <>
                    {metadata.city_name && <span className="time-series-separator">&bull;</span>}
                    <span className="time-series-group-field">by {metadata.group_field}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="chart-container">
          {periodChangeError && (
            <p className="time-series-period-error" role="alert" style={{ margin: "0 0 12px", fontSize: 14 }}>
              {periodChangeError}
            </p>
          )}
          <ChartRefreshOverlay refreshing={chartRefreshing}>
            <TimeSeriesChart
              key={`${metadata.chart_id}-${displayPeriod}`}
              data={aggregated}
              metadata={metadata}
              height={500}
              defaultPeriod={displayPeriod}
              fullBleed={true}
              hidePeriodSelector={false}
              showExternalTitle={true}
              forcedTheme={forcedTheme}
              onPeriodChange={onPeriodChange}
            />
          </ChartRefreshOverlay>
        </div>

        {metadata.caption && (
          <div className="time-series-caption">
            <p dangerouslySetInnerHTML={{ __html: metadata.caption }} />
          </div>
        )}

        {allValues.length > 0 && (
          <div className="time-series-stats">
            <h2 className="stats-title">Statistics</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Data Points</div>
                <div className="stat-value">{timeSeries.count}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Mean</div>
                <div className="stat-value">{formatValue(calculateMean(allValues))}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Min</div>
                <div className="stat-value">{formatValue(Math.min(...allValues))}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Max</div>
                <div className="stat-value">{formatValue(Math.max(...allValues))}</div>
              </div>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

function ChartRefreshOverlay({
  refreshing,
  children,
}: {
  refreshing: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ position: "relative" }}>
      {refreshing && (
        <div
          aria-busy="true"
          aria-live="polite"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.06)",
            borderRadius: 8,
          }}
        >
          <Loader size="md" color="dark" />
        </div>
      )}
      <div
        style={{
          opacity: refreshing ? 0.4 : 1,
          pointerEvents: refreshing ? "none" : "auto",
          transition: "opacity 0.15s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function BrandLogo({ size }: { size: "small" | "large" }) {
  const isSmall = size === "small";
  const blId = isSmall ? "logo-mask-bl-embed" : "logo-mask-bl";
  const trId = isSmall ? "logo-mask-tr-embed" : "logo-mask-tr";
  const cls = isSmall ? "logo-corners-small" : "logo-corners";

  return (
    <div className={cls}>
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ overflow: "visible" }}>
        <defs>
          <mask id={blId} x="-400" y="-400" width="1200" height="1200" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
            <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
            <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
            <rect x="16.666" y="-33.333" width="66.666" height="166.666" fill="black" transform="rotate(-45 50 50)" />
            <rect x="50" y="-400" width="1200" height="1200" fill="black" transform="rotate(-45 50 50)" />
          </mask>
          <mask id={trId} x="-400" y="-400" width="1200" height="1200" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
            <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
            <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
            <rect x="16.666" y="-33.333" width="66.666" height="166.666" fill="black" transform="rotate(-45 50 50)" />
            <rect x="-1150" y="-400" width="1200" height="1200" fill="black" transform="rotate(-45 50 50)" />
          </mask>
        </defs>
        <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask={`url(#${blId})`} fill="var(--text-primary)" transform={isSmall ? "translate(23.5%, -23.5%)" : "translate(23.5%, -23.5%)"} />
        <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask={`url(#${trId})`} fill="var(--text-primary)" transform={isSmall ? "translate(-23.5%, 23.5%)" : "translate(-23.5%, 23.5%)"} />
      </svg>
    </div>
  );
}
