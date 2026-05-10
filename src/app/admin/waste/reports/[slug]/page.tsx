"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  Button,
  Mono,
  ReportStatusChip,
  SeverityChip,
} from "@/components/admin/waste/primitives";
import { useWasteAdminReport } from "@/lib/hooks/useWasteAdmin";
import {
  adaptFinding,
  adaptReportDetail,
} from "@/lib/admin/waste/adapters";
import styles from "./reportDetail.module.css";

function ReportDetailView({ slug }: { slug: string }) {
  const params = useSearchParams();
  const citySlug = params.get("city") ?? "san-francisco";
  const { data, isLoading, error, refetch } = useWasteAdminReport(slug, citySlug);

  if (error) {
    return (
      <div className={styles.page}>
        <Link href={`/admin/waste/reports?city=${encodeURIComponent(citySlug)}`} className={styles.backBtn}>
          ← All workpapers
        </Link>
        <p role="alert">
          Couldn&apos;t load report: {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className={styles.page}>
        <Link href={`/admin/waste/reports?city=${encodeURIComponent(citySlug)}`} className={styles.backBtn}>
          ← All workpapers
        </Link>
        <p>Loading report…</p>
      </div>
    );
  }

  const report = adaptReportDetail(data);
  const reportFindings = data.findings.map(adaptFinding);
  const status = report.status;
  const isFinal = status === "final";
  const isDraft = status === "draft";
  const backHref = `/admin/waste/reports?city=${encodeURIComponent(citySlug)}`;

  return (
    <div className={styles.page} data-testid="waste-report-detail" data-status={status}>
      <div className={`${styles.hero} ${isFinal ? styles.heroFinal : styles.heroDraft}`}>
        <Link href={backHref} className={styles.backBtn}>← All workpapers</Link>
        <div className={styles.heroRow}>
          <div className={styles.heroLeft}>
            <div className={styles.idLine}>
              <ReportStatusChip status={status} />
              <Mono>{report.slug}</Mono>
            </div>
            <h1 className={styles.heroTitle}>{report.title}</h1>
            <Mono color="#374151">Period: {report.period} · Updated {report.updated}</Mono>
          </div>
          <div className={styles.heroActions}>
            <Button variant="secondary" size="sm">Export CSV</Button>
            <Button variant="secondary" size="sm">Export JSON</Button>
            {!isFinal && <Button variant="primary" size="sm">Promote to final →</Button>}
          </div>
        </div>
        <div className={styles.kpiGrid}>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>Findings</div>
            <div className={styles.kpiValue}>{report.findings}</div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>Exposure</div>
            <div className={styles.kpiValue}>{report.exposure}</div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>Materiality</div>
            <div className={styles.kpiValue}>{report.materiality}</div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>Detectors</div>
            <div className={styles.kpiValueSmall}>{report.detectors.length}</div>
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Methodology</h2>
        {report.standards ? (
          <>
            <Mono color="#9ca3af">Standards basis</Mono>
            <p className={styles.subhead}>{report.standards}</p>
          </>
        ) : null}

        <Mono color="#9ca3af">Calculation method</Mono>
        <div style={{ marginTop: 6 }}>
          {isDraft && report.methodology ? (
            <div className={styles.seymourBlock} data-testid="methodology-draft">
              <div className={styles.seymourHeader}>
                <span className={styles.seymourBadge}>
                  <span className={styles.seymourBadgeDot} />
                  Seymour
                </span>
              </div>
              <p className={styles.seymourText}>{report.methodology}</p>
            </div>
          ) : (
            <p className={styles.bodyText} data-testid="methodology-final">
              {report.methodology || "—"}
            </p>
          )}
        </div>

        {report.caveats ? (
          <>
            <Mono color="#9ca3af">Caveats</Mono>
            <p className={styles.caveatText}>{report.caveats}</p>
          </>
        ) : null}
      </section>

      <section className={styles.findingsSection}>
        <div className={styles.findingsHeader}>
          <h2 className={styles.sectionTitle}>Findings · ranked by exposure</h2>
          <Mono>{reportFindings.length} of {report.findings} shown</Mono>
        </div>
        <div className={styles.findingsList}>
          {reportFindings.length === 0 ? (
            <p>No findings under this report yet.</p>
          ) : (
            reportFindings.map(f => (
              <div key={f.id} className={styles.findingRow}>
                <div className={styles.findingTopLine}>
                  <SeverityChip level={f.severity} />
                  <Mono color="#9ca3af">{f.id}</Mono>
                  <span className={styles.detectorTag}>{f.detectorId}</span>
                  <span className={styles.spacer} />
                  <span className={styles.findingAmount}>{f.amount}</span>
                </div>
                <div className={styles.findingHeadline}>{f.headline}</div>
                <div className={styles.findingSubject}>{f.subject} · {f.department}</div>
                <p className={styles.findingDetail}>{f.detail}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default function WasteReportDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <ReportDetailView slug={slug} />
    </Suspense>
  );
}
