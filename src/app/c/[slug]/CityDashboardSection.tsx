import React from "react";
import Link from "next/link";
import type {
  PublicCityMetricItem,
  PublicMetricComparisons,
  PublicLeader,
  PublicMapListItem,
} from "@/lib/publicApiClient";
import "@/components/CityView.css";
import { formatMetricValue, formatPeriodDate } from "@/lib/formatters";
import DistrictListWithFollow from "./DistrictListWithFollow";

/** Optional ordering: when provided, categories and metrics are sorted by it. */
export type MetricOrderingEntry = {
  metric_id: number;
  category_order: number;
  metric_order: number;
  category_name: string;
  subcategory_name: string | null;
};

type CityDashboardSectionProps = {
  cityDisplayName: string;
  slug: string;
  metrics: PublicCityMetricItem[];
  comparisonsMap: Record<number, PublicMetricComparisons>;
  districts: number[];
  maps: PublicMapListItem[];
  /** Optional: when set, shows district-scoped dashboard (title, metric links with ?district=, hide By district list). */
  district?: number;
  /** Optional: custom order (user or city-level). When set, categories/metrics sorted by this. */
  orderings?: MetricOrderingEntry[];
  /** Optional: when set, shows a "Customize metrics" control in the section header. */
  onCustomizeMetricsClick?: () => void;
  /** Optional: when set (e.g. when logged out), shows this CTA instead of Customize metrics. */
  signUpToCustomizeMetricsNode?: React.ReactNode;
  /** Optional: when set with cityId, district block shows rep names, follow buttons, and Claim my page. */
  cityId?: number;
  leaders?: PublicLeader[] | null;
};

