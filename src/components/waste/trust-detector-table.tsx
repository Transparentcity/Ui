"use client"

import type { WasteTrustMetricsResponse } from "@/lib/apiClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface TrustDetectorTableProps {
  metrics?: WasteTrustMetricsResponse
  isLoading?: boolean
  errorMessage?: string | null
  maxRows?: number
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

export function TrustDetectorTable({
  metrics,
  isLoading = false,
  errorMessage,
  maxRows = 10,
}: TrustDetectorTableProps) {
  const rows = (metrics?.detector_precision ?? []).slice(0, maxRows)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detector Reliability</CardTitle>
        <CardDescription>
          City-level detector calibration. High hit-rate plus high precision indicates
          stronger training signal quality.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {errorMessage ? (
          <p className="text-sm text-red-700">{errorMessage}</p>
        ) : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-8 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500">
            No detector precision rows available for this city yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Detector</TableHead>
                <TableHead className="text-right">Precision</TableHead>
                <TableHead className="text-right">Confirmed</TableHead>
                <TableHead className="text-right">False+</TableHead>
                <TableHead className="text-right">Case Hits</TableHead>
                <TableHead className="text-right">Case Hit Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.detector_key}>
                  <TableCell className="font-mono text-xs text-gray-700">
                    {row.detector_key}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(row.precision_rate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.confirmed_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.false_positive_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.confirmed_case_hits}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(row.confirmed_case_hit_rate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
