"use client"

import type { WasteTrustMetricsResponse } from "@/lib/apiClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface TrustMetricsSnapshotProps {
  metrics?: WasteTrustMetricsResponse
  isLoading?: boolean
  errorMessage?: string | null
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatScore(value: number): string {
  return value.toFixed(1)
}

export function TrustMetricsSnapshot({
  metrics,
  isLoading = false,
  errorMessage,
}: TrustMetricsSnapshotProps) {
  if (errorMessage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trust Snapshot</CardTitle>
          <CardDescription>Unable to load trust metrics right now.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-700">{errorMessage}</p>
        </CardContent>
      </Card>
    )
  }

  if (isLoading || !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trust Snapshot</CardTitle>
          <CardDescription>Loading model trust signals...</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="rounded-md border border-gray-200 p-3">
              <div className="mb-2 h-3 w-24 animate-pulse rounded bg-gray-100" />
              <div className="h-6 w-16 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trust Snapshot</CardTitle>
        <CardDescription>
          Quick confidence checks for scoring saturation and calibration quality.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-gray-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entities &gt;=95
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatPct(metrics.saturation.pct_gte_95)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entities =100
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatPct(metrics.saturation.pct_eq_100)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Median / P95 Score
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatScore(metrics.score_distribution.p50)} /{" "}
            {formatScore(metrics.score_distribution.p95)}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Confirmed Positives
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {metrics.confirmed_case_total_findings.toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