export default function CityDashboardSection({
  cityDisplayName,
  slug,
  metrics,
  comparisonsMap,
  districts,
  maps,
  district: districtFilter,
  orderings,
  onCustomizeMetricsClick,
  signUpToCustomizeMetricsNode,
  cityId,
  leaders,
}: CityDashboardSectionProps) {
  const base = `/c/${slug}`;
  const isDistrictView = districtFilter != null && districtFilter >= 1;

  const orderingMap = React.useMemo(() => {
    if (!orderings?.length) return null;
    const map = new Map<number, { categoryOrder: number; metricOrder: number; categoryName: string; subcategoryName: string | null }>();
    orderings.forEach((o) => {
      if (o.metric_id != null) {
        map.set(o.metric_id, {
          categoryOrder: o.category_order,
          metricOrder: o.metric_order,
          categoryName: o.category_name,
          subcategoryName: o.subcategory_name ?? null,
        });
      }
    });
    return map;
  }, [orderings]);

  // YTD column headers (public API only has ytd)
  const now = new Date();
  const currentYear = now.getFullYear();
  const priorYear = currentYear - 1;
  const getColumnHeaders = {
    current: `${currentYear} YTD`,
    comparison: `${priorYear} YTD`,
  };

  // Group metrics by category, then subcategory (use ordering when present)
  const grouped = new Map<
    string,
    Map<string | null, { m: PublicCityMetricItem; ytd: NonNullable<PublicMetricComparisons["comparisons"]["ytd"]> | null; categoryOrder: number; metricOrder: number }[]>
  >();

  metrics.forEach((m) => {
    const comp = comparisonsMap[m.id];
    const ytd = comp?.comparisons?.ytd ?? null;
    const ord = orderingMap?.get(m.id);
    const cat = ord?.categoryName ?? m.category ?? "Uncategorized";
    const sub = ord?.subcategoryName ?? m.subcategory ?? null;
    const categoryOrder = ord?.categoryOrder ?? 1000;
    const metricOrder = ord?.metricOrder ?? 1000;
    if (!grouped.has(cat)) {
      grouped.set(cat, new Map());
    }
    const subMap = grouped.get(cat)!;
    if (!subMap.has(sub)) subMap.set(sub, []);
    subMap.get(sub)!.push({ m, ytd, categoryOrder, metricOrder });
  });

  const getCategoryOrder = (cat: string) => {
    let minOrder = 1000;
    grouped.get(cat)?.forEach((arr) => {
      arr.forEach(({ categoryOrder }) => {
        if (categoryOrder < minOrder) minOrder = categoryOrder;
      });
    });
    return minOrder;
  };
  const sortedCategories = Array.from(grouped.keys()).sort((a, b) => {
    if (orderingMap) {
      const orderA = getCategoryOrder(a);
      const orderB = getCategoryOrder(b);
      if (orderA !== orderB) return orderA - orderB;
    }
    return a.localeCompare(b);
  });

  // Last computed from any comparison
  let lastComputedAt: string | null = null;
  for (const comp of Object.values(comparisonsMap)) {
    const c = comp?.comparisons?.ytd;
    if (c?.computed_at) {
      try {
        const d = new Date(c.computed_at);
        // Use UTC timezone to avoid off-by-one date issues with server timestamps
        lastComputedAt = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        });
        break;
      } catch {
        /* noop */
      }
    }
  }

  if (sortedCategories.length === 0) {
    return (
      <section className="dashboard-section" style={{ marginTop: 0 }}>
        <div className="dashboard-header">
          <h2 className="dashboard-title">Citywide Dashboard</h2>
        </div>
        <div className="ytd-placeholder">
          <p>No metrics with comparison data for {cityDisplayName} yet.</p>
        </div>
        {/* District and maps links even when no metrics */}
        {districts.length > 0 &&
          (cityId != null ? (
            <DistrictListWithFollow
              cityId={cityId}
              slug={slug}
              cityDisplayName={cityDisplayName}
              districts={districts}
              leaders={leaders}
            />
          ) : (
            <div className="metrics-category-section" style={{ marginTop: 24 }}>
              <div className="metrics-category-title" style={{ borderBottom: "none", paddingLeft: 0, marginBottom: 8 }}>
                By district
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "0 0 8px 0" }}>
                {districts.map((d) => (
                  <Link key={d} href={`${base}/district/${d}`} className="nav-link" style={{ fontSize: 14 }}>
                    District {d}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        {maps.length > 0 && (
          <div className="metrics-category-section" style={{ marginTop: 16 }}>
            <div className="metrics-category-title" style={{ borderBottom: "none", paddingLeft: 0, marginBottom: 8 }}>
              Recent maps
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {maps.slice(0, 10).map((m) => (
                <li key={m.id}>
                  <Link href={`/m/${m.short_hash}`} className="nav-link" style={{ fontSize: 14 }}>
                    🗺️ {m.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="dashboard-section" style={{ marginTop: 0 }}>
      <div
        className="dashboard-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2 className="dashboard-title">
          {isDistrictView ? `District ${districtFilter} Dashboard` : "Citywide Dashboard"}
        </h2>
        {!isDistrictView && onCustomizeMetricsClick != null && (
          <button
            type="button"
            onClick={onCustomizeMetricsClick}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--brand-primary, #ad35fa)",
              background: "transparent",
              border: "1px solid var(--brand-primary, #ad35fa)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Customize metrics
          </button>
        )}
        {!isDistrictView && signUpToCustomizeMetricsNode}
      </div>

      {/* Comparison bar: YTD only (matches dashboard selector style) */}
      <div className="dashboard-comparison-selector">
        <div className="comparison-selector-label">
          Year to Date
        </div>
        {lastComputedAt && (
          <div className="comparison-selector-meta">
            {lastComputedAt}
          </div>
        )}
      </div>

      <div className="metrics-table-container">
        {sortedCategories.map((category) => {
          const subMap = grouped.get(category)!;
          const subKeys = Array.from(subMap.keys()).sort((a, b) => {
            if (a === null && b === null) return 0;
            if (a === null) return -1;
            if (b === null) return 1;
            return a.localeCompare(b);
          });

          // Skip category if no metric has comparison data (match dashboard)
          const categoryHasData = subKeys.some((sk) =>
            (subMap.get(sk) ?? []).some(
              (r) =>
                r.ytd?.current_period_value != null ||
                r.ytd?.comparison_period_value != null
            )
          );
          if (!categoryHasData) return null;

          const hasMultipleSub = subKeys.length > 1;
          const hasSingleNamed =
            subKeys.length === 1 && subKeys[0] !== null;
          const showSubHeaders = hasMultipleSub || hasSingleNamed;

          return (
            <div key={category} className="metrics-category-section">
              <div className="metrics-table-header">
                <div className="metric-col metric-col-name">{category}</div>
                <div className="metric-col metric-col-value">
                  {getColumnHeaders.comparison}
                </div>
                <div className="metric-col metric-col-value">
                  {getColumnHeaders.current}
                </div>
                <div className="metric-col metric-col-change">Change</div>
              </div>

              <div className="metrics-table-body">
                {subKeys.map((subcategory) => {
                  const rows = subMap
                    .get(subcategory)!
                    .filter(
                      (r) =>
                        r.ytd?.current_period_value != null ||
                        r.ytd?.comparison_period_value != null
                    )
                    .sort((a, b) => {
                      if (orderingMap && a.metricOrder !== b.metricOrder) return a.metricOrder - b.metricOrder;
                      return a.m.metric_name.localeCompare(b.m.metric_name);
                    });
                  if (rows.length === 0) return null;
                  return (
                    <div key={subcategory ?? "uncategorized"} style={{ display: "contents" }}>
                      {showSubHeaders && subcategory && (
                        <div className="metrics-subcategory-header">
                          <span className="metrics-subcategory-title">
                            {subcategory}
                          </span>
                        </div>
                      )}
                      {rows.map(({ m, ytd }) => {
                          const curr =
                            ytd?.current_period_value ?? null;
                          const prior =
                            ytd?.comparison_period_value ?? null;
                          const hasValid =
                            curr != null && prior != null;
                          const absDiff = hasValid
                            ? (curr as number) - (prior as number)
                            : null;
                          const rawPct =
                            hasValid && prior !== 0
                              ? (((curr as number) - (prior as number)) /
                                  (prior as number)) *
                                100
                              : null;
                          // Cap at ±999% — larger values almost always
                          // indicate a near-zero prior period, not a
                          // real change.
                          const pct =
                            rawPct != null
                              ? Math.max(-999, Math.min(999, rawPct))
                              : null;

                          const isIncrease = absDiff != null && absDiff > 0;
                          const isDecrease = absDiff != null && absDiff < 0;
                          // For metrics without greendirection, default to "down is good"
                          // (decreases are good, increases are bad)
                          const isGood = isDecrease;
                          const isBad = isIncrease;
                          const isSmall =
                            pct != null && Math.abs(pct) <= 5;
                          const changeClass = isSmall
                            ? "neutral"
                            : isGood
                              ? "good"
                              : isBad
                                ? "bad"
                                : "neutral";

                          const currentDates = formatPeriodDate(
                            ytd?.current_period_start ?? null,
                            ytd?.current_period_end ?? null
                          );
                          const priorDates = formatPeriodDate(
                            ytd?.comparison_period_start ?? null,
                            ytd?.comparison_period_end ?? null
                          );
                          const displayUnit: string | null = null;

                          const metricHref = isDistrictView
                            ? `${base}/metrics/${m.metric_key}?district=${districtFilter}`
                            : `${base}/metrics/${m.metric_key}`;
                          return (
                            <Link
                              key={m.id}
                              href={metricHref}
                              className="metrics-table-row metrics-table-row-clickable"
                              style={{
                                textDecoration: "none",
                                color: "inherit",
                              }}
                            >
                              <div className="metric-col metric-col-name">
                                <span className="metric-name">
                                  {m.metric_name}
                                </span>
                              </div>

                              <div className="metric-col metric-col-value">
                                <span className="metric-date-label">
                                  {priorDates ||
                                    `Jan 1 - Jan ${priorYear}`}
                                </span>
                                <span className="metric-value">
                                  {formatMetricValue(prior, displayUnit)}
                                </span>
                              </div>

                              <div className="metric-col metric-col-value">
                                <span className="metric-date-label">
                                  {currentDates ||
                                    `Jan 1 - Jan ${currentYear}`}
                                </span>
                                <span className="metric-value">
                                  {formatMetricValue(curr, displayUnit)}
                                </span>
                              </div>

                              <div className="metric-col metric-col-change">
                                {hasValid ? (
                                  <div
                                    className={`change-indicator ${changeClass}`}
                                  >
                                    <span className="change-arrow">
                                      {isIncrease
                                        ? "↑"
                                        : isDecrease
                                          ? "↓"
                                          : "—"}
                                    </span>
                                    <div className="change-values">
                                      <span className="change-percent">
                                        {pct != null
                                          ? (pct > 0 ? "+" : "") +
                                            Math.round(pct) +
                                            "%"
                                          : "—"}
                                      </span>
                                      <span className="change-absolute">
                                        {absDiff != null
                                          ? (absDiff > 0 ? "+" : "") +
                                            Math.round(absDiff).toLocaleString()
                                          : "—"}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="change-na">—</span>
                                )}
                              </div>
                            </Link>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* District links and maps below (compact, secondary); when viewing a district, show Back to citywide */}
      {isDistrictView ? (
        <div className="metrics-category-section" style={{ marginTop: 24 }}>
          <div
            className="metrics-category-title"
            style={{ borderBottom: "none", paddingLeft: 0, marginBottom: 8 }}
          >
            All districts
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              padding: "0 0 8px 0",
            }}
          >
            <Link href={base} className="nav-link" style={{ fontSize: 14 }}>
              ← Back to citywide
            </Link>
            {districts.map((d) => (
              <Link
                key={d}
                href={`${base}/district/${d}`}
                className="nav-link"
                style={{ fontSize: 14 }}
              >
                District {d}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        districts.length > 0 &&
        (cityId != null ? (
          <DistrictListWithFollow
            cityId={cityId}
            slug={slug}
            cityDisplayName={cityDisplayName}
            districts={districts}
            leaders={leaders}
          />
        ) : (
          <div className="metrics-category-section" style={{ marginTop: 24 }}>
            <div
              className="metrics-category-title"
              style={{ borderBottom: "none", paddingLeft: 0, marginBottom: 8 }}
            >
              By district
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                padding: "0 0 8px 0",
              }}
            >
              {districts.map((d) => (
                <Link
                  key={d}
                  href={`${base}/district/${d}`}
                  className="nav-link"
                  style={{ fontSize: 14 }}
                >
                  District {d}
                </Link>
              ))}
            </div>
          </div>
        ))
      )}

      {maps.length > 0 && (
        <div className="metrics-category-section" style={{ marginTop: 16 }}>
          <div
            className="metrics-category-title"
            style={{ borderBottom: "none", paddingLeft: 0, marginBottom: 8 }}
          >
            Recent maps
          </div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {maps.slice(0, 10).map((m) => (
              <li key={m.id}>
                <Link
                  href={`/m/${m.short_hash}`}
                  className="nav-link"
                  style={{ fontSize: 14 }}
                >
                  🗺️ {m.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
