import Link from "next/link";
import type {
  PublicCityMetricItem,
  PublicMetricComparisons,
} from "@/lib/publicApiClient";
import { formatMetricValue } from "@/lib/formatters";

type Props = {
  slug: string;
  metrics: PublicCityMetricItem[];
  comparisonsMap: Record<number, PublicMetricComparisons>;
};

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
      const isGood = isDecrease;
      const isBad = isIncrease;
      const isNeutral = pct != null && Math.abs(pct) <= 5;
      return { m, curr, pct, absPct, isIncrease, isDecrease, isGood, isBad, isNeutral };
    })
    .filter((x): x is CardItem => x != null)
    .sort((a, b) => b.absPct - a.absPct)
    .slice(0, 6);

  if (cards.length === 0) return null;

  return (
    <section className="key-numbers-section">
      <div className="container">
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
