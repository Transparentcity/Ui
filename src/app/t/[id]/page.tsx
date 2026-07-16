"use client";

import type { ReactNode } from "react";
import { Suspense, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter, usePathname } from "next/navigation";
import TimeSeriesChart, { type PeriodType } from "@/components/TimeSeriesChart";
import Loader from "@/components/Loader";
import CompletenessSparkline from "@/components/CompletenessSparkline";
import { API_BASE, API_BASE_FOR_ASSETS } from "@/lib/apiBase";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getMyPermissions,
  patchTimeSeriesSeoPreviewImage,
} from "@/lib/apiClient";
import {
  getPublicMetricCompletenessDaily,
  getPublicMetric,
  getPublicCityDetail,
  type DailyCompletenessResponse,
} from "@/lib/publicApiClient";
import { computeReportingCompletenessStalenessDays } from "@/lib/computeReportingCompletenessStalenessDays";
import "./styles.css";

interface TimeSeriesDataPoint {
  time_period: string;
  numeric_value: number;
  group_value?: string;
}

interface TimeSeriesMetadata {
  chart_id: number;
  object_id?: string | number;
  object_type?: string;
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
  /** Flattened from JSONB metadata (Open Graph / SEO). */
  seo_og_image_url?: string;
}

interface TimeSeriesResponse {
  metadata: TimeSeriesMetadata;
  data: TimeSeriesDataPoint[];
  count: number;
  sibling_chart_ids?: Record<string, number> | null;
}

const ADMIN_PNG_PERIODS: PeriodType[] = ["day", "week", "month", "year", "ytd"];

