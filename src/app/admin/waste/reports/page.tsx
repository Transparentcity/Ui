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
      <div className="flex items-start justify-between gap-4 mb-4">
        <p className="text-sm text-gray-500">
          Per-period reports compiled from confirmed findings, grouped by detector class.
        </p>
        <Button size="sm" className="shrink-0">+ New workpaper</Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
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
                <TableCell colSpan={6} className="text-gray-500">
                  Loading reports…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="text-gray-700">No reports yet for this city.</div>
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
                        className="font-medium text-gray-900 hover:text-purple-700 no-underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.title}
                      </Link>
                      <div className="mt-0.5">
                        <Mono>materiality {r.materiality}</Mono>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600">{r.period}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.findings}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.exposure}</TableCell>
                    <TableCell className="text-gray-600">{r.updated}</TableCell>
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
    <Suspense fallback={<div className="px-8 py-6" />}>
      <ReportsView />
    </Suspense>
  );
}
