import React from "react";
import Link from "next/link";
import type { PublicCityMandate } from "@/lib/publicApiClient";
import {
  LEGAL_STANDARDS_LABEL,
  MANDATE_PILL_LABELS,
  MANDATE_PILL_ORDER,
  formatMandatePeriod,
  formatMandateTarget,
  formatMandateValue,
  mandateStatus,
  mandateStreakText,
  sortMandatesForScorecard,
  splitMandateValue,
  summarizeMandates,
  type MandatePillKind,
} from "@/lib/mandates";
import MandateSparkline from "./MandateSparkline";
import styles from "./Mandates.module.css";
import "@/components/CityView.css";

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
  now,
}: {
  mandates: PublicCityMandate[];
  cityName: string;
  now?: Date;
}) {
  const { counts, stale, lead } = summarizeMandates(mandates, cityName, now);
  return (
    <div className={styles.summary} data-testid="mandate-summary">
      <ul className={styles.summaryCounts} aria-label="Standards by status">
        {MANDATE_PILL_ORDER.filter((k) => counts[k]).map((k) => (
          <li key={k} className={styles.summaryCount} data-kind={k}>
            <span className={styles.summaryNumber}>{counts[k]}</span> {SUMMARY_LABELS[k]}
          </li>
        ))}
        {stale > 0 && (
          <li className={styles.summaryCount} data-kind="stale">
            <span className={styles.summaryNumber}>{stale}</span>{" "}
            {stale === 1 ? "report overdue" : "reports overdue"}
          </li>
        )}
      </ul>
      {lead && <p className={styles.summaryLead}>{lead}</p>}
    </div>
  );
}

/** One table row, in the same chrome as the city dashboard's metric rows. */
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
  const { kind, stale } = mandateStatus(compliance, standard.grain, now);
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
    <Link
      href={`/c/${slug}/metrics/${mandate.metric_key}`}
      className={`metrics-table-row metrics-table-row-clickable ${styles.tableRow}`}
      data-testid="mandate-row"
      data-kind={kind}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="metric-col metric-col-name">
        <span className="metric-name">{title}</span>
        <span className={`metric-metadata ${styles.rowStandard}`}>{standard.text}</span>
      </div>
      <div className="metric-col metric-col-value">
        {latestPeriod && (
          <span className={stale ? `metric-date-label ${styles.stalePeriod}` : "metric-date-label"}>
            {stale ? `Last report ${latestPeriod}` : latestPeriod}
          </span>
        )}
        <span className="metric-value">
          {shown.number}
          {shown.unit && <span className={styles.latestUnit}> {shown.unit}</span>}
        </span>
        {lastPace?.cumulative_expected != null && (
          <span className={`metric-metadata ${styles.rowNote}`}>
            Expected by now: {formatMandateValue(Math.round(lastPace.cumulative_expected), standard.unit)}
          </span>
        )}
        {target && <span className={`metric-metadata ${styles.rowNote}`}>Standard: {target}</span>}
      </div>
      <div className={`metric-col metric-col-value ${styles.statusCol}`}>
        <MandateStatusPill kind={kind} />
        {streak && <span className={`metric-metadata ${styles.streak}`}>{streak}</span>}
      </div>
      <div className={`metric-col metric-col-change ${styles.trendCol}`}>
        <MandateSparkline
          periods={sparkPeriods}
          target={standard.operator === "tracked" || isPace ? null : standard.target}
          label={`${title}: last ${compliance.periods.length} periods`}
        />
      </div>
    </Link>
  );
}

function Notice({ role, children }: { role: "status" | "alert"; children: React.ReactNode }) {
  return (
    <section className="dashboard-section">
      <div className="container">
        <div className={styles.notice} role={role}>
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * Legal standards scorecard in the city dashboard's table chrome: a section
 * header, the summary strip, then one row per standard sorted by status
 * (failures first) with the latest figure, status pill, streak and a
 * sparkline. The law, the responsible official and the mandated report live
 * on the metric page's Legal standard panel. Presentational only; the caller
 * fetches and passes `state`.
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
    return <Notice role="status">Loading legal standards…</Notice>;
  }
  if (state === "forbidden") {
    return (
      <Notice role="status">
        <strong>The legal standards scorecard is not public yet.</strong>
        <p>Sign in with an admin account to preview it.</p>
      </Notice>
    );
  }
  if (state === "error") {
    return (
      <Notice role="alert">
        <strong>Could not load legal standards.</strong>
        {errorMessage && <p>{errorMessage}</p>}
      </Notice>
    );
  }
  if (mandates.length === 0) {
    return <Notice role="status">No legal standards are tracked for this city yet.</Notice>;
  }
  const sorted = sortMandatesForScorecard(mandates);
  const latest = mandates
    .map((m) => m.compliance.latest_period)
    .filter((p): p is string => !!p)
    .sort()
    .at(-1);
  const asOf = latest ? formatMandatePeriod(latest, "month") : null;
  return (
    <section className="dashboard-section" aria-label={LEGAL_STANDARDS_LABEL}>
      <div className="dashboard-comparison-selector">
        <span className="comparison-selector-scope">{LEGAL_STANDARDS_LABEL}</span>
        <span className="comparison-selector-label">
          {mandates.length} standards{asOf ? ` · latest report ${asOf}` : ""}
        </span>
      </div>
      <div className="container">
        <MandateSummaryStrip mandates={mandates} cityName={cityName ?? "The city"} now={now} />
        <div className="metrics-category-section">
          <div className="metrics-table-header">
            <div className="metric-col metric-col-name">Standard</div>
            <div className="metric-col metric-col-value">Latest</div>
            <div className="metric-col metric-col-value">Status</div>
            <div className="metric-col metric-col-change">Trend</div>
          </div>
          <div className="metrics-table-body">
            {sorted.map((m) => (
              <MandateRow key={m.metric_key} mandate={m} slug={slug} now={now} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
