"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  useLatestPersistedWasteResult,
} from "@/lib/hooks/useWaste"
import type { WasteFinding } from "@/lib/apiClient"
import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import {
  normalizeWasteCategory,
  formatDollar,
  getWasteCategoryLabel,
} from "./waste-utils"
import { TCScoreBadge } from "./tc-score-badge"
import { useWasteCity } from "./WasteCityContext"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  Search,
  Filter,
  X,
  Layers,
  Building2,
  Users,
  FileSearch,
} from "lucide-react"

// ── Helpers ─────────────────────────────────────────────────────────────────

function severityBadge(severity: string) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-green-100 text-green-700",
  }
  return colors[severity?.toLowerCase()] ?? "bg-gray-100 text-gray-600"
}

// ── Filters ─────────────────────────────────────────────────────────────────

interface Filters {
  severity: string
  category: string
  department: string
  entity: string
}

const EMPTY_FILTERS: Filters = {
  severity: "",
  category: "",
  department: "",
  entity: "",
}

function FilterBar({
  filters,
  onChange,
  departments,
  categories,
}: {
  filters: Filters
  onChange: (f: Filters) => void
  departments: string[]
  categories: string[]
}) {
  const hasFilters = Object.values(filters).some(Boolean)
  const chips = [
    filters.severity ? `Severity: ${filters.severity}` : null,
    filters.category ? `Category: ${getWasteCategoryLabel(filters.category)}` : null,
    filters.department ? `Department: ${filters.department}` : null,
    filters.entity ? `Entity: ${filters.entity}` : null,
  ].filter(Boolean) as string[]
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 flex-wrap mb-2">
      <Filter className="w-4 h-4 text-gray-500 shrink-0" />
      <select
        value={filters.severity}
        onChange={(e) => onChange({ ...filters, severity: e.target.value })}
        className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
      >
        <option value="">All Severities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select
        value={filters.category}
        onChange={(e) => onChange({ ...filters, category: e.target.value })}
        className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {getWasteCategoryLabel(c)}
          </option>
        ))}
      </select>
      <select
        value={filters.department}
        onChange={(e) => onChange({ ...filters, department: e.target.value })}
        className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
      >
        <option value="">All Departments</option>
        {departments.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <div className="relative">
        <input
          type="text"
          value={filters.entity}
          onChange={(e) => onChange({ ...filters, entity: e.target.value })}
          placeholder="Search entity..."
          className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 w-36 pl-7"
        />
        <Search className="w-3 h-3 text-gray-500 absolute left-2 top-1/2 -translate-y-1/2" />
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
      </div>
      {chips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {chips.map((chip) => (
            <span
              key={chip}
              className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Category Breakdown ──────────────────────────────────────────────────────

function CategoryBreakdown({ findings }: { findings: WasteFinding[] }) {
  const byCat = useMemo(() => {
    const counts: Record<string, number> = {}
    findings.forEach((f) => {
      const cat = normalizeWasteCategory(f.category)
      counts[cat] = (counts[cat] ?? 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [findings])

  const bySev = useMemo(() => {
    const counts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    }
    findings.forEach((f) => {
      const sev = f.severity?.toLowerCase() ?? "low"
      if (sev in counts) counts[sev]++
    })
    return Object.entries(counts).filter(([, v]) => v > 0)
  }, [findings])

  const maxCat = byCat.length > 0 ? byCat[0][1] : 1
  const maxSev = bySev.length > 0 ? Math.max(...bySev.map(([, v]) => v)) : 1

  const catColors: Record<string, string> = {
    payroll: "bg-indigo-500",
    contracts: "bg-orange-500",
    infrastructure: "bg-teal-500",
    influence: "bg-pink-500",
    integrity: "bg-purple-500",
    confirmed: "bg-red-500",
    convergence: "bg-yellow-500",
  }

  const sevColors: Record<string, string> = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-amber-500",
    low: "bg-green-500",
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          By Category
        </h3>
        <div className="space-y-2">
          {byCat.map(([cat, count]) => (
            <Link
              key={cat}
              href={`/waste/forensics/categories/${cat}`}
              className="flex items-center gap-2 no-underline hover:bg-gray-50 rounded px-1 py-0.5"
            >
              <span className="text-xs text-gray-600 w-24 truncate capitalize">
                {getWasteCategoryLabel(cat)}
              </span>
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    catColors[cat] ?? "bg-gray-400"
                  )}
                  style={{
                    width: `${Math.round((count / maxCat) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 tabular-nums w-8 text-right">
                {count}
              </span>
            </Link>
          ))}
        </div>
        <Link
          href="/waste/forensics/categories"
          className="mt-3 flex items-center gap-1 text-xs font-medium text-purple-600 no-underline hover:text-purple-700"
        >
          Drill into categories <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          By Severity
        </h3>
        <div className="space-y-2">
          {bySev.map(([sev, count]) => (
            <div key={sev} className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-16 capitalize">
                {sev}
              </span>
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    sevColors[sev] ?? "bg-gray-400"
                  )}
                  style={{
                    width: `${Math.round((count / maxSev) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 tabular-nums w-8 text-right">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Convergence Map ─────────────────────────────────────────────────────────

function ConvergenceSection({ findings }: { findings: WasteFinding[] }) {
  const convergent = useMemo(() => {
    return findings.filter((f) => f.convergence_details)
  }, [findings])

  // Group by entity to show cross-domain convergence
  // NOTE: This hook must be called before the early return to satisfy Rules of Hooks
  const byEntity = useMemo(() => {
    if (convergent.length === 0) return []
    const map = new Map<
      string,
      { entity: string; domains: Set<string>; score: number }
    >()
    convergent.forEach((f) => {
      const existing = map.get(f.entity)
      if (existing) {
        if (f.convergence_details?.domain_risks) {
          Object.keys(f.convergence_details.domain_risks).forEach((d) =>
            existing.domains.add(d)
          )
        }
        existing.score = Math.max(
          existing.score,
          f.convergence_details?.composite_risk ?? 0
        )
      } else {
        const domains = new Set<string>()
        if (f.convergence_details?.domain_risks) {
          Object.keys(f.convergence_details.domain_risks).forEach((d) =>
            domains.add(d)
          )
        }
        map.set(f.entity, {
          entity: f.entity,
          domains,
          score: f.convergence_details?.composite_risk ?? 0,
        })
      }
    })
    return [...map.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }, [convergent])

  if (convergent.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">
        Cross-Domain Convergence
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Entities flagged by 2+ independent detector categories, indicating
        systemic risk
      </p>
      <div className="space-y-2">
        {byEntity.map((e) => (
          <div
            key={e.entity}
            className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-50"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {e.entity}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                {[...e.domains].map((d) => (
                  <span
                    key={d}
                    className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded capitalize"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
            <TCScoreBadge score={e.score} size="sm" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ForensicsOverviewPage() {
  const { selectedCityId: cityId } = useWasteCity()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const { data: analysisData, isLoading } =
    useLatestPersistedWasteResult(cityId)
  const allFindings = useMemo(() => analysisData?.findings ?? [], [analysisData])

  // Derive filter options from findings
  const departments = useMemo(() => {
    const set = new Set<string>()
    allFindings.forEach((f) => {
      if (f.department) set.add(f.department)
    })
    return [...set].sort()
  }, [allFindings])

  const categories = useMemo(() => {
    const set = new Set<string>()
    allFindings.forEach((f) => set.add(normalizeWasteCategory(f.category)))
    return [...set].sort()
  }, [allFindings])

  // Apply filters
  const filtered = useMemo(() => {
    let results = allFindings
    if (filters.severity) {
      results = results.filter(
        (f) => f.severity?.toLowerCase() === filters.severity
      )
    }
    if (filters.category) {
      results = results.filter(
        (f) => normalizeWasteCategory(f.category) === filters.category
      )
    }
    if (filters.department) {
      results = results.filter((f) => f.department === filters.department)
    }
    if (filters.entity) {
      const q = filters.entity.toLowerCase()
      results = results.filter((f) =>
        f.entity?.toLowerCase().includes(q)
      )
    }
    return results
  }, [allFindings, filters])

  // Summary stats
  const criticalCount = filtered.filter(
    (f) => f.severity === "critical" || f.severity === "high"
  ).length
  const uniqueEntities = new Set(filtered.map((f) => f.entity)).size
  const totalDollar = filtered.reduce(
    (s, f) => s + (f.amount ?? 0),
    0
  )

  // Top findings
  const topFindings = filtered.slice(0, 10)

  return (
    <WasteShell
      title="Findings"
      description="Browse and investigate detected anomalies"
    >
      <ForensicsShell>
        {/* Browse — quick jumps into the major slices */}
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Browse
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link
              href="/waste/forensics/findings"
              className="bg-white border border-gray-200 rounded-lg p-3 hover:border-purple-300 hover:shadow-sm no-underline group"
            >
              <div className="flex items-center gap-2 mb-1">
                <FileSearch className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-gray-900">
                  All findings
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                Every detected anomaly, fully filterable
              </p>
            </Link>
            <Link
              href="/waste/forensics/categories"
              className="bg-white border border-gray-200 rounded-lg p-3 hover:border-purple-300 hover:shadow-sm no-underline"
            >
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-gray-900">
                  By category
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                Payroll, contracts, infrastructure, integrity, influence
              </p>
            </Link>
            <Link
              href="/waste/forensics/departments"
              className="bg-white border border-gray-200 rounded-lg p-3 hover:border-purple-300 hover:shadow-sm no-underline"
            >
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-gray-900">
                  By department
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                Sheriff, Police, DPW, MTA, Public Health, etc.
              </p>
            </Link>
            <Link
              href="/waste/forensics/entities"
              className="bg-white border border-gray-200 rounded-lg p-3 hover:border-purple-300 hover:shadow-sm no-underline"
            >
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-gray-900">
                  By entity
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                Vendors, employees, contractors with risk scores
              </p>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          departments={departments}
          categories={categories}
        />

        {/* Summary stats */}
        <p className="text-xs text-gray-500 mb-3">
          Showing {filtered.length.toLocaleString()} of {allFindings.length.toLocaleString()} findings
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Total Findings</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {isLoading ? "--" : filtered.length.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">High + Critical</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums">
              {isLoading ? "--" : criticalCount.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Unique Entities</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {isLoading ? "--" : uniqueEntities.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Dollar Impact</p>
            <p className="text-2xl font-bold text-gray-900">
              {isLoading ? "--" : formatDollar(totalDollar || null)}
            </p>
          </div>
        </div>

        {/* Top findings table */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Top Findings
          </h3>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-10 bg-gray-50 rounded animate-pulse"
                />
              ))}
            </div>
          ) : topFindings.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">
              No findings match the current filters
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500">
                      Finding
                    </th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">
                      Entity
                    </th>
                    <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">
                      Severity
                    </th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">
                      Category
                    </th>
                    <th className="text-right py-2 pl-2 text-xs font-medium text-gray-500">
                      Impact
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topFindings.map((f, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-gray-50 hover:bg-gray-50"
                    >
                      <td className="py-2 pr-3 text-gray-800 truncate max-w-[200px]">
                        {f.metric}
                      </td>
                      <td className="py-2 px-2 text-gray-600 truncate max-w-[150px]">
                        {f.entity}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span
                          className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded",
                            severityBadge(f.severity)
                          )}
                        >
                          {f.severity}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500 capitalize">
                        {getWasteCategoryLabel(f.category)}
                      </td>
                      <td className="py-2 pl-2 text-right text-gray-700 tabular-nums">
                        {f.amount ? formatDollar(f.amount) : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link
            href="/waste/forensics/findings"
            className="mt-3 flex items-center gap-1 text-xs font-medium text-purple-600 no-underline hover:text-purple-700"
          >
            View all findings <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Category breakdown + Severity breakdown */}
        <div className="mb-6">
          <CategoryBreakdown findings={filtered} />
        </div>

        {/* Convergence */}
        <ConvergenceSection findings={allFindings} />
      </ForensicsShell>
    </WasteShell>
  )
}
