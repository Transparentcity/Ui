"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button, Mono, ReportStatusChip } from "@/components/admin/waste/primitives";
import { REPORTS, type ReportStatus } from "@/lib/wasteFixtures";
import styles from "./reports.module.css";

type DemoMode = "actual" | "draft" | "final";

export default function WasteReportsPage() {
  const [demoMode, setDemoMode] = useState<DemoMode>("actual");

  const rows = useMemo(() => {
    if (demoMode === "actual") return REPORTS;
    const overrideStatus: ReportStatus = demoMode;
    return REPORTS.map(r => ({ ...r, status: overrideStatus }));
  }, [demoMode]);

  return (
    <div className={styles.page} data-testid="waste-reports-page">
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Audit workpapers</h2>
          <p className={styles.subtitle}>
            Per-period reports compiled from confirmed findings, grouped by detector class.
          </p>
        </div>
        <Button variant="primary" size="sm">+ New workpaper</Button>
      </div>

      <div className={styles.toggleBar} data-testid="reports-demo-toggle">
        <span className={styles.toggleLabel}>Demo state</span>
        {(["actual", "draft", "final"] as DemoMode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setDemoMode(m)}
            className={`${styles.toggleBtn} ${demoMode === m ? styles.toggleBtnActive : ""}`}
            data-active={demoMode === m}
          >
            {m === "actual" ? "Actual" : m === "draft" ? "All draft" : "All final"}
          </button>
        ))}
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Title</span>
          <span>Period</span>
          <span>Findings</span>
          <span>Exposure</span>
          <span>Updated</span>
          <span>Status</span>
        </div>
        {rows.map(r => {
          const href =
            demoMode === "actual"
              ? `/admin/waste/reports/${r.slug}`
              : `/admin/waste/reports/${r.slug}?mode=${demoMode}`;
          return (
            <Link key={r.slug} href={href} className={styles.row} data-slug={r.slug}>
              <div className={styles.titleCell}>
                <div className={styles.titleText}>{r.title}</div>
                <Mono>{r.detectors.length} detectors · materiality {r.materiality}</Mono>
              </div>
              <span className={styles.periodCell}>{r.period}</span>
              <span className={styles.numCell}>{r.findings}</span>
              <span className={styles.numCell}>{r.exposure}</span>
              <span className={styles.updatedCell}>{r.updated}</span>
              <ReportStatusChip status={r.status} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
