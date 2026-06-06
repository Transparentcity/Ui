"use client";

import { Button, Mono, SectionLabel, SeverityDot } from "@/components/admin/waste/primitives";
import type { Detector, Finding } from "@/lib/wasteFixtures";
import styles from "./feed.module.css";

type Props = {
  detector: Detector | null;
  finding: Finding | null;
};

export function ProvenancePanel({ detector, finding }: Props) {
  if (!detector) {
    return (
      <aside className={styles.provenance} aria-label="Provenance panel">
        <SectionLabel>How this was caught</SectionLabel>
        <div className={styles.provenanceScroll}>
          <p className={styles.cardBody}>Select a detector to see how it works.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.provenance} aria-label="Provenance panel">
      <SectionLabel right={<Mono>{detector.id}</Mono>}>How this was caught</SectionLabel>
      <div className={styles.provenanceScroll}>
        <div className={styles.provHeaderBlock}>
          <div className={styles.provDetectorLabelRow}>
            <SeverityDot level={detector.severity} />
            <span className={styles.eyebrow}>Detector</span>
          </div>
          <h3 className={styles.provDetectorName}>{detector.name}</h3>
          <Mono>Last tuned {detector.lastTuned} · precision {Math.round(detector.precision * 100)}%</Mono>
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>What it looks for</div>
          <p className={styles.cardBody}>{detector.plain}</p>
        </div>

        <div className={styles.tunedCard}>
          <div className={styles.tunedAccent} />
          <div className={styles.tunedHeader}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" aria-hidden>
              <path d="M3 7v6h6" />
              <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
            </svg>
            <span className={styles.tunedHeaderText}>Tuned on this case</span>
          </div>
          <div className={styles.tunedCase}>{detector.historical.case}</div>
          <p className={styles.tunedSummary}>{detector.historical.summary}</p>
          <div className={styles.tunedLesson}>&ldquo;{detector.historical.lesson}&rdquo;</div>
        </div>

        {finding && (
          <div className={styles.card}>
            <div className={styles.cardLabel}>Lineage · this finding</div>
            <div className={styles.lineageList}>
              <div className={styles.lineageRow}>
                <span className={styles.lineageKey}>Flagged</span>
                <span className={styles.lineageValue}>{finding.flagged}</span>
              </div>
              <div className={styles.lineageRow}>
                <span className={styles.lineageKey}>Inputs</span>
                <span className={styles.lineageValue}>{detector.sources.length} sources</span>
              </div>
              <div className={styles.lineageRow}>
                <span className={styles.lineageKey}>Status</span>
                <span className={styles.lineageValue}>{finding.status}</span>
              </div>
            </div>
          </div>
        )}

        <div className={styles.sourcesBlock}>
          <div className={styles.cardLabel}>Data sources joined</div>
          <div className={styles.sourcesList}>
            {detector.sources.map(s => (
              <div key={s} className={styles.sourceRow}>
                <span className={styles.sourceDot} />
                {s}
              </div>
            ))}
          </div>
        </div>

        {finding && (
          <div className={styles.actionRow}>
            <Button variant="primary" size="sm" disabled title="Coming soon">Open case →</Button>
            <Button variant="secondary" size="sm" disabled title="Coming soon">Mark in review</Button>
            <Button variant="ghost" size="sm" disabled title="Coming soon">Dismiss</Button>
          </div>
        )}
      </div>
    </aside>
  );
}
