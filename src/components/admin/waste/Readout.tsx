"use client";

import { useWasteState } from "@/lib/admin/waste/useWasteState";
import styles from "./Readout.module.css";

type Cell = { label: string; value: number; hint?: string };

function format(n: number): string {
  return n.toLocaleString("en-US");
}

export function Readout() {
  const ui = useWasteState();

  const cells: readonly Cell[] = [
    { label: "Detectors active", value: ui.detectorsActive,
      hint: ui.city.detectors != null ? `of ${ui.city.detectors} configured` : undefined },
    { label: "Findings today", value: ui.findingsToday },
    { label: "This week", value: ui.findingsThisWeek },
    { label: "In review", value: ui.inReview },
    { label: "Confirmed (30d)", value: ui.confirmed30d },
  ];

  return (
    <div className={styles.grid} role="group" aria-label="Waste KPIs">
      {cells.map(c => (
        <div key={c.label} className={styles.cell}>
          <div className={styles.label}>{c.label}</div>
          <div className={styles.value}>{format(c.value)}</div>
          {c.hint && <div className={styles.delta}>{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}
