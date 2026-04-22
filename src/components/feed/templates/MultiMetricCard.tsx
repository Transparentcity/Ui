"use client";

import { useMemo } from "react";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { slugify } from "@/lib/utils";
import { useMetricKey } from "../MetricKeyContext";
import MetricLink from "../MetricLink";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface Metric {
  name: string;
  direction: "up" | "down" | "flat";
  arrow: string;
  percent: string;
  favorable: boolean;
}

function formatPct(raw: number): string {
  const abs = Math.abs(raw);
  if (abs <= 999) return `${Math.round(abs)}%`;
  const multiplier = abs / 100;
  if (multiplier <= 999) return `${Math.round(multiplier)}x`;
  return "999x";
}

/**
 * Determine if a metric change is favorable (good news) based on direction
 * and metric name. Decreases in complaints/crime/response times = good.
 * Increases in complaints/crime/response times = bad.
 */
function isFavorable(direction: string, name?: string | null): boolean {
  const nameLower = (name ?? "").toLowerCase();
  // Metrics where "down" is bad (programs, services, employment)
  const downIsBad = /employment|jobs|housing|units|funding|program|service|budget|revenue/.test(nameLower);
  if (downIsBad) return direction === "up";
  // Default: for complaints, incidents, crime, response times — down is good
  return direction === "down";
}

function extractRealMetrics(story: EnrichedFeedStory): Metric[] | null {
  const meta = story.metadata;
  if (!meta) return null;

  const metricsData = meta.metrics as
    | Array<{ name?: string | null; direction: string; pct: string | number }>
    | undefined;
  if (!Array.isArray(metricsData) || metricsData.length === 0) return null;

  return metricsData.slice(0, 4).map((m) => {
    const dir: Metric["direction"] =
      m.direction === "up" ? "up" : m.direction === "down" ? "down" : "flat";
    const rawPct = typeof m.pct === "number" ? m.pct : parseFloat(String(m.pct)) || 0;
    const formatted = formatPct(rawPct);
    const metricName = m.name ?? "";
    const fav = isFavorable(dir, metricName);
    return {
      name: metricName,
      direction: dir,
      arrow: dir === "up" ? "\u2191" : dir === "down" ? "\u2193" : "\u2500",
      percent: formatted,
      favorable: fav,
    };
  });
}

const PERIOD_TYPE_LABELS: Record<string, string> = {
  yoy: "Year-over-Year",
  mom: "vs. Last Month",
  wow: "vs. Last Week",
  ytd: "Year-to-Date",
  qtd: "Quarter-to-Date",
  mtd: "Month-to-Date",
};

function resolvePeriodLabel(meta: Record<string, unknown>): string | null {
  if (typeof meta.period_label === "string" && meta.period_label) return meta.period_label;
  if (typeof meta.period_type === "string" && meta.period_type in PERIOD_TYPE_LABELS) {
    return PERIOD_TYPE_LABELS[meta.period_type];
  }
  return null;
}

interface MultiMetricCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
}

/** Strip leading geographic scope (e.g. "Citywide — " or "Citywide This Week — ") already shown in the neighborhood label */
function stripLeadingScope(headline: string): string {
  return headline.replace(/^(?:Citywide|City-?wide)\b.*?[\u2014\u2013\-]+\s*/i, "");
}

