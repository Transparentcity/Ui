"use client"

import type { WasteDepartmentRiskPage } from "@/lib/apiClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DepartmentTrustTableProps {
  data?: WasteDepartmentRiskPage
  isLoading?: boolean
  errorMessage?: string | null
}

function fmt(value: number): string {
  return value.toFixed(1)
}

export function DepartmentTrustTable({
  data,
  isLoading = false,
  errorMessage,
}: DepartmentTrustTableProps) {
  const rows = data?.items ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Department Risk Concentration</CardTitle>
        <CardDescription>
          Departments currently driving the most cross-domain risk concentration.
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
            No department risk profiles are available yet for this city.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Composite Risk</TableHead>
                <TableHead className="text-right">Domains Flagged</TableHead>
                <TableHead className="text-right">Findings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.department_match_name}-${row.id ?? "noid"}`}>
                  <TableCell className="font-medium text-gray-900">
                    {row.department_name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(row.composite_risk)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.domains_flagged}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.finding_count}
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
