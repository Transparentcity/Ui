"use client"

import { useState, useMemo } from "react"
import { useWasteInvestigations } from "@/lib/hooks/useWaste"
import { useCities } from "@/lib/hooks/useCities"
import { WasteShell } from "./waste-shell"
import { SeverityBadge } from "./severity-badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

const STATUS_BADGE: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  pending_response: "bg-orange-100 text-orange-700",
  closed: "bg-gray-100 text-gray-600",
}

export function InvestigationsListPage() {
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [statusFilter, setStatusFilter] = useState<string>("")

  const citiesQuery = useCities({ includeInactive: false })
  const selectedCityId = useMemo(() => {
    const eligible = (citiesQuery.data ?? []).filter((c) => (c.datasets_count ?? 0) > 0)
    return eligible.length > 0 ? Number(eligible[0].city_id) : null
  }, [citiesQuery.data])

  const { data, isLoading, error } = useWasteInvestigations({
    cityId: selectedCityId,
    status: statusFilter || undefined,
    page,
    perPage,
  })

  const totalPages = data ? Math.ceil(data.total / perPage) : 0

  return (
    <WasteShell title="Investigations" description="All waste and fraud investigations">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1) }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="pending_response">Pending Response</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        {data && (
          <span className="text-sm text-gray-500 ml-auto">
            {data.total} investigation{data.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error instanceof Error ? error.message : "Failed to load investigations"}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Lead Auditor</TableHead>
              <TableHead>Finding</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                  No investigations found
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/waste/investigations/${inv.id}`}
                      className="text-purple-600 hover:text-purple-800 hover:underline"
                    >
                      {inv.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                        STATUS_BADGE[inv.status] ?? STATUS_BADGE.open
                      )}
                    >
                      {inv.status.replace("_", " ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-600">{inv.lead_auditor ?? "—"}</TableCell>
                  <TableCell>
                    {inv.finding ? (
                      <div className="flex items-center gap-1">
                        <SeverityBadge severity={inv.finding.severity} />
                        <span className="text-xs text-gray-500 truncate max-w-[120px]">
                          {inv.finding.entity}
                        </span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-gray-400">
                    {inv.opened_at ? new Date(inv.opened_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/waste/investigations/${inv.id}`}>
                      <ExternalLink className="w-4 h-4 text-gray-400 hover:text-purple-600" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </WasteShell>
  )
}
