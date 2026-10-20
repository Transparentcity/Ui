import React from "react";
import Link from "next/link";
import type { PublicCityMandate } from "@/lib/publicApiClient";
import {
  MANDATE_PILL_LABELS,
  MANDATE_PILL_ORDER,
  formatMandatePeriod,
  formatMandateTarget,
  formatMandateValue,
  mandateIsStale,
  mandatePillKind,
  mandateStreakText,
  sortMandatesForScorecard,
  splitMandateValue,
  summarizeMandates,
  type MandatePillKind,
} from "@/lib/mandates";
import MandateSparkline from "./MandateSparkline";
import styles from "./Mandates.module.css";

export type MandateScorecardState = "loading" | "ready" | "forbidden" | "error";

const PILL_CLASS: Record<MandatePillKind, string> = {
  met: styles.pillMet,
  missed: styles.pillMissed,
  behind_pace: styles.pillMissed,
  at_risk: styles.pillAtRisk,
  no_data: styles.pillNoData,
  tracked: styles.pillTracked,
};

/** Short, lower-case form for the summary strip ("2 missed", "5 meeting"). */
const SUMMARY_LABELS: Record<MandatePillKind, string> = {
  met: "meeting the standard",
  missed: "missed",
  behind_pace: "behind pace",
  at_risk: "at risk",
  no_data: "no recent data",
  tracked: "no legal target",
};

export function MandateStatusPill({ kind }: { kind: MandatePillKind }) {
  return (
    <span className={`${styles.pill} ${PILL_CLASS[kind]}`} data-kind={kind}>
      {MANDATE_PILL_LABELS[kind]}
    </span>
  );
}

function MandateSummaryStrip({
  mandates,
  cityName,
}: {
  mandates: PublicCityMandate[];
  cityName: string;
}) {
  const { counts, lead } = summarizeMandates(mandates, cityName);
  return (
    <div className={styles.summary} data-testid="mandate-summary">
      <ul className={styles.summaryCounts} aria-label="Standards by status">
        {MANDATE_PILL_ORDER.filter((k) => counts[k]).map((k) => (
          <li key={k} className={styles.summaryCount} data-kind={k}>
            <span className={styles.summaryNumber}>{counts[k]}</span> {SUMMARY_LABELS[k]}
          </li>
        ))}
      </ul>
      {lead && <p className={styles.summaryLead}>{lead}</p>}
    </div>
  );
}

function MandateRow({
  mandate,
  slug,
  now,
}: {
  mandate: PublicCityMandate;
  slug: string;
  now?: Date;
}) {
  const { standard, compliance } = mandate;
  const kind = mandatePillKind(compliance);
  const stale = mandateIsStale(compliance, standard.grain, now);
  const streak = kind === "no_data" ? null : mandateStreakText(compliance, standard.grain);
  const target = formatMandateTarget(standard);
  const latestPeriod = formatMandatePeriod(compliance.latest_period, standard.grain);
  const title = standard.title || mandate.metric_name;
  // A pace standard is judged on the running total, not the latest period.
  const isPace = standard.operator === "pace";
  const lastPace = isPace
    ? [...compliance.periods].reverse().find((p) => p.cumulative_actual != null)
    : undefined;
  const shown = splitMandateValue(
    lastPace ? lastPace.cumulative_actual : compliance.latest_value,
    standard.unit
  );
  const sparkPeriods = isPace
    ? compliance.periods.map((p) => ({ ...p, value: p.cumulative_actual ?? null }))
    : compliance.periods;

  return (
    <li className={styles.row} data-testid="mandate-row" data-kind={kind}>
      <div className={styles.rowMain}>
        <h3 className={styles.rowTitle}>
          <Link href={`/c/${slug}/metrics/${mandate.metric_key}`} className={styles.rowTitleLink}>
            {title}
          </Link>
        </h3>
        <p className={styles.standardText}>{standard.text}</p>
        <Link href={`/c/${slug}/metrics/${mandate.metric_key}`} className={styles.link}>
          See the data and the law →
        </Link>
      </div>
      <div className={styles.rowStats}>
        <div className={styles.latest}>
          <span className={styles.latestValue}>{shown.number}</span>
          {shown.unit && <span className={styles.latestUnit}>{shown.unit}</span>}
          <MandateStatusPill kind={kind} />
        </div>
        {latestPeriod && (
          <div className={stale ? styles.stalePeriod : styles.latestPeriod}>
            {stale ? `Last report ${latestPeriod}` : latestPeriod}
          </div>
        )}
        {lastPace?.cumulative_expected != null && (
          <div className={styles.target}>
            Expected by now: {formatMandateValue(Math.round(lastPace.cumulative_expected), standard.unit)}
          </div>
        )}
        {target && <div className={styles.target}>Standard: {target}</div>}
        {streak && <div className={styles.streak}>{streak}</div>}
        <MandateSparkline
          periods={sparkPeriods}
          target={standard.operator === "tracked" || isPace ? null : standard.target}
          label={`${title}: last ${compliance.periods.length} periods`}
        />
      </div>
    </li>
  );
}

/**
 * Legal standards scorecard: a summary strip, then one row per standard
 * sorted by status (failures first) with the latest value, status pill,
 * streak and a 24-period sparkline. The law, the responsible official and
 * the mandated report live on the metric page's Legal standard panel.
 * Presentational only; the caller fetches and passes `state`.
 */
export default function MandateScorecard({
  mandates,
  slug,
  cityName,
  state,
  errorMessage,
  now,
}: {
  mandates: PublicCityMandate[];
  slug: string;
  /** For the summary lead, e.g. "San Francisco is meeting every legal standard…". */
  cityName?: string;
  state: MandateScorecardState;
  errorMessage?: string;
  /** Clock for the staleness rule (tests). */
  now?: Date;
}) {
  if (state === "loading") {
    return (
      <div className={styles.notice} role="status">
        Loading legal standards…
      </div>
    );
  }
  if (state === "forbidden") {
    return (
      <div className={styles.notice} role="status">
        <strong>The legal standards scorecard is not public yet.</strong>
        <p>Sign in with an admin account to preview it.</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className={styles.notice} role="alert">
        <strong>Could not load legal standards.</strong>
        {errorMessage && <p>{errorMessage}</p>}
      </div>
    );
  }
  if (mandates.length === 0) {
    return (
      <div className={styles.notice} role="status">
        No legal standards are tracked for this city yet.
      </div>
    );
  }
  const sorted = sortMandatesForScorecard(mandates);
  return (
    <>
      <MandateSummaryStrip mandates={mandates} cityName={cityName ?? "The city"} />
      <ul className={styles.scorecard} aria-label="Legal standards">
        {sorted.map((m) => (
          <MandateRow key={m.metric_key} mandate={m} slug={slug} now={now} />
        ))}
      </ul>
    </>
  );
}
