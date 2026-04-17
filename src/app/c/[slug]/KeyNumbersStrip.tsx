import Link from "next/link";
import type {
  PublicCityMetricItem,
  PublicMetricComparisons,
} from "@/lib/publicApiClient";
import { formatMetricValue } from "@/lib/formatters";
import { changeGoodBadFromGreenDirection } from "@/lib/metricGreenDirection";

type Props = {
  slug: string;
  metrics: PublicCityMetricItem[];
  comparisonsMap: Record<number, PublicMetricComparisons>;
};

/** Format "2026-01-01" or "2026-01-01T00:00:00" to "Jan 1" or "Jan 1, 2026" */
function fmtDate(iso: string, includeYear = false): string {
  const dateOnly = iso.slice(0, 10);
  const d = new Date(dateOnly + "T00:00:00");
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  return includeYear ? `${month} ${day}, ${d.getFullYear()}` : `${month} ${day}`;
}

function extractYear(iso: string): number {
  return new Date(iso.slice(0, 10) + "T00:00:00").getFullYear();
}

export default function KeyNumbersStrip({ slug, metrics, comparisonsMap }: Props) {
  // Build cards: only metrics with valid YTD data on both sides
  type CardItem = {
    m: PublicCityMetricItem;
    curr: number;
    pct: number | null;
    absPct: number;
    isIncrease: boolean;
    isDecrease: boolean;
    isGood: boolean;
    isBad: boolean;
    isNeutral: boolean;
  };
  const cards: CardItem[] = metrics
    .map((m) => {
      const ytd = comparisonsMap[m.id]?.comparisons?.ytd;
      if (ytd?.current_period_value == null || ytd?.comparison_period_value == null) return null;
      const curr = ytd.current_period_value;
      const prior = ytd.comparison_period_value;
      const rawPct = prior !== 0 ? ((curr - prior) / prior) * 100 : null;
      const pct = rawPct != null ? Math.max(-999, Math.min(999, rawPct)) : null;
      const absPct = pct != null ? Math.abs(pct) : 0;
      const isIncrease = curr > prior;
      const isDecrease = curr < prior;
      const { isGood, isBad } = changeGoodBadFromGreenDirection(
        isIncrease,
        isDecrease,
        m.greendirection
      );
      const isNeutral = pct != null && Math.abs(pct) <= 5;
      return { m, curr, pct, absPct, isIncrease, isDecrease, isGood, isBad, isNeutral };
    })
    .filter((x): x is CardItem => x != null)
    .sort((a, b) => b.absPct - a.absPct)
    .slice(0, 6);

  if (cards.length === 0) return null;

  // Derive period label from the first card's YTD comparison
  let periodLabel: string | null = null;
  const firstYtd = comparisonsMap[cards[0].m.id]?.comparisons?.ytd;
  if (firstYtd?.current_period_start && firstYtd?.current_period_end) {
    const start = fmtDate(firstYtd.current_period_start);
    const end = fmtDate(firstYtd.current_period_end, true);
    const compYear = firstYtd.comparison_period_start
      ? extractYear(firstYtd.comparison_period_start)
      : null;
    periodLabel = compYear
      ? `Year to date: ${start} \u2013 ${end} vs. ${compYear}`
      : `Year to date: ${start} \u2013 ${end}`;
  }

  return (
    <section className="key-numbers-section">
      <div className="container">
        {periodLabel && (
          <p className="key-numbers-period">{periodLabel}</p>
        )}
        <div className="key-numbers-grid">
          {cards.map(({ m, curr, pct, isIncrease, isDecrease, isGood, isBad, isNeutral }) => {
            const colorClass = isNeutral
              ? "key-number-card--neutral"
              : isGood
                ? "key-number-card--good"
                : isBad
                  ? "key-number-card--bad"
                  : "key-number-card--neutral";
            return (
              <Link
                key={m.id}
                href={`/c/${slug}/metrics/${m.metric_key}`}
                className={`key-number-card ${colorClass}`}
              >
                <span className="key-number-label">{m.metric_name}</span>
                <span className="key-number-value">{formatMetricValue(curr)}</span>
                <span className="key-number-change">
                  {isIncrease ? "\u2191" : isDecrease ? "\u2193" : "\u2014"}
                  {pct != null ? `${Math.abs(Math.round(pct))}%` : ""}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
