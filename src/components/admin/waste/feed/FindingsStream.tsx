"use client";

import { ConfidenceBar, Mono, SeverityChip, StatusChip } from "@/components/admin/waste/primitives";
import type { Detector, Finding } from "@/lib/wasteFixtures";
import styles from "./feed.module.css";

export type FindingsFilter = "all" | "high" | "med";
export type FindingsPeriod = "today" | "week" | "month";

type Props = {
  findings: readonly Finding[];
  detectorById: Record<string, Detector>;
  selectedFindingId: string | null;
  onSelect: (id: string) => void;
  filter: FindingsFilter;
  onFilterChange: (f: FindingsFilter) => void;
  period: FindingsPeriod;
  onPeriodChange: (p: FindingsPeriod) => void;
  isQuiet: boolean;
  isDegraded: boolean;
  detectorCount?: number;
  degradedCount?: number;
  degradedDetectorId?: string | null;
};

const FILTER_LABEL: Record<FindingsFilter, string> = {
  all: "All",
  high: "High only",
  med: "Medium+",
};

export function FindingsStream({
  findings, detectorById, selectedFindingId, onSelect,
  filter, onFilterChange, period, onPeriodChange, isQuiet, isDegraded,
  detectorCount, degradedCount, degradedDetectorId,
}: Props) {
  return (
    <main className={styles.findingsStream}>
      <div className={styles.findingsToolbar}>
        <span className={styles.toolbarLabel}>Findings</span>
        <div className={styles.chipGroup} role="group" aria-label="Severity filter">
          {(["all", "high", "med"] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => onFilterChange(f)}
              className={`${styles.chip} ${filter === f ? styles.chipActive : ""}`}
              aria-pressed={filter === f}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        <span className={styles.toolbarDivider} />
        <div className={styles.chipGroup} role="group" aria-label="Period filter">
          {(["today", "week", "month"] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={`${styles.chip} ${period === p ? styles.chipActive : ""}`}
              aria-pressed={period === p}
            >
              {p}
            </button>
          ))}
        </div>
        <span className={styles.toolbarSpacer} />
        <button type="button" className={styles.bulkBtn} disabled title="Coming soon">
          Bulk · assign
        </button>
      </div>

      {isDegraded && (
        <div className={styles.degradedBanner} role="status">
          {degradedCount && degradedCount > 0
            ? `${degradedCount} detector${degradedCount === 1 ? "" : "s"} failing`
            : "Pipeline degraded"}
          {degradedDetectorId ? ` — ${degradedDetectorId} stale` : ""}. Findings shown may be
          incomplete.
        </div>
      )}

      <div className={styles.findingsScroll}>
        {isQuiet ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>Quiet day.</div>
            <p className={styles.emptyBody}>
              {detectorCount ? `All ${detectorCount} detectors` : "All detectors"} ran clean for{" "}
              {period}. Seymour will surface anything new on the next scheduled run.
            </p>
          </div>
        ) : findings.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No findings match.</div>
            <p className={styles.emptyBody}>Try widening the filter or period.</p>
          </div>
        ) : (
          findings.map(f => {
            const det = detectorById[f.detectorId];
            const isSel = selectedFindingId === f.id;
            return (
              <article
                key={f.id}
                onClick={() => onSelect(f.id)}
                className={`${styles.findingRow} ${isSel ? styles.findingRowSel : ""}`}
              >
                <div className={styles.findingHeaderRow}>
                  <SeverityChip level={f.severity} />
                  <StatusChip status={f.status} />
                  <Mono color="#9ca3af">{f.id}</Mono>
                  <span className={styles.toolbarSpacer} />
                  <Mono>{f.flagged}</Mono>
                </div>
                <h3 className={styles.findingTitle}>{f.headline}</h3>
                <div className={styles.findingMetaRow}>
                  <span className={styles.findingSubject}>{f.subject}</span>
                  <span className={styles.findingDot}>·</span>
                  <span className={styles.findingDept}>{f.department}</span>
                  {f.amount !== "—" && (
                    <>
                      <span className={styles.findingDot}>·</span>
                      <span className={styles.findingAmount}>{f.amount}</span>
                    </>
                  )}
                </div>
                <p className={styles.findingDetail}>{f.detail}</p>
                <div className={styles.findingFooter}>
                  <div className={styles.findingFooterLeft}>
                    {det && (
                      <>
                        <Mono color="#7c3aed">{det.id}</Mono>
                        <span className={styles.findingDetectorName}>{det.name}</span>
                      </>
                    )}
                  </div>
                  <ConfidenceBar value={f.confidence} />
                </div>
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}
