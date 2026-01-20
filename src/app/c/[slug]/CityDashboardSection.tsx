import Link from "next/link";
import type {
  PublicCityMetricItem,
  PublicMetricComparisons,
  PublicMapListItem,
} from "@/lib/publicApiClient";

type CityDashboardSectionProps = {
  cityDisplayName: string;
  slug: string;
  metrics: PublicCityMetricItem[];
  comparisonsMap: Record<number, PublicMetricComparisons>;
  districts: number[];
  maps: PublicMapListItem[];
};

function formatValue(v: number | null): string {
  if (v == null) return "—";
  const absValue = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const formatWithSuffix = (scaled: number, suffix: string) =>
    `${scaled.toFixed(1).replace(/\.0$/, "")}${suffix}`;

  if (absValue >= 1e9) return `${sign}${formatWithSuffix(absValue / 1e9, "B")}`;
  if (absValue >= 1e6) return `${sign}${formatWithSuffix(absValue / 1e6, "M")}`;
  if (absValue >= 1e3) return `${sign}${formatWithSuffix(absValue / 1e3, "k")}`;
  const rounded = Math.round(absValue * 10) / 10;
  return `${sign}${rounded}`;
}

function pctChange(current: number | null, prior: number | null): string | null {
  if (current == null || prior == null || prior === 0) return null;
  const pct = ((current - prior) / prior) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
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

  return (
    <section className="features" style={{ marginTop: 0 }}>
      <div className="container">
        {/* Mayor-level dashboard */}
        <div className="section-header">
          <span className="section-badge">Mayor-level dashboard</span>
          <h2 className="section-title">Citywide metrics</h2>
          <p className="section-description">
            Key metrics for {cityDisplayName}. Sign up for monthly updates above;
            tap any metric for detail and charts.
          </p>
        </div>

        <div className="features-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {metrics.slice(0, 8).map((m) => {
            const comp = comparisonsMap[m.id];
            const ytd = comp?.comparisons?.ytd;
            const val = ytd?.current_period_value;
            const prior = ytd?.comparison_period_value;
            const change = pctChange(val ?? null, prior ?? null);
            return (
              <Link
                key={m.id}
                href={`${base}/metrics/${m.metric_key}`}
                className="feature-card"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="feature-icon">📈</div>
                <h3 className="feature-title">{m.metric_name}</h3>
                <p className="feature-description">
                  {formatValue(val ?? null)}
                  {change != null && (
                    <span style={{ marginLeft: 6, fontSize: "0.9em", opacity: 0.9 }}>
                      {change}
                    </span>
                  )}
                </p>
              </Link>
            );
          })}
        </div>

        {/* District dashboard and newsletter links */}
        {districts.length > 0 && (
          <>
            <div className="section-header" style={{ marginTop: 32 }}>
              <span className="section-badge">By district</span>
              <h2 className="section-title">District dashboards and newsletters</h2>
              <p className="section-description">
                View dashboard data and sign up for district-level monthly updates.
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {districts.map((d) => (
                <Link
                  key={d}
                  href={`${base}/district/${d}`}
                  className="btn btn-outline"
                >
                  District {d}
                </Link>
              ))}
            </div>
          </>
        )}

        {/* Recent maps */}
        {maps.length > 0 && (
          <>
            <div className="section-header" style={{ marginTop: 32 }}>
              <span className="section-badge">Maps</span>
              <h2 className="section-title">Recent maps</h2>
              <p className="section-description">
                Maps for {cityDisplayName}.
              </p>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {maps.slice(0, 10).map((m) => (
                <li key={m.id}>
                  <Link href={`/m/${m.short_hash}`} className="nav-link" style={{ fontSize: 15 }}>
                    🗺️ {m.title}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
