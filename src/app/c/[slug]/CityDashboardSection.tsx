import Link from "next/link";
import type {
  PublicCityMetricItem,
  PublicMetricComparisons,
  PublicMapListItem,
} from "@/lib/publicApiClient";
import "@/components/CityView.css";

type CityDashboardSectionProps = {
  cityDisplayName: string;
  slug: string;
  metrics: PublicCityMetricItem[];
  comparisonsMap: Record<number, PublicMetricComparisons>;
  districts: number[];
  maps: PublicMapListItem[];
};

/**
 * Format a metric value based on its display unit.
 * Matches CityView's formatMetricValue.
 */
function formatMetricValue(
  value: number | null | undefined,
  displayUnit?: string | null
): string {
  if (value === null || value === undefined) {
    return "No data";
  }

  if (displayUnit === "percentage") {
    return `${Math.round(value)}%`;
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const formatWithSuffix = (scaled: number, suffix: string) =>
    `${scaled.toFixed(1).replace(/\.0$/, "")}${suffix}`;

  const compact =
    absValue >= 1e9
      ? formatWithSuffix(absValue / 1e9, "B")
      : absValue >= 1e6
        ? formatWithSuffix(absValue / 1e6, "M")
        : absValue >= 1e3
          ? formatWithSuffix(absValue / 1e3, "k")
          : `${Math.round(absValue * 10) / 10}`;

  if (displayUnit === "currency") {
    return `${sign}$${compact}`;
  }

  return `${sign}${compact}`;
}

function formatPeriodDate(start?: string | null, end?: string | null): string | null {
  if (!start || !end) return null;
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);
    // Use UTC timezone to avoid off-by-one date issues with server dates
    const startStr = startDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const endStr = endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    return `${startStr} - ${endStr}`;
  } catch {
    return null;
  }
}

function formatMetadataDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    // Use UTC timezone to avoid off-by-one date issues with server dates
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return null;
  }
}

export default function CityDashboardSection({
  cityDisplayName,
  slug,
  metrics,
  comparisonsMap,
  districts,
  maps,
}: CityDashboardSectionProps) {
  const base = `/c/${slug}`;

  // YTD column headers (public API only has ytd)
  const now = new Date();
  const currentYear = now.getFullYear();
  const priorYear = currentYear - 1;
  const getColumnHeaders = {
    current: `${currentYear} YTD`,
    comparison: `${priorYear} YTD`,
  };

  // Group metrics by category, then subcategory (same as dashboard)
  const grouped = new Map<
    string,
    Map<string | null, { m: PublicCityMetricItem; ytd: NonNullable<PublicMetricComparisons["comparisons"]["ytd"]> | null }[]>
  >();

  metrics.forEach((m) => {
    const comp = comparisonsMap[m.id];
    const ytd = comp?.comparisons?.ytd ?? null;
    const cat = m.category || "Uncategorized";
    const sub = m.subcategory || null;
    if (!grouped.has(cat)) {
      grouped.set(cat, new Map());
    }
    const subMap = grouped.get(cat)!;
    if (!subMap.has(sub)) subMap.set(sub, []);
    subMap.get(sub)!.push({ m, ytd });
  });

  // Sort categories, then subcategories (null first), then metrics by name
  const sortedCategories = Array.from(grouped.keys()).sort((a, b) =>
    a.localeCompare(b)
  );

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
        {districts.length > 0 && (
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
        )}
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
      <div className="dashboard-header">
        <h2 className="dashboard-title">Citywide Dashboard</h2>
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
                    .sort((a, b) =>
                      a.m.metric_name.localeCompare(b.m.metric_name)
                    );
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
                          const pct =
                            hasValid && prior !== 0
                              ? (((curr as number) - (prior as number)) /
                                  (prior as number)) *
                                100
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
                          const maxData = formatMetadataDate(
                            ytd?.current_period_end ?? null
                          );
                          const displayUnit: string | null = null;

                          return (
                            <Link
                              key={m.id}
                              href={`${base}/metrics/${m.metric_key}`}
                              className="metrics-table-row metrics-table-row-clickable"
                              style={{
                                textDecoration: "none",
                                color: "inherit",
                              }}
                            >
                              <div className="metric-col metric-col-name">
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                  <span className="metric-name">
                                    {m.metric_name}
                                  </span>
                                  {maxData && (
                                    <div className="metric-metadata">
                                      Through: {maxData}
                                    </div>
                                  )}
                                </div>
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
                                      <span className="change-absolute">
                                        {absDiff != null
                                          ? (absDiff > 0 ? "+" : "") +
                                            Math.round(absDiff).toLocaleString()
                                          : "—"}
                                      </span>
                                      <span className="change-percent">
                                        {pct != null
                                          ? (pct > 0 ? "+" : "") +
                                            Math.round(pct) +
                                            "%"
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

      {/* District links and maps below (compact, secondary) */}
      {districts.length > 0 && (
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
