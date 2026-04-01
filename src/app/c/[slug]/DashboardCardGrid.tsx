import React from "react";
import Link from "next/link";
import type {
  PublicCityMetricItem,
  PublicMetricComparisons,
  PublicLeader,
  PublicMapListItem,
} from "@/lib/publicApiClient";
import type { MetricOrderingEntry } from "./CityDashboardSection";
import { formatMetricValue } from "@/lib/formatters";
import DistrictListWithFollow from "./DistrictListWithFollow";

type Props = {
  cityDisplayName: string;
  slug: string;
  metrics: PublicCityMetricItem[];
  comparisonsMap: Record<number, PublicMetricComparisons>;
  districts: number[];
  maps: PublicMapListItem[];
  orderings?: MetricOrderingEntry[];
  cityId?: number;
  leaders?: PublicLeader[] | null;
};

// Deterministic category color palette
const CATEGORY_COLORS = [
  { bg: "#fef2f2", border: "#fecaca", spark: "#ef4444" }, // red
  { bg: "#eff6ff", border: "#bfdbfe", spark: "#3b82f6" }, // blue
  { bg: "#f0fdf4", border: "#bbf7d0", spark: "#22c55e" }, // green
  { bg: "#fefce8", border: "#fef08a", spark: "#eab308" }, // yellow
  { bg: "#faf5ff", border: "#e9d5ff", spark: "#a855f7" }, // purple
  { bg: "#fff7ed", border: "#fed7aa", spark: "#f97316" }, // orange
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Tiny decorative sparkline SVG based on trend direction */
function Sparkline({ direction, color }: { direction: "up" | "down" | "flat"; color: string }) {
  const paths: Record<string, string> = {
    down: "M0,4 C8,4 16,10 24,11 C32,12 36,13 40,14",
    up: "M0,14 C8,13 16,8 24,5 C32,3 36,3 40,2",
    flat: "M0,8 C10,9 20,7 30,8 L40,8",
  };
  return (
    <svg
      width="100%"
      height="20"
      viewBox="0 0 40 16"
      preserveAspectRatio="none"
      className="dcg-sparkline"
    >
      <path
        d={paths[direction]}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export default function DashboardCardGrid({
  cityDisplayName,
  slug,
  metrics,
  comparisonsMap,
  districts,
  maps,
  orderings,
  cityId,
  leaders,
}: Props) {
  const base = `/c/${slug}`;

  // Build ordering map
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

  // Group metrics by category
  const grouped = new Map<
    string,
    { m: PublicCityMetricItem; curr: number | null; prior: number | null; pct: number | null; categoryOrder: number; metricOrder: number }[]
  >();

  metrics.forEach((m) => {
    const comp = comparisonsMap[m.id];
    const ytd = comp?.comparisons?.ytd ?? null;
    const curr = ytd?.current_period_value ?? null;
    const prior = ytd?.comparison_period_value ?? null;
    const ord = orderingMap?.get(m.id);
    const cat = ord?.categoryName ?? m.category ?? "Uncategorized";
    const categoryOrder = ord?.categoryOrder ?? 1000;
    const metricOrder = ord?.metricOrder ?? 1000;

    if (!grouped.has(cat)) grouped.set(cat, []);
    const rawPct = curr != null && prior != null && prior !== 0
      ? ((curr - prior) / prior) * 100
      : null;
    const pct = rawPct != null ? Math.max(-999, Math.min(999, rawPct)) : null;
    grouped.get(cat)!.push({ m, curr, prior, pct, categoryOrder, metricOrder });
  });

  // Sort categories
  const getCategoryOrder = (cat: string) => {
    let minOrder = 1000;
    grouped.get(cat)?.forEach(({ categoryOrder }) => {
      if (categoryOrder < minOrder) minOrder = categoryOrder;
    });
    return minOrder;
  };
  const sortedCategories = Array.from(grouped.keys())
    .filter((cat) => {
      // Skip categories with no comparison data
      return grouped.get(cat)!.some((r) => r.curr != null || r.prior != null);
    })
    .sort((a, b) => {
      if (orderingMap) {
        const orderA = getCategoryOrder(a);
        const orderB = getCategoryOrder(b);
        if (orderA !== orderB) return orderA - orderB;
      }
      return a.localeCompare(b);
    });

  // YTD column headers
  const now = new Date();
  const currentYear = now.getFullYear();

  // Last computed
  let lastComputedAt: string | null = null;
  for (const comp of Object.values(comparisonsMap)) {
    const c = comp?.comparisons?.ytd;
    if (c?.computed_at) {
      try {
        lastComputedAt = new Date(c.computed_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        });
        break;
      } catch { /* noop */ }
    }
  }

  if (sortedCategories.length === 0) {
    return (
      <section className="dcg-section">
        <div className="dcg-header">
          <h2 className="dashboard-title">Citywide Dashboard</h2>
        </div>
        <p style={{ color: "var(--text-secondary)" }}>
          No metrics with comparison data for {cityDisplayName} yet.
        </p>
      </section>
    );
  }

  return (
    <section className="dcg-section">
      <div className="dcg-header">
        <h2 className="dashboard-title">Citywide Dashboard</h2>
        {lastComputedAt && (
          <span className="dcg-meta">
            Year to Date &middot; {lastComputedAt}
          </span>
        )}
      </div>

      <div className="dcg-grid">
        {sortedCategories.map((category) => {
          const items = grouped.get(category)!
            .filter((r) => r.curr != null || r.prior != null)
            .sort((a, b) => {
              if (orderingMap && a.metricOrder !== b.metricOrder) return a.metricOrder - b.metricOrder;
              return a.m.metric_name.localeCompare(b.m.metric_name);
            });
          if (items.length === 0) return null;

          const colorIdx = hashString(category) % CATEGORY_COLORS.length;
          const colors = CATEGORY_COLORS[colorIdx];

          // Overall category trend: average of pct changes
          const pcts = items.filter((i) => i.pct != null).map((i) => i.pct!);
          const avgPct = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
          const trendDir: "up" | "down" | "flat" =
            Math.abs(avgPct) < 5 ? "flat" : avgPct > 0 ? "up" : "down";

          return (
            <div
              key={category}
              className="dcg-card"
              style={{
                background: colors.bg,
                borderColor: colors.border,
              }}
            >
              <div className="dcg-card-title">{category}</div>
              <div className="dcg-card-metrics">
                {items.map(({ m, curr, pct }) => {
                  const isIncrease = pct != null && pct > 0;
                  const isDecrease = pct != null && pct < 0;
                  const isNeutral = pct != null && Math.abs(pct) <= 5;
                  const changeClass = isNeutral
                    ? "dcg-change--neutral"
                    : isDecrease
                      ? "dcg-change--good"
                      : isIncrease
                        ? "dcg-change--bad"
                        : "dcg-change--neutral";
                  return (
                    <Link
                      key={m.id}
                      href={`${base}/metrics/${m.metric_key}`}
                      className="dcg-metric-row"
                    >
                      <span className="dcg-metric-name">{m.metric_name}</span>
                      <span className="dcg-metric-value">
                        {formatMetricValue(curr)}
                      </span>
                      {pct != null && (
                        <span className={`dcg-metric-change ${changeClass}`}>
                          {isIncrease ? "\u2191" : isDecrease ? "\u2193" : ""}
                          {Math.abs(Math.round(pct))}%
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
              <Sparkline direction={trendDir} color={colors.spark} />
            </div>
          );
        })}
      </div>

      {/* Districts */}
      {districts.length > 0 && (
        cityId != null ? (
          <DistrictListWithFollow
            cityId={cityId}
            slug={slug}
            cityDisplayName={cityDisplayName}
            districts={districts}
            leaders={leaders}
          />
        ) : (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
              By district
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {districts.map((d) => (
                <Link key={d} href={`${base}/district/${d}`} className="nav-link" style={{ fontSize: 14 }}>
                  District {d}
                </Link>
              ))}
            </div>
          </div>
        )
      )}

      {/* Recent maps */}
      {maps.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
            Recent maps
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {maps.slice(0, 10).map((m) => (
              <li key={m.id}>
                <Link href={`/m/${m.short_hash}`} className="nav-link" style={{ fontSize: 14 }}>
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
