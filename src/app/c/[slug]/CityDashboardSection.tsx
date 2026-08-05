import React from "react";
import Link from "next/link";
import type {
  PublicCityMetricItem,
  PublicMetricComparisons,
  PublicLeader,
  PublicMapListItem,
} from "@/lib/publicApiClient";
import "@/components/CityView.css";
import { formatMetricValue, formatPeriodDate, formatCategoryName } from "@/lib/formatters";
import { changeGoodBadFromGreenDirection } from "@/lib/metricGreenDirection";
import DistrictListWithFollow from "./DistrictListWithFollow";
import {
  formatSubdivisionLabel,
  type PublicGeographicContext,
} from "@/lib/publicGeographicUnit";
import {
  resolveDisplayCategory,
  resolveDisplaySubcategory,
} from "@/lib/metricOrderingDisplay";

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
  /** Optional: when set with cityId, district block shows rep names, follow buttons, and Claim my page. */
  cityId?: number;
  leaders?: PublicLeader[] | null;
  /** Optional: slot rendered between dashboard metrics and district list (e.g. featured stories). */
  storiesSlot?: React.ReactNode;
  /** Number of public datasets for this city */
  datasetsCount?: number | null;
  /** Optional: neighborhood vs district labeling for public pages */
  geographicContext?: PublicGeographicContext;
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
  cityId,
  leaders,
  storiesSlot,
  datasetsCount,
  geographicContext,
}: CityDashboardSectionProps) {
  const base = `/c/${slug}`;
  const isDistrictView = districtFilter != null && districtFilter >= 1;
  const unitLabel = geographicContext?.unitLabel ?? "District";
  const unitLabelPlural = geographicContext?.unitLabelPlural ?? "Districts";
  const subdivisionLabel = (id: number) =>
    geographicContext
      ? formatSubdivisionLabel(geographicContext, id)
      : `${unitLabel} ${id}`;

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
    // Match CityView / MetricOrderEditor: ordering override only when non-empty
    const cat = resolveDisplayCategory(ord?.categoryName, m.category);
    const sub = resolveDisplaySubcategory(ord?.subcategoryName, m.subcategory);
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
        <div className="dashboard-comparison-selector">
          <div className="comparison-selector-scope">
            {isDistrictView
              ? `${subdivisionLabel(districtFilter!)} Dashboard`
              : "Citywide Dashboard"}
          </div>
        </div>
        <div className="ytd-placeholder">
          {isDistrictView ? (
            // Known subdivision with no comparison rows yet (e.g. a neighborhood
            // whose metrics lack a per-neighborhood breakdown). The city itself
            // is set up, so no "add your city" CTA.
            <p>
              No {subdivisionLabel(districtFilter!)}-level metrics for{" "}
              {cityDisplayName} yet. Citywide numbers are on the{" "}
              <Link href={base}>{cityDisplayName} dashboard</Link>.
            </p>
          ) : (
            <>
              <p>No dashboard metrics for {cityDisplayName} yet.</p>
              <a href="/add-your-city">Help us get your city set up</a>
            </>
          )}
        </div>
        {storiesSlot}
        {/* District and maps links even when no metrics */}
        {districts.length > 0 &&
          (cityId != null ? (
            <DistrictListWithFollow
              cityId={cityId}
              slug={slug}
              cityDisplayName={cityDisplayName}
              districts={districts}
              leaders={leaders}
              geographicContext={geographicContext}
            />
          ) : (
            <div className="metrics-category-section" style={{ marginTop: 24 }}>
              <div className="metrics-category-title" style={{ borderBottom: "none", paddingLeft: 0, marginBottom: 8 }}>
                By {unitLabelPlural.toLowerCase()}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "0 0 8px 0" }}>
                {districts.map((d) => (
                  <Link key={d} href={`${base}/district/${d}`} className="nav-link" style={{ fontSize: 14 }}>
                    {subdivisionLabel(d)}
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
      {/* Comparison bar: scope label + YTD date */}
      <div className="dashboard-comparison-selector">
        <div className="comparison-selector-scope">
          {isDistrictView
            ? `${subdivisionLabel(districtFilter!)} Dashboard`
            : "Citywide Dashboard"}
        </div>
        <div className="comparison-selector-label">
          Year to Date
        </div>
      </div>
      {(datasetsCount != null && datasetsCount > 0 || lastComputedAt) && (
        <div className="dashboard-datasets-count">
          {lastComputedAt && `As of ${lastComputedAt}`}
          {lastComputedAt && datasetsCount != null && datasetsCount > 0 && ", "}
          {datasetsCount != null && datasetsCount > 0 && `${datasetsCount.toLocaleString()} public datasets`}
        </div>
      )}

      <div className="metrics-table-container">
        {sortedCategories.map((category) => {
          const subMap = grouped.get(category)!;
          // Match MetricOrderEditor: subcategory bands sort by min(metric_order), then name.
          // (Alphabet-only order put e.g. "Units" after "Permitting" despite saved order.)
          const subKeys = Array.from(subMap.keys()).sort((a, b) => {
            if (orderingMap) {
              const minOrder = (sk: string | null) => {
                const arr = subMap.get(sk) ?? [];
                if (arr.length === 0) return 1000;
                return Math.min(...arr.map((r) => r.metricOrder));
              };
              const oa = minOrder(a);
              const ob = minOrder(b);
              if (oa !== ob) return oa - ob;
            }
            if (a === null && b === null) return 0;
            if (a === null) return -1;
            if (b === null) return 1;
            return String(a).localeCompare(String(b));
          });

          const hasMultipleSub = subKeys.length > 1;
          const hasSingleNamed =
            subKeys.length === 1 && subKeys[0] !== null;
          const showSubHeaders = hasMultipleSub || hasSingleNamed;

          return (
            <div key={category} className="metrics-category-section">
              <div className="metrics-table-header">
                <div className="metric-col metric-col-name">{formatCategoryName(category)}</div>
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
                  // Show every metric in the band (same as sort dialog). Missing YTD shows
                  // "No data" / "—" in cells; do not drop rows for null comparison values.
                  const rows = subMap
                    .get(subcategory)!
                    .slice()
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
                            {formatCategoryName(subcategory)}
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
                          // Cap at ±500% — larger values almost always
                          // indicate a near-zero prior period, not a
                          // real, meaningful change.
                          const pct =
                            rawPct != null
                              ? Math.max(-500, Math.min(500, rawPct))
                              : null;

                          const isIncrease = absDiff != null && absDiff > 0;
                          const isDecrease = absDiff != null && absDiff < 0;
                          const { isGood, isBad } = changeGoodBadFromGreenDirection(
                            isIncrease,
                            isDecrease,
                            m.greendirection
                          );
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
                                            formatMetricValue(Math.round(absDiff), displayUnit)
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

      {storiesSlot}

      {/* District links below metrics (citywide only). District pages already
          have hero pills + a named subdivision list further down the page. */}
      {!isDistrictView &&
        districts.length > 0 &&
        (cityId != null ? (
          <DistrictListWithFollow
            cityId={cityId}
            slug={slug}
            cityDisplayName={cityDisplayName}
            districts={districts}
            leaders={leaders}
            geographicContext={geographicContext}
          />
        ) : (
          <div className="metrics-category-section" style={{ marginTop: 24 }}>
            <div
              className="metrics-category-title"
              style={{ borderBottom: "none", paddingLeft: 0, marginBottom: 8 }}
            >
              By {unitLabelPlural.toLowerCase()}
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
                  {geographicContext
                    ? formatSubdivisionLabel(geographicContext, d)
                    : `${unitLabel} ${d}`}
                </Link>
              ))}
            </div>
          </div>
        ))}

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
