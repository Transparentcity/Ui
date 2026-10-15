import React from "react";
import Link from "next/link";
import type { PublicCityMandate } from "@/lib/publicApiClient";
import {
  MANDATE_PILL_LABELS,
  formatMandatePeriod,
  formatMandateTarget,
  formatMandateValue,
  mandatePillKind,
  mandateStreakText,
  type MandatePillKind,
} from "@/lib/mandates";
import MandateSparkline from "./MandateSparkline";
import styles from "./Mandates.module.css";

export type MandateScorecardState = "loading" | "ready" | "forbidden" | "error";

const PILL_CLASS: Record<MandatePillKind, string> = {
  met: styles.pillMet,
  missed: styles.pillMissed,
  at_risk: styles.pillAtRisk,
  no_data: styles.pillNoData,
  tracked: styles.pillTracked,
};

export function MandateStatusPill({ kind }: { kind: MandatePillKind }) {
  return (
    <span className={`${styles.pill} ${PILL_CLASS[kind]}`} data-kind={kind}>
      {MANDATE_PILL_LABELS[kind]}
    </span>
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
  const kind = mandatePillKind(compliance, standard.grain, now);
  const streak = kind === "no_data" ? null : mandateStreakText(compliance, standard.grain);
  const target = formatMandateTarget(standard);
  const latestPeriod = formatMandatePeriod(compliance.latest_period, standard.grain);
  const title = standard.title || mandate.metric_name;

  return (
    <li className={styles.row} data-testid="mandate-row">
      <div className={styles.rowMain}>
        <div className={styles.rowHeader}>
          <h3 className={styles.rowTitle}>{title}</h3>
          <MandateStatusPill kind={kind} />
        </div>
        <p className={styles.standardText}>{standard.text}</p>
        {standard.citation && <p className={styles.citation}>{standard.citation}</p>}
        {standard.owner_department && (
          <p className={styles.owner}>
            <span className={styles.metaLabel}>Responsible: </span>
            {standard.owner_department}
          </p>
        )}
        <div className={styles.links}>
          <Link href={`/c/${slug}/metrics/${mandate.metric_key}`} className={styles.link}>
            See the data →
          </Link>
          {standard.report_url && (
            <a
              href={standard.report_url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              {standard.report_name ? `Mandated report: ${standard.report_name}` : "Mandated report"} ↗
            </a>
          )}
        </div>
      </div>
      <div className={styles.rowStats}>
        <div className={styles.latest}>
          <span className={styles.latestValue}>
            {formatMandateValue(compliance.latest_value, standard.unit)}
          </span>
          {latestPeriod && <span className={styles.latestPeriod}>{latestPeriod}</span>}
        </div>
        {target && <div className={styles.target}>Standard: {target}</div>}
        {streak && <div className={styles.streak}>{streak}</div>}
        <MandateSparkline
          periods={compliance.periods}
          target={standard.operator === "tracked" ? null : standard.target}
          label={`${title}: last ${compliance.periods.length} periods`}
        />
      </div>
    </li>
  );
}

/**
 * Legal mandate scorecard: one row per mandate with its standard, latest
 * value, status pill, streak, a 24-period sparkline, the responsible
 * department, and links to the metric page and the mandated report.
 * Presentational only; the caller fetches and passes `state`.
 */
export default function MandateScorecard({
  mandates,
  slug,
  state,
  errorMessage,
  now,
}: {
  mandates: PublicCityMandate[];
  slug: string;
  state: MandateScorecardState;
  errorMessage?: string;
  /** Clock for the staleness rule (tests). */
  now?: Date;
}) {
  if (state === "loading") {
    return (
      <div className={styles.notice} role="status">
        Loading legal mandates…
      </div>
    );
  }
  if (state === "forbidden") {
    return (
      <div className={styles.notice} role="status">
        <strong>The legal mandates scorecard is not public yet.</strong>
        <p>Sign in with an admin account to preview it.</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className={styles.notice} role="alert">
        <strong>Could not load legal mandates.</strong>
        {errorMessage && <p>{errorMessage}</p>}
      </div>
    );
  }
  if (mandates.length === 0) {
    return (
      <div className={styles.notice} role="status">
        No legal mandates are tracked for this city yet.
      </div>
    );
  }
  return (
    <ul className={styles.scorecard} aria-label="Legal mandates">
      {mandates.map((m) => (
        <MandateRow key={m.metric_key} mandate={m} slug={slug} now={now} />
      ))}
    </ul>
  );
}
