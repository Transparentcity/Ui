"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button, Mono, ReportStatusChip } from "@/components/admin/waste/primitives";
import { useWasteAdminReports } from "@/lib/hooks/useWasteAdmin";
import { adaptReportRow } from "@/lib/admin/waste/adapters";
import { getWasteApiSlug } from "@/lib/admin/waste/cities";
import styles from "./reports.module.css";

function ReportsView() {
  const params = useSearchParams();
  const citySlug = getWasteApiSlug(params.get("city"));
  const { data, isLoading, error, refetch } = useWasteAdminReports(citySlug);

  const rows = useMemo(() => (data ?? []).map(adaptReportRow), [data]);

  if (error) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Audit workpapers</h2>
        <p role="alert" className={styles.subtitle}>
          Couldn&apos;t load reports: {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="waste-reports-page">
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Audit workpapers</h2>
          <p className={styles.subtitle}>
            Per-period reports compiled from confirmed findings, grouped by detector class.
          </p>
        </div>
        <Button variant="primary" size="sm" disabled title="Coming soon">+ New workpaper</Button>
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

        {isLoading ? (
          <div className={styles.row} role="status" aria-live="polite">
            <div className={styles.titleCell}>
              <div className={styles.titleText}>Loading reports…</div>
            </div>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.row}>
            <div className={styles.titleCell}>
              <div className={styles.titleText}>No reports yet for this city.</div>
              <Mono>Reports populate as findings accumulate.</Mono>
            </div>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : (
          rows.map(r => {
            const href = `/admin/waste/reports/${encodeURIComponent(r.slug)}?city=${encodeURIComponent(citySlug)}`;
            return (
              <Link key={r.slug} href={href} className={styles.row} data-slug={r.slug}>
                <div className={styles.titleCell}>
                  <div className={styles.titleText}>{r.title}</div>
                  <Mono>materiality {r.materiality}</Mono>
                </div>
                <span className={styles.periodCell}>{r.period}</span>
                <span className={styles.numCell}>{r.findings}</span>
                <span className={styles.numCell}>{r.exposure}</span>
                <span className={styles.updatedCell}>{r.updated}</span>
                <ReportStatusChip status={r.status} />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function WasteReportsPage() {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <ReportsView />
    </Suspense>
  );
}
