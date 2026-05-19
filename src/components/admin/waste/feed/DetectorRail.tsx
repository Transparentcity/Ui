"use client";

import { Mono, SectionLabel, SeverityDot } from "@/components/admin/waste/primitives";
import { DETECTOR_CATEGORIES, type Detector } from "@/lib/wasteFixtures";
import styles from "./feed.module.css";

type Props = {
  detectors: readonly Detector[];
  selectedDetectorId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  isSparse: boolean;
};

export function DetectorRail({ detectors, selectedDetectorId, onSelect, query, onQueryChange, isSparse }: Props) {
  const q = query.trim().toLowerCase();
  const filtered = detectors.filter(d =>
    !q || d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
  );

  return (
    <aside className={styles.detectorRail}>
      <SectionLabel right={<Mono>{filtered.length} active</Mono>}>Detector catalog</SectionLabel>
      <div className={styles.detectorSearch}>
        <input
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Search detectors, IDs…"
          className={styles.detectorInput}
          aria-label="Search detectors"
        />
      </div>
      <div className={styles.detectorScroll}>
        {DETECTOR_CATEGORIES.map(cat => {
          const items = filtered.filter(d => d.category === cat.id);
          if (!items.length) return null;
          return (
            <div key={cat.id}>
              <div className={styles.catHeader}>
                <span className={styles.catLabel}>{cat.label}</span>
                <Mono>{isSparse ? `${items.length}/${cat.count}` : cat.count}</Mono>
              </div>
              {items.map(d => {
                const isSel = selectedDetectorId === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onSelect(d.id)}
                    className={`${styles.detectorBtn} ${isSel ? styles.detectorBtnSel : ""}`}
                    aria-pressed={isSel}
                  >
                    <div className={styles.detectorBtnTop}>
                      <SeverityDot level={d.severity} />
                      <Mono color="#9ca3af">{d.id}</Mono>
                    </div>
                    <div className={styles.detectorBtnName}>{d.name}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
