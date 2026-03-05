import Link from "next/link";
import type {
  PublicCityMetricItem,
  PublicMetricComparisons,
  PublicMapListItem,
} from "@/lib/publicApiClient";
import "@/components/CityView.css";
import { formatMetricValue, formatPeriodDate } from "@/lib/formatters";

type CategoryDashboardSectionProps = {
  cityDisplayName: string;
  slug: string;
  categoryName: string;
  metrics: PublicCityMetricItem[];
  comparisonsMap: Record<number, PublicMetricComparisons>;
  districts: number[];
  maps: PublicMapListItem[];
};

export default function CategoryDashboardSection({
  cityDisplayName,
  slug,
  categoryName,
  metrics,
  comparisonsMap,
  districts,
  maps,
}: CategoryDashboardSectionProps) {
  const base = `/c/${slug}`;

  const now = new Date();
  const currentYear = now.getFullYear();
  const priorYear = currentYear - 1;
  const getColumnHeaders = {
    current: `${currentYear} YTD`,
    comparison: `${priorYear} YTD`,
  };

  // Group metrics by subcategory only (single category page)
  const subMap = new Map<
    string | null,
    { m: PublicCityMetricItem; ytd: NonNullable<PublicMetricComparisons["comparisons"]["ytd"]> | null }[]
  >();

  metrics.forEach((m) => {
    const comp = comparisonsMap[m.id];
    const ytd = comp?.comparisons?.ytd ?? null;
    const sub = m.subcategory || null;
    if (!subMap.has(sub)) subMap.set(sub, []);
    subMap.get(sub)!.push({ m, ytd });
  });

  const subKeys = Array.from(subMap.keys()).sort((a, b) => {
    if (a === null && b === null) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a.localeCompare(b);
  });

  let lastComputedAt: string | null = null;
  for (const comp of Object.values(comparisonsMap)) {
    const c = comp?.comparisons?.ytd;
    if (c?.computed_at) {
      try {
        const d = new Date(c.computed_at);
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

  const hasMultipleSub = subKeys.length > 1;
  const hasSingleNamed = subKeys.length === 1 && subKeys[0] !== null;
  const showSubHeaders = hasMultipleSub || hasSingleNamed;

  const rowsWithData = subKeys.some((sk) =>
    (subMap.get(sk) ?? []).some(
      (r) =>
        r.ytd?.current_period_value != null ||
        r.ytd?.comparison_period_value != null
    )
  );

  if (!rowsWithData) {
    return (
      <section className="dashboard-section" style={{ marginTop: 0 }}>
        <div className="dashboard-header">
          <h2 className="dashboard-title">{categoryName}</h2>
        </div>
        <div className="ytd-placeholder">
          <p>No metrics with comparison data for {categoryName} in {cityDisplayName} yet.</p>
        </div>
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
        <h2 className="dashboard-title">{categoryName}</h2>
      </div>

      <div className="dashboard-comparison-selector">
        <div className="comparison-selector-label">Year to Date</div>
        {lastComputedAt && (
          <div className="comparison-selector-meta">{lastComputedAt}</div>
        )}
      </div>

      <div className="metrics-table-container">
        <div className="metrics-category-section">
          <div className="metrics-table-header">
            <div className="metric-col metric-col-name">Metric</div>
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
                .sort((a, b) => a.m.metric_name.localeCompare(b.m.metric_name));
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
                    const curr = ytd?.current_period_value ?? null;
                    const prior = ytd?.comparison_period_value ?? null;
                    const hasValid = curr != null && prior != null;
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
                    const isGood = isDecrease;
                    const isBad = isIncrease;
                    const isSmall = pct != null && Math.abs(pct) <= 5;
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

                    return (
                      <Link
                        key={m.id}
                        href={`${base}/metrics/${m.metric_key}`}
                        className="metrics-table-row metrics-table-row-clickable"
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <div className="metric-col metric-col-name">
                          <span className="metric-name">{m.metric_name}</span>
                        </div>

                        <div className="metric-col metric-col-value">
                          <span className="metric-date-label">
                            {priorDates || `Jan 1 - Jan ${priorYear}`}
                          </span>
                          <span className="metric-value">
                            {formatMetricValue(prior, displayUnit)}
                          </span>
                        </div>

                        <div className="metric-col metric-col-value">
                          <span className="metric-date-label">
                            {currentDates || `Jan 1 - Jan ${currentYear}`}
                          </span>
                          <span className="metric-value">
                            {formatMetricValue(curr, displayUnit)}
                          </span>
                        </div>

                        <div className="metric-col metric-col-change">
                          {hasValid ? (
                            <div className={`change-indicator ${changeClass}`}>
                              <span className="change-arrow">
                                {isIncrease ? "↑" : isDecrease ? "↓" : "—"}
                              </span>
                              <div className="change-values">
                                <span className="change-percent">
                                  {pct != null
                                    ? (pct > 0 ? "+" : "") + Math.round(pct) + "%"
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
      </div>

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
