"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Mono, ReportStatusChip } from "@/components/admin/waste/primitives";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { useWasteAdminReports } from "@/lib/hooks/useWasteAdmin";
import { adaptReportRow } from "@/lib/admin/waste/adapters";
import { getWasteApiSlug } from "@/lib/admin/waste/cities";
import { WasteLoading } from "@/components/admin/waste/WasteLoading";

function ReportsView() {
  const router = useRouter();
  const params = useSearchParams();
  const citySlug = getWasteApiSlug(params.get("city"));
  const { data, isLoading, error, refetch } = useWasteAdminReports(citySlug);

  const rows = useMemo(() => (data ?? []).map(adaptReportRow), [data]);

  if (error) {
    return (
      <div className="px-8 py-6">
        <p role="alert" className="text-sm text-red-700">
          Couldn&apos;t load reports: {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="px-8 py-6" data-testid="waste-reports-page">
      <div className="mb-4">
        <p className="text-sm text-[var(--text-tertiary)]">
          Per-period reports compiled from confirmed findings, grouped by detector class.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Findings</TableHead>
              <TableHead className="text-right">Exposure</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-[var(--text-tertiary)]">
                  Loading reports…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="text-[var(--text-secondary)]">No reports yet for this city.</div>
                  <Mono>Reports populate as findings accumulate.</Mono>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const href = `/admin/waste/reports/${encodeURIComponent(r.slug)}?city=${encodeURIComponent(citySlug)}`;
                return (
                  <TableRow
                    key={r.slug}
                    data-slug={r.slug}
                    className="cursor-pointer"
                    onClick={() => router.push(href)}
                  >
                    <TableCell>
                      <Link
                        href={href}
                        className="font-medium text-[var(--text-primary)] hover:text-[var(--brand-primary)] no-underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.title}
                      </Link>
                      <div className="mt-0.5">
                        <Mono>materiality {r.materiality}</Mono>
                      </div>
                    </TableCell>
                    <TableCell className="text-[var(--text-secondary)]">{r.period}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.findings}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.exposure}</TableCell>
                    <TableCell className="text-[var(--text-secondary)]">{r.updated}</TableCell>
                    <TableCell>
                      <ReportStatusChip status={r.status} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function WasteReportsPage() {
  return (
    <Suspense fallback={<WasteLoading />}>
      <ReportsView />
    </Suspense>
  );
}