export default function MultiMetricCard({ story, children }: MultiMetricCardProps) {
  const realMetrics = useMemo(() => extractRealMetrics(story), [story]);
  const meta = story.metadata ?? {};
  const isComparison = meta.comparison_type === "district_vs_city";
  const displayHeadline = stripLeadingScope(story.headline ?? "");
  const periodLabel = useMemo(() => resolvePeriodLabel(meta), [meta]);
  const { resolveMetricKey } = useMetricKey();
  const citySlug = story.city_name ? slugify(story.city_name) : null;
  const district = story.district > 0 ? story.district : null;

  // Find the lead metric (largest absolute % change) for highlighting
  const leadIdx = useMemo(() => {
    if (!realMetrics || realMetrics.length <= 1) return -1;
    let maxAbs = 0;
    let idx = -1;
    for (let i = 0; i < realMetrics.length; i++) {
      const abs = Math.abs(parseFloat(realMetrics[i].percent) || 0);
      if (abs > maxAbs) { maxAbs = abs; idx = i; }
    }
    return maxAbs > 0 ? idx : -1;
  }, [realMetrics]);

  // Comparison variant: 2-column "district vs. city" layout
  if (isComparison && realMetrics && realMetrics.length >= 2) {
    const districtMetric = realMetrics[0];
    const cityMetric = realMetrics[1];
    const ratio = meta.comparison_ratio as string | undefined;
    return (
      <>
        <CardHeader
          typeIcon={story.type_icon}
          typeLabel={story.type_label}
          actor={story.actor}
          subline={story.subline}
          neighborhoodLabel={story.neighborhood_label}
          categoryColor={story.category_color}
          storyType={story.story_type}
          placeScoped={story.place_scoped_for_ui}
        />
        <h2 className={styles.cardHeadline}>{displayHeadline}</h2>
        {periodLabel && <div className={styles.metricPeriodLabel}>{periodLabel}</div>}
        <div className={styles.comparisonGrid}>
          <div className={styles.comparisonSide}>
            <div className={styles.comparisonSideLabel}>Your District</div>
            <div className={`${styles.comparisonSideValue} ${
              districtMetric.favorable ? styles.metricFavorable : styles.metricUnfavorable
            }`}>
              {districtMetric.arrow} {districtMetric.percent}
            </div>
            <div className={styles.comparisonSideMetric}>
              <MetricLink
                label={districtMetric.name}
                metricKey={resolveMetricKey(districtMetric.name)}
                citySlug={citySlug}
                district={district}
              />
            </div>
          </div>
          <div className={styles.comparisonVs}>
            {ratio ?? "vs."}
          </div>
          <div className={styles.comparisonSide}>
            <div className={styles.comparisonSideLabel}>Citywide</div>
            <div className={`${styles.comparisonSideValue} ${
              cityMetric.favorable ? styles.metricFavorable : styles.metricUnfavorable
            }`}>
              {cityMetric.arrow} {cityMetric.percent}
            </div>
            <div className={styles.comparisonSideMetric}>
              <MetricLink
                label={cityMetric.name}
                metricKey={resolveMetricKey(cityMetric.name)}
                citySlug={citySlug}
              />
            </div>
          </div>
        </div>
        {children}
      </>
    );
  }

  return (
    <>
      <CardHeader
        typeIcon={story.type_icon}
        typeLabel={story.type_label}
        actor={story.actor}
        subline={story.subline}
        neighborhoodLabel={story.neighborhood_label}
        categoryColor={story.category_color}
        storyType={story.story_type}
        placeScoped={story.place_scoped_for_ui}
      />
      <h2 className={styles.cardHeadline}>{displayHeadline}</h2>
      {periodLabel && <div className={styles.metricPeriodLabel}>{periodLabel}</div>}

      {!(realMetrics && realMetrics.length > 0) && story.cleaned_description ? (
        <p className={styles.cardDescription}>{story.cleaned_description}</p>
      ) : null}

      {realMetrics && realMetrics.length > 0 && (
        <div className={styles.metricGridRedesigned}>
          {realMetrics.map((m, i) => (
            <div key={i} className={`${styles.metricTile} ${i === leadIdx ? styles.metricTileLead : ""}`}>
              <div className={styles.metricTileMain}>
                <div
                  className={`${styles.metricNumber} ${
                    m.favorable ? styles.metricFavorable : styles.metricUnfavorable
                  }`}
                >
                  <span className={styles.metricArrow}>{m.arrow}</span> {m.percent}
                </div>
                <div className={styles.metricTileLabel}>
                  <MetricLink
                    label={m.name}
                    metricKey={resolveMetricKey(m.name)}
                    citySlug={citySlug}
                    district={district}
                  />
                </div>
              </div>
              <div className={styles.sparklineWrap} />
            </div>
          ))}
        </div>
      )}

      {children}
    </>
  );
}