function assetUrlForPath(path: string): string {
  const base = API_BASE_FOR_ASSETS.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
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

function TimeSeriesChartPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const chartId = params.id as string;
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const periodParam = searchParams.get("period");
  const isEmbedded = searchParams.get("embedded") === "true";
  const isThumbnail = searchParams.get("thumbnail") === "true";
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
  /**
   * After a successful load, `${chartId}:${periodParam ?? ""}` — skips duplicate effect runs
   * when `onPeriodChange` already fetched and then updated the URL.
   */
  const lastLoadedKeyRef = useRef<string | null>(null);

  const [completenessDaily, setCompletenessDaily] =
    useState<DailyCompletenessResponse | null>(null);
  const [completenessLoading, setCompletenessLoading] = useState(false);
  const [resolvedCityName, setResolvedCityName] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [canonicalSeoPath, setCanonicalSeoPath] = useState<string | null>(null);
  const [adminSeoMessage, setAdminSeoMessage] = useState<string | null>(null);
  const [adminSeoSaving, setAdminSeoSaving] = useState(false);

  const effectiveDisplayPeriod = useMemo((): PeriodType | null => {
    if (!timeSeries?.metadata) return null;
    const metaPeriod = (
      timeSeries.metadata.period_type?.toLowerCase() as PeriodType
    ) || "month";
    const urlPeriod = parsePeriodQuery(periodParam);
    return (urlPeriod ?? metaPeriod) as PeriodType;
  }, [timeSeries, periodParam]);

  const metricIdForCompleteness = useMemo(() => {
    const oid = timeSeries?.metadata?.object_id;
    if (oid == null || oid === "") return null;
    const n = typeof oid === "number" ? oid : parseInt(String(oid), 10);
    return Number.isFinite(n) ? n : null;
  }, [timeSeries?.metadata?.object_id]);

  const objectTypeForCompleteness = timeSeries?.metadata?.object_type;

  const districtForCompleteness = useMemo(() => {
    const d = timeSeries?.metadata?.district;
    return d != null && d > 0 ? d : null;
  }, [timeSeries?.metadata?.district]);

  const shouldFetchCompleteness = useMemo(() => {
    if (metricIdForCompleteness == null) return false;
    const ot = (objectTypeForCompleteness || "").toLowerCase();
    if (ot && ot !== "dashboard_metric" && ot !== "metric") return false;
    return true;
  }, [metricIdForCompleteness, objectTypeForCompleteness]);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setIsAdmin(false);
    } else {
      (async () => {
        try {
          const token = await getAccessTokenSilently();
          const p = await getMyPermissions(token);
          if (!cancelled) setIsAdmin(!!p.is_admin);
        } catch {
          if (!cancelled) setIsAdmin(false);
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessTokenSilently]);

  useEffect(() => {
    if (!isAdmin || !chartId) {
      setCanonicalSeoPath(null);
      return;
    }
    let cancelled = false;
    const url = `${API_BASE}/api/time-series/public/${chartId}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { metadata?: { seo_og_image_url?: string } } | null) => {
        if (cancelled || !body?.metadata) return;
        const v = body.metadata.seo_og_image_url;
        setCanonicalSeoPath(typeof v === "string" && v.trim() ? v.trim() : null);
      })
      .catch(() => {
        if (!cancelled) setCanonicalSeoPath(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, chartId]);

  useEffect(() => {
    if (!shouldFetchCompleteness || metricIdForCompleteness == null) {
      setCompletenessDaily(null);
      setCompletenessLoading(false);
      return;
    }
    let cancelled = false;
    setCompletenessLoading(true);
    getPublicMetricCompletenessDaily(
      metricIdForCompleteness,
      "day",
      90,
      districtForCompleteness
    )
      .then((res) => {
        if (!cancelled) setCompletenessDaily(res);
      })
      .catch(() => {
        if (!cancelled) setCompletenessDaily(null);
      })
      .finally(() => {
        if (!cancelled) setCompletenessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    shouldFetchCompleteness,
    metricIdForCompleteness,
    districtForCompleteness,
    chartId,
    periodParam,
  ]);

  useEffect(() => {
    const meta = timeSeries?.metadata;
    if (!meta) {
      setResolvedCityName(null);
      return;
    }
    if (meta.city_name && meta.city_name.trim()) {
      setResolvedCityName(null);
      return;
    }
    const ot = (meta.object_type || "").toLowerCase();
    if (ot !== "dashboard_metric" && ot !== "metric") return;
    const oid = meta.object_id;
    const metricId =
      typeof oid === "number" ? oid : oid != null ? parseInt(String(oid), 10) : NaN;
    if (!Number.isFinite(metricId)) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await getPublicMetric(metricId);
        const cityId = m.city_id;
        if (cityId == null) return;
        const city = await getPublicCityDetail(cityId, { includeMetrics: false });
        if (!cancelled && city?.name) setResolvedCityName(city.name);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeSeries]);

  const displayCityName = timeSeries?.metadata?.city_name || resolvedCityName || null;

  // Applies to every period view: YTD splits the current-year line at the lag
  // cutoff; day/week/month/year views draw trailing buckets that overlap the
  // lag window (or are still in progress) as a dotted "incomplete" tail.
  const staleness_days = useMemo(() => {
    return computeReportingCompletenessStalenessDays(completenessDaily);
  }, [completenessDaily]);

  const permalinkNumeric = useMemo(() => parseInt(chartId, 10), [chartId]);

  const adminSeoPngRows = useMemo(() => {
    if (!isAdmin || !chartId || !timeSeries?.metadata) return [];
    const siblings = timeSeries.sibling_chart_ids || {};
    const seen = new Set<string>();
    const rows: { label: string; path: string }[] = [];
    const sizes: [number, number][] = [
      [1200, 630],
      [800, 400],
    ];
    for (const [w, h] of sizes) {
      for (const p of ADMIN_PNG_PERIODS) {
        const cid = resolveChartIdForPeriod(p, chartId, siblings);
        const path = `/api/time-series/public/${cid}/image?period=${p}&width=${w}&height=${h}`;
        if (seen.has(path)) continue;
        seen.add(path);
        rows.push({ label: `${p} ${w}×${h} (series ${cid})`, path });
      }
    }
    return rows;
  }, [isAdmin, chartId, timeSeries]);

  const applyCanonicalSeo = useCallback(
    async (path: string | null) => {
      if (!Number.isFinite(permalinkNumeric)) return;
      setAdminSeoMessage(null);
      setAdminSeoSaving(true);
      try {
        const token = await getAccessTokenSilently();
        const res = await patchTimeSeriesSeoPreviewImage(
          permalinkNumeric,
          { seo_og_image_url: path },
          token
        );
        const v = (res.metadata as unknown as TimeSeriesMetadata | undefined)
          ?.seo_og_image_url;
        setCanonicalSeoPath(typeof v === "string" && v.trim() ? v.trim() : null);
        setAdminSeoMessage(
          path == null
            ? "Cleared SEO preview image."
            : "Saved. Link previews may take a few minutes to update."
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Save failed";
        setAdminSeoMessage(msg);
      } finally {
        setAdminSeoSaving(false);
      }
    },
    [getAccessTokenSilently, permalinkNumeric]
  );

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

  // Refetch when chart id or ?period= changes. `periodParam` was previously omitted from deps, so
  // `?period=ytd` after searchParams hydration (or client navigations) never loaded the day sibling.
  useEffect(() => {
    if (!chartId) {
      setError("No chart ID provided");
      setLoading(false);
      return;
    }

    const loadKey = `${chartId}:${periodParam ?? ""}`;
    if (lastLoadedKeyRef.current === loadKey) {
      return;
    }

    const prevEntry = lastLoadedKeyRef.current;
    const prevChartId = prevEntry?.split(":")[0] ?? null;
    const switchedChart = prevChartId !== null && prevChartId !== chartId;
    const firstLoad = prevEntry === null;
    const useFullPageLoader = firstLoad || switchedChart || isThumbnail;

    const ac = new AbortController();
    if (useFullPageLoader) {
      setLoading(true);
    } else {
      setChartRefreshing(true);
    }
    setError(null);
    setPeriodChangeError(null);

    (async () => {
      try {
        const data = await fetchTimeSeries(chartId, periodParam);
        if (ac.signal.aborted) return;
        setTimeSeries(data);
        lastLoadedKeyRef.current = loadKey;
      } catch (err: unknown) {
        if (ac.signal.aborted) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load time series data";
        if (useFullPageLoader) {
          setError(msg);
        } else {
          setPeriodChangeError(
            msg === "Failed to load time series data"
              ? "Could not load data for this period."
              : msg
          );
        }
      } finally {
        if (ac.signal.aborted) return;
        setLoading(false);
        setChartRefreshing(false);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [chartId, periodParam, fetchTimeSeries, isThumbnail]);

  /**
   * Fetch first so we never paint the new period with stale series data; then sync the URL.
   * The load effect dedupes via `lastLoadedKeyRef` when `periodParam` catches up.
   */
  const onPeriodChange = useCallback(
    async (p: PeriodType) => {
      if (!chartId) return;
      setPeriodChangeError(null);
      setChartRefreshing(true);
      try {
        const data = await fetchTimeSeries(chartId, p);
        setTimeSeries(data);
        lastLoadedKeyRef.current = `${chartId}:${p}`;
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
      const cityName = timeSeries.metadata.city_name || resolvedCityName;
      let pageTitle = cityName ? `${metricName} in ${cityName}` : metricName;
      pageTitle += " | TransparentCity";
      document.title = pageTitle;
    } else {
      document.title = "Time Series Chart | TransparentCity";
    }
  }, [timeSeries, resolvedCityName]);

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
      <div className={`time-series-page loading ${isEmbedded || isThumbnail ? "embedded" : ""} ${isThumbnail ? "thumbnail" : ""}`}>
        <div className="tc-loading-state tc-loading-state--stacked">
          <Loader size="md" color="dark" />
          {!isThumbnail && <span>Loading chart…</span>}
        </div>
      </div>
    );
  }

  if (error) {
    if (isThumbnail) return <div className="time-series-page embedded thumbnail" />;
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

  if (isThumbnail) {
    return (
      <div className="time-series-page embedded thumbnail">
        <TimeSeriesChart
          key={`${metadata.chart_id}-${displayPeriod}`}
          data={aggregated}
          metadata={metadata}
          height={260}
          defaultPeriod={displayPeriod}
          fullBleed={true}
          hidePeriodSelector={true}
          showExternalTitle={false}
          forcedTheme={forcedTheme}
          staleness_days={staleness_days}
        />
        {displayPeriod === "ytd" &&
        staleness_days != null &&
        staleness_days > 0 ? (
          <p className="time-series-ytd-staleness-compact">
            Dotted segment: the latest {staleness_days} day
            {staleness_days !== 1 ? "s" : ""} may still be updating (incomplete data).
          </p>
        ) : null}
      </div>
    );
  }

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
          {displayCityName && (
            <span className="embedded-city-name">{displayCityName}</span>
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
              height={400}
              defaultPeriod={displayPeriod}
              fullBleed={true}
              hidePeriodSelector={false}
              showExternalTitle={false}
              forcedTheme={forcedTheme}
              staleness_days={staleness_days}
              embeddedMode={true}
              onPeriodChange={onPeriodChange}
            />
          </ChartRefreshOverlay>
          {displayPeriod === "ytd" &&
          staleness_days != null &&
          staleness_days > 0 ? (
            <p className="time-series-ytd-staleness-embed">
              Dotted segment: the latest {staleness_days} day
              {staleness_days !== 1 ? "s" : ""} may still be updating (incomplete data).
            </p>
          ) : null}
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
        {displayCityName && (
          <div className="header-city-name">{displayCityName}</div>
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
            {(displayCityName || (hasMultipleGroups && metadata.group_field)) && (
              <div className="time-series-subtitle">
                {displayCityName && (
                  <>
                    <span className="time-series-city">{displayCityName}</span>
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
                    {displayCityName && <span className="time-series-separator">&bull;</span>}
                    <span className="time-series-group-field">by {metadata.group_field}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {displayPeriod === "ytd" &&
        staleness_days != null &&
        staleness_days > 0 ? (
          <div className="time-series-staleness-badge">
            <span className="time-series-staleness-icon">⏱</span>
            ~{staleness_days} day{staleness_days !== 1 ? "s" : ""} to fully report — the most recent{" "}
            {staleness_days} day{staleness_days !== 1 ? "s" : ""} may still be updating, shown as a{" "}
            <span className="time-series-staleness-incomplete-label">dotted line</span> on the current-year series
            (legend: Incomplete data).
          </div>
        ) : null}

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
              staleness_days={staleness_days}
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

        {(completenessLoading ||
          (completenessDaily != null && completenessDaily.data.length > 0)) && (
          <div id="reporting-completeness" className="time-series-completeness-section">
            {completenessLoading ? (
              <div className="time-series-completeness-loading">
                <h3 className="time-series-provenance-label">Reporting completeness</h3>
                <Loader size="sm" color="dark" />
              </div>
            ) : completenessDaily != null && completenessDaily.data.length > 0 ? (
              <>
                <h3 className="time-series-provenance-label">Reporting completeness</h3>
                <p className="time-series-completeness-intro">
                  Daily stability of underlying counts (same signal as the dotted &quot;Incomplete data&quot; segment on
                  the year-to-date chart).
                </p>
                <CompletenessSparkline data={completenessDaily.data} height={60} fullWidth />
              </>
            ) : null}
          </div>
        )}

        {isAdmin && !isEmbedded && !isThumbnail ? (
          <section
            className="time-series-admin-seo time-series-admin-seo--footer"
            aria-label="Admin only: SEO and link preview image"
          >
            <h2 className="time-series-admin-seo-title">
              <span className="time-series-admin-seo-badge">Admin only</span>
              SEO / Open Graph image
            </h2>
            <p className="time-series-admin-seo-help">
              Public PNG URLs for this chart permalink. Choose one as the preview image when this page is
              shared ({`/t/${chartId}`}). Links render on demand (or from cache), not from a pre-built file list.
            </p>
            {canonicalSeoPath ? (
              <p className="time-series-admin-seo-current">
                Current:{" "}
                <a href={assetUrlForPath(canonicalSeoPath)} target="_blank" rel="noreferrer">
                  {canonicalSeoPath}
                </a>{" "}
                <button
                  type="button"
                  className="time-series-admin-seo-btn time-series-admin-seo-btn--ghost"
                  disabled={adminSeoSaving}
                  onClick={() => applyCanonicalSeo(null)}
                >
                  Clear
                </button>
              </p>
            ) : (
              <p className="time-series-admin-seo-current">No custom image set (site defaults apply).</p>
            )}
            <ul className="time-series-admin-seo-list">
              {adminSeoPngRows.map((row) => (
                <li key={row.path}>
                  <span className="time-series-admin-seo-label">{row.label}</span>{" "}
                  <a
                    className="time-series-admin-seo-link"
                    href={assetUrlForPath(row.path)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open PNG
                  </a>{" "}
                  <button
                    type="button"
                    className="time-series-admin-seo-btn"
                    disabled={adminSeoSaving}
                    onClick={() => applyCanonicalSeo(row.path)}
                  >
                    Use for SEO
                  </button>
                </li>
              ))}
            </ul>
            {adminSeoMessage ? (
              <p className="time-series-admin-seo-msg" role="status">
                {adminSeoMessage}
              </p>
            ) : null}
          </section>
        ) : null}
      </article>
    </div>
  );
}

export default function TimeSeriesChartPage() {
  return (
    <Suspense
      fallback={
        <div className="time-series-page loading">
          <div className="tc-loading-state tc-loading-state--stacked">
            <Loader size="md" color="dark" />
            <span>Loading chart…</span>
          </div>
        </div>
      }
    >
      <TimeSeriesChartPageContent />
    </Suspense>
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
        <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask={`url(#${blId})`} fill="var(--text-primary)" />
        <rect className="brace" x="0" y="0" width="100" height="100" rx="3" ry="3" mask={`url(#${trId})`} fill="var(--text-primary)" />
      </svg>
    </div>
  );
}
