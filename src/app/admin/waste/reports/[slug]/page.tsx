"use client";

import { Suspense, use, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Mono,
  ReportStatusChip,
  SeverityChip,
} from "@/components/admin/waste/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWasteAdminReport } from "@/lib/hooks/useWasteAdmin";
import { adaptFinding, adaptReportDetail } from "@/lib/admin/waste/adapters";
import { getWasteApiSlug } from "@/lib/admin/waste/cities";
import { reportToCsv, triggerDownload } from "@/lib/waste/report-csv";

function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} className="text-sm text-[var(--brand-primary)] hover:underline no-underline">
      ← All workpapers
    </Link>
  );
}

function ReportDetailView({ slug }: { slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const citySlug = getWasteApiSlug(params.get("city"));
  const { data, isLoading, error, refetch } = useWasteAdminReport(slug, citySlug);
  const backHref = `/admin/waste/reports?city=${encodeURIComponent(citySlug)}`;
  const notFound = (error as { status?: number } | null)?.status === 404;

  if (error) {
    return (
      <div className="px-8 py-6 space-y-3">
        <BackLink href={backHref} />
        {notFound ? (
          <>
            <p role="alert" className="text-sm text-[var(--text-secondary)]">
              No report named <Mono>{slug}</Mono> for this city. It may have been removed,
              or the link is out of date.
            </p>
            <Button variant="outline" size="sm" onClick={() => router.push(backHref)}>
              Back to reports
            </Button>
          </>
        ) : (
          <>
            <p role="alert" className="text-sm text-red-700">
              Couldn&apos;t load report: {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </>
        )}
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="px-8 py-6 space-y-3">
        <BackLink href={backHref} />
        <p className="text-sm text-[var(--text-tertiary)]">Loading report…</p>
      </div>
    );
  }

  const report = adaptReportDetail(data);
  const reportFindings = [...(data.findings ?? [])]
    .sort((a, b) => {
      const av = a.estimated_dollar_impact ?? a.amount ?? 0;
      const bv = b.estimated_dollar_impact ?? b.amount ?? 0;
      return bv - av;
    })
    .map(adaptFinding);
  const status = report.status;
  const isDraft = status === "draft";

  const kpis: { label: string; value: ReactNode }[] = [
    { label: "Findings", value: report.findings },
    { label: "Exposure", value: report.exposure },
    { label: "Materiality", value: report.materiality },
    { label: "Detectors", value: report.detectors.length },
  ];

  return (
    <div className="px-8 py-6 space-y-6" data-testid="waste-report-detail" data-status={status}>
      <Card className="p-6">
        <BackLink href={backHref} />
        <div className="mt-3 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ReportStatusChip status={status} />
              <Mono>{report.slug}</Mono>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">{report.title}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Period: {report.period} · Updated {report.updated}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerDownload(`${report.slug}.csv`, "text/csv;charset=utf-8", reportToCsv(data))}
            >
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                triggerDownload(`${report.slug}.json`, "application/json", JSON.stringify(data, null, 2))
              }
            >
              Export JSON
            </Button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3">
              <div className="text-xs text-[var(--text-tertiary)]">{k.label}</div>
              <div className="mt-1 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">{k.value}</div>
            </div>
          ))}
        </div>
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Methodology</h2>
        {report.standards ? (
          <div className="mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Standards basis</div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{report.standards}</p>
          </div>
        ) : null}

        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Calculation method</div>
        <div className="mt-1.5">
          {isDraft && report.methodology ? (
            <div
              className="rounded-r border-l-2 border-teal-400 bg-teal-50/50 px-3 py-2"
              data-testid="methodology-draft"
            >
              <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" aria-hidden="true" />
                Seymour
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{report.methodology}</p>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]" data-testid="methodology-final">
              {report.methodology || "—"}
            </p>
          )}
        </div>

        {report.caveats ? (
          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Caveats</div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{report.caveats}</p>
          </div>
        ) : null}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Findings · ranked by exposure</h2>
          <Mono>{reportFindings.length} of {report.findings} shown</Mono>
        </div>
        <div className="space-y-3">
          {reportFindings.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">No findings under this report yet.</p>
          ) : (
            reportFindings.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <SeverityChip level={f.severity} />
                  <Mono>{f.id}</Mono>
                  <span className="inline-flex items-center rounded-md border border-purple-200 bg-[var(--brand-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--brand-primary)]">
                    {f.detectorId}
                  </span>
                  <span className="flex-1" />
                  <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{f.amount}</span>
                </div>
                <div className="mt-2 font-semibold text-[var(--text-primary)]">{f.headline}</div>
                <div className="text-sm text-[var(--text-tertiary)]">{f.subject} · {f.department}</div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{f.detail}</p>
              </Card>
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
    <Suspense fallback={<div className="px-8 py-6" />}>
      <ReportDetailView slug={slug} />
    </Suspense>
  );
}
