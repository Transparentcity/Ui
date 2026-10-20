import React from "react";
import type { MandateCompliance, MandateStandard } from "@/lib/publicApiClient";
import {
  formatMandateTarget,
  formatMandateValue,
  formatMandatePeriod,
  mandateStatus,
  mandateStreakText,
} from "@/lib/mandates";
import { MandateStatusPill } from "./MandateScorecard";
import styles from "./Mandates.module.css";

/**
 * "Legal standard" section on a metric page: the standard, its citation, the
 * current status (when compliance is available to this viewer), who is
 * responsible, the mandated report, consequences of missing it, and a method
 * note. Renders nothing when the metric has no standard.
 */
export default function LegalStandardPanel({
  standard,
  standardsBasis,
  compliance,
  scorecardHref,
  now,
}: {
  standard: MandateStandard | null | undefined;
  standardsBasis?: string | null;
  /** Compliance from the mandates API; omitted while dark-launched for non-admins. */
  compliance?: MandateCompliance | null;
  /** Link to the city's legal standards scorecard. */
  scorecardHref?: string | null;
  /** Clock for the staleness rule (tests). */
  now?: Date;
}) {
  if (!standard) return null;

  const target = formatMandateTarget(standard);
  const status = compliance ? mandateStatus(compliance, standard.grain, now) : null;
  const kind = status?.kind ?? null;
  const streak =
    compliance && kind !== "no_data" ? mandateStreakText(compliance, standard.grain) : null;
  const latestPeriod = compliance
    ? formatMandatePeriod(compliance.latest_period, standard.grain)
    : null;
  const officials = [standard.owner_department, standard.owner_official].filter(Boolean);

  return (
    <section id="legal-standard" className="metric-section metric-definition">
      <h2 className="metric-section-title">Legal standard</h2>

      {kind && (
        <div className={styles.panelStatusRow}>
          <MandateStatusPill kind={kind} />
          {compliance?.latest_value != null && (
            <span>
              {formatMandateValue(compliance.latest_value, standard.unit)}
              {latestPeriod ? ` in ${latestPeriod}` : ""}
            </span>
          )}
          {streak && <span className={styles.streak}>{streak}</span>}
          {status?.stale && latestPeriod && (
            <span className={styles.stalePeriod}>Last report {latestPeriod}; a newer one is overdue</span>
          )}
        </div>
      )}

      <div className="provenance-item">
        <h3 className="provenance-label">Standard</h3>
        <p className="provenance-value">
          <span className={styles.panelStandard}>{standard.text}</span>
          {target && (
            <>
              <br />
              <span style={{ color: "var(--text-secondary)" }}>Target: {target}</span>
            </>
          )}
        </p>
      </div>

      {(standard.citation || standardsBasis) && (
        <div className="provenance-item">
          <h3 className="provenance-label">Legal source</h3>
          {standard.citation && <p className="provenance-value">{standard.citation}</p>}
          {standardsBasis && standardsBasis.trim() !== standard.citation?.trim() && (
            <p className="provenance-value">{standardsBasis}</p>
          )}
        </div>
      )}

      {(officials.length > 0 || standard.owner_contact) && (
        <div className="provenance-item">
          <h3 className="provenance-label">Responsible</h3>
          {officials.map((o) => (
            <p key={o} className="provenance-value">
              {o}
            </p>
          ))}
          {standard.owner_contact && (
            <p className="provenance-value">Contact: {standard.owner_contact}</p>
          )}
        </div>
      )}

      {standard.report_url && (
        <div className="provenance-item">
          <h3 className="provenance-label">Mandated report</h3>
          <p className="provenance-value">
            <a
              href={standard.report_url}
              target="_blank"
              rel="noopener noreferrer"
              className="provenance-link-inline"
            >
              {standard.report_name || standard.report_url}
            </a>
          </p>
        </div>
      )}

      {(standard.sanctions || standard.past_enforcement) && (
        <div className="provenance-item">
          <h3 className="provenance-label">
            Consequences of missing it
            {standard.sanction_severity ? ` (${standard.sanction_severity.toLowerCase()} severity)` : ""}
          </h3>
          {standard.sanctions && <p className="provenance-value">{standard.sanctions}</p>}
          {standard.past_enforcement && (
            <p className="provenance-value">
              <span style={{ color: "var(--text-secondary)" }}>Past enforcement: </span>
              {standard.past_enforcement}
            </p>
          )}
        </div>
      )}

      {standard.method_note && (
        <div className="provenance-item">
          <h3 className="provenance-label">Method note</h3>
          <p className="provenance-value">{standard.method_note}</p>
        </div>
      )}

      {scorecardHref && (
        <p className="provenance-value">
          <a href={scorecardHref} className="provenance-link-inline">
            See all of the city&rsquo;s legal standards →
          </a>
        </p>
      )}
    </section>
  );
}
