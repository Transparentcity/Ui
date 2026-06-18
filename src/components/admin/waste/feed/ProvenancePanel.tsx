"use client";

import { Mono, SectionLabel, SeverityDot } from "@/components/admin/waste/primitives";
import type { Detector, Finding } from "@/lib/wasteFixtures";
import type { WasteFinding } from "@/lib/apiClient";
import {
  buildSocrataDetailsUrl,
  humanizeSocrataQuery,
  formatSoql,
  buildResearchLinks,
} from "@/components/waste/waste-finding-card";
import styles from "./feed.module.css";

type Props = {
  detector: Detector | null;
  finding: Finding | null;
  cityId?: number;
};

// Build the Socrata source query + research links for the selected finding,
// reusing the forensics drill-through helpers. The admin Finding carries the
// raw category/subcategory/entity/tool/amount needed to construct the query.
function SourceRecords({ finding, cityId }: { finding: Finding; cityId: number }) {
  const shim = {
    category: finding.category ?? "",
    subcategory: finding.subcategory ?? "",
    entity: finding.entity ?? "",
    amount: finding.amountValue ?? null,
    tool: finding.tool ?? "",
    metric: "",
    metricDetail: "",
    description: finding.detail ?? "",
  } as unknown as WasteFinding;
  const url = buildSocrataDetailsUrl(shim, cityId);
  if (!url) return null;
  const q = humanizeSocrataQuery(url);
  const { datasetUrl, webSearchUrl, cleanEntity } = buildResearchLinks(url, finding.entity);
  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>Source records &amp; query</div>
      {q && (
        <pre
          style={{
            fontFamily: "var(--font-data, monospace)",
            fontSize: "11px",
            lineHeight: 1.5,
            color: "#374151",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            padding: "8px 10px",
            margin: "0 0 8px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {formatSoql(q)}
        </pre>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "12px" }}>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#7c3aed", fontWeight: 600 }}>
          View source records ↗
        </a>
        {datasetUrl && (
          <a href={datasetUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#7c3aed", fontWeight: 600 }}>
            Open full dataset ↗
          </a>
        )}
        {webSearchUrl && (
          <a href={webSearchUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#7c3aed", fontWeight: 600 }}>
            Search the web for {cleanEntity} ↗
          </a>
        )}
      </div>
    </div>
  );
}

export function ProvenancePanel({ detector, finding, cityId = 1 }: Props) {
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
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>What it looks for</div>
          <p className={styles.cardBody}>{detector.plain}</p>
        </div>

        {detector.historical?.summary ? (
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
        ) : null}

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

        {finding && <SourceRecords finding={finding} cityId={cityId} />}

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
      </div>
    </aside>
  );
}
