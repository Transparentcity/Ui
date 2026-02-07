"use client"

import { useState, useTransition, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, MoreHorizontal, Send, CheckCircle, Trash2, AlertTriangle, AlertCircle, Info, EyeOff, Eye } from "lucide-react"
import { Anomaly, Keyword } from "@/lib/types"
import { AnomalyDialog } from "./anomaly-dialog"
import { updateAnomalyStatus, deleteAnomaly } from "@/app/actions/anomalies"

// ---------------------------------------------------------------------------
// Ignored-anomaly persistence (localStorage)
// ---------------------------------------------------------------------------
// Bump this version whenever the anomaly ID format changes so stale data
// is automatically cleared.
const IGNORED_ANOMALIES_VERSION = 2
const IGNORED_ANOMALIES_KEY = 'transparentcity_ignored_anomalies_v2'

function getIgnoredSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(IGNORED_ANOMALIES_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (parsed?.version !== IGNORED_ANOMALIES_VERSION) {
      // Stale format — wipe it
      localStorage.removeItem(IGNORED_ANOMALIES_KEY)
      // Also clear old key if present
      localStorage.removeItem('transparentcity_ignored_anomalies')
      return new Set()
    }
    return new Set((parsed.ids as string[]) ?? [])
  } catch {
    return new Set()
  }
}

function saveIgnoredSet(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      IGNORED_ANOMALIES_KEY,
      JSON.stringify({ version: IGNORED_ANOMALIES_VERSION, ids: [...ids] })
    )
  } catch {
    // quota exceeded — silently ignore
  }
}

/** Check a single anomaly id (used by email generation) */
export function isAnomalyIgnored(id: string | number): boolean {
  return getIgnoredSet().has(String(id))
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AnomalyWithKeywords extends Anomaly {
  keywords: Keyword[]
  recent_mean?: number | null
  comparison_mean?: number | null
  metric_name?: string
}

interface AnomaliesManagerProps {
  anomalies: AnomalyWithKeywords[]
  keywords: Keyword[]
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'bg-destructive/10 text-destructive border-destructive/20'
    case 'high': return 'bg-warning/10 text-warning-foreground border-warning/20'
    case 'medium': return 'bg-accent/10 text-accent-foreground border-accent/20'
    default: return 'bg-muted text-muted-foreground border-muted'
  }
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'critical': return <AlertCircle className="w-4 h-4" />
    case 'high': return <AlertTriangle className="w-4 h-4" />
    default: return <Info className="w-4 h-4" />
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'new': return 'bg-primary/10 text-primary border-primary/20'
    case 'sent': return 'bg-accent/10 text-accent-foreground border-accent/20'
    case 'acknowledged': return 'bg-success/10 text-success border-success/20'
    case 'resolved': return 'bg-muted text-muted-foreground border-muted'
    default: return 'bg-muted text-muted-foreground border-muted'
  }
}

// District options: 0 = citywide, 1-11 = districts
const DISTRICT_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Citywide" },
  ...Array.from({ length: 11 }, (_, i) => ({ value: i + 1, label: `District ${i + 1}` })),
]

// Sort options
type SortKey = "newest" | "oldest" | "pct_desc" | "pct_asc" | "severity"
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "pct_desc", label: "% Change (high → low)" },
  { value: "pct_asc", label: "% Change (low → high)" },
  { value: "severity", label: "Severity" },
]

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

function sortAnomalies(list: AnomalyWithKeywords[], key: SortKey): AnomalyWithKeywords[] {
  const sorted = [...list]
  switch (key) {
    case "newest":
      return sorted.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    case "oldest":
      return sorted.sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
    case "pct_desc":
      return sorted.sort((a, b) => Math.abs(b.pct_change ?? 0) - Math.abs(a.pct_change ?? 0))
    case "pct_asc":
      return sorted.sort((a, b) => Math.abs(a.pct_change ?? 0) - Math.abs(b.pct_change ?? 0))
    case "severity":
      return sorted.sort((a, b) => (SEVERITY_ORDER[a.severity ?? "medium"] ?? 2) - (SEVERITY_ORDER[b.severity ?? "medium"] ?? 2))
    default:
      return sorted
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AnomaliesManager({ anomalies, keywords }: AnomaliesManagerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [sortKey, setSortKey] = useState<SortKey>("newest")
  const [districtFilter, setDistrictFilter] = useState<Set<number>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set())
  const [showIgnored, setShowIgnored] = useState(false)

  // Load ignored set from localStorage (once, on mount)
  useEffect(() => {
    setIgnoredIds(getIgnoredSet())
    // Also clear the old key if it's still around
    localStorage.removeItem('transparentcity_ignored_anomalies')
  }, [])

  // ------- Selection helpers -------
  const sid = (a: AnomalyWithKeywords) => String(a.id)

  const isSelected = (a: AnomalyWithKeywords) => selectedIds.has(sid(a))

  const toggleSelect = (a: AnomalyWithKeywords) => {
    const key = sid(a)
    const next = new Set(selectedIds)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedIds(next)
  }

  // ------- Ignore helpers -------
  const isIgnored = (a: AnomalyWithKeywords) => ignoredIds.has(sid(a))

  const handleIgnore = (targets: AnomalyWithKeywords[]) => {
    const next = new Set(ignoredIds)
    for (const a of targets) next.add(sid(a))
    setIgnoredIds(next)
    saveIgnoredSet(next)
    setSelectedIds(new Set())
  }

  const handleUnignore = (targets: AnomalyWithKeywords[]) => {
    const next = new Set(ignoredIds)
    for (const a of targets) next.delete(sid(a))
    setIgnoredIds(next)
    saveIgnoredSet(next)
    setSelectedIds(new Set())
  }

  // ------- District filter -------
  const getAnomalyDistrict = (a: AnomalyWithKeywords): number => {
    if (a.is_citywide === true) return 0
    const d = a.district
    if (d === 0 || d === null || d === undefined) return 0
    return typeof d === 'number' ? d : parseInt(String(d), 10) || 0
  }

  const toggleDistrictFilter = (district: number) => {
    const next = new Set(districtFilter)
    if (next.has(district)) next.delete(district)
    else next.add(district)
    setDistrictFilter(next)
  }

  // ------- Filtering -------
  const filteredAnomalies = anomalies.filter(anomaly => {
    const searchLower = searchQuery.toLowerCase()
    const periodLabel = anomaly.period_type?.toUpperCase() ?? ""
    const matchesSearch = !searchQuery ||
      (anomaly.title?.toLowerCase().includes(searchLower) ?? false) ||
      (anomaly.description?.toLowerCase().includes(searchLower) ?? false) ||
      (anomaly.data_source?.toLowerCase().includes(searchLower) ?? false) ||
      (anomaly.group_field?.toLowerCase().includes(searchLower) ?? false) ||
      (anomaly.group_value?.toLowerCase().includes(searchLower) ?? false) ||
      (anomaly.district_label?.toLowerCase().includes(searchLower) ?? false) ||
      periodLabel.toLowerCase().includes(searchLower) ||
      (anomaly.keywords?.some(k => k.name?.toLowerCase().includes(searchLower)) ?? false)

    const status = anomaly.crm_status || anomaly.status || 'new'
    const matchesStatus = statusFilter === 'all' || status === statusFilter
    const matchesSeverity = severityFilter === 'all' || (anomaly.severity || 'medium') === severityFilter

    const anomalyDistrict = getAnomalyDistrict(anomaly)
    const matchesDistrict = districtFilter.size === 0 || districtFilter.has(anomalyDistrict)

    const ignored = isIgnored(anomaly)
    const matchesIgnored = showIgnored ? ignored : !ignored

    return matchesSearch && matchesStatus && matchesSeverity && matchesDistrict && matchesIgnored
  })

  const sortedAnomalies = sortAnomalies(filteredAnomalies, sortKey)

  const ignoredCount = anomalies.filter(a => isIgnored(a)).length
  const selectedCount = sortedAnomalies.filter(a => isSelected(a)).length
  const allSelected = sortedAnomalies.length > 0 && selectedCount === sortedAnomalies.length

  const selectAll = () => {
    if (allSelected) {
      const remove = new Set(sortedAnomalies.map(sid))
      setSelectedIds(new Set([...selectedIds].filter(id => !remove.has(id))))
    } else {
      const next = new Set(selectedIds)
      sortedAnomalies.forEach(a => next.add(sid(a)))
      setSelectedIds(next)
    }
  }

  // ------- Actions -------
  const handleStatusChange = async (id: string, status: string) => {
    startTransition(async () => {
      await updateAnomalyStatus(id, status)
    })
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this anomaly?')) {
      startTransition(async () => {
        await deleteAnomaly(id)
      })
    }
  }

  // ======================================================================
  // RENDER
  // ======================================================================
  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-64 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search anomalies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {sortedAnomalies.length} anomal{sortedAnomalies.length !== 1 ? 'ies' : 'y'}
        </p>
      </div>

      {/* District filter */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-medium text-muted-foreground">District:</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {DISTRICT_OPTIONS.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={districtFilter.has(value)}
                onCheckedChange={() => toggleDistrictFilter(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {districtFilter.size > 0 && (
          <Button variant="ghost" size="sm" className="text-muted-foreground h-8" onClick={() => setDistrictFilter(new Set())}>
            Clear district filter
          </Button>
        )}
      </div>

      {/* Selection & Ignore Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={selectAll}>
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {selectedCount} selected
          </span>
          {selectedCount > 0 && !showIgnored && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleIgnore(sortedAnomalies.filter(a => isSelected(a)))}
              className="gap-2 text-orange-600 border-orange-300 hover:bg-orange-50"
            >
              <EyeOff className="w-4 h-4" />
              Ignore Selected ({selectedCount})
            </Button>
          )}
          {selectedCount > 0 && showIgnored && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleUnignore(sortedAnomalies.filter(a => isSelected(a)))}
              className="gap-2 text-green-600 border-green-300 hover:bg-green-50"
            >
              <Eye className="w-4 h-4" />
              Unignore Selected ({selectedCount})
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showIgnored ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowIgnored(!showIgnored)
              setSelectedIds(new Set())
            }}
            className="gap-2"
          >
            {showIgnored ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {showIgnored ? "Showing Ignored" : `Ignored (${ignoredCount})`}
          </Button>
        </div>
      </div>

      {/* Anomaly list */}
      {sortedAnomalies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {showIgnored
              ? 'No ignored anomalies'
              : searchQuery || statusFilter !== 'all' || severityFilter !== 'all'
                ? 'No anomalies found matching your filters'
                : 'No anomalies yet. Add anomalies from your data to send to relevant officials.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedAnomalies.map((anomaly) => {
            const ignored = isIgnored(anomaly)

            return (
              <Card
                key={String(anomaly.id)}
                className={
                  ignored
                    ? "border-orange-300 bg-orange-50/60 border-l-4 border-l-orange-500"
                    : ""
                }
              >
                <CardContent className="p-0">
                  {/* Ignored banner */}
                  {ignored && (
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-orange-100 border-b border-orange-200 text-orange-800 text-sm font-medium rounded-t-lg">
                      <EyeOff className="w-4 h-4 shrink-0" />
                      Ignored — excluded from emails
                    </div>
                  )}

                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Checkbox + severity icon */}
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isSelected(anomaly)}
                          onCheckedChange={() => toggleSelect(anomaly)}
                          className="mt-1"
                        />
                        <div className={`p-2 rounded-lg ${getSeverityColor(anomaly.severity || 'medium')}`}>
                          {getSeverityIcon(anomaly.severity || 'medium')}
                        </div>
                      </div>

                      {/* Card body */}
                      <div className="flex-1 min-w-0">
                        {/* Title + badges */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-medium">
                            {anomaly.title || `Anomaly #${anomaly.id}`}
                          </h3>
                          {anomaly.district_label && (
                            <Badge variant="secondary" className="text-xs">
                              {anomaly.district_label}
                            </Badge>
                          )}
                          {anomaly.is_citywide && (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                              Citywide
                            </Badge>
                          )}
                          <Badge variant="outline" className={getSeverityColor(anomaly.severity || 'medium')}>
                            {anomaly.severity || 'medium'}
                          </Badge>
                          <Badge variant="outline" className={getStatusColor(anomaly.crm_status || anomaly.status || 'new')}>
                            {anomaly.crm_status || anomaly.status || 'new'}
                          </Badge>
                          {ignored && (
                            <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
                              <EyeOff className="w-3 h-3 mr-1" />
                              Ignored
                            </Badge>
                          )}
                        </div>

                        {/* Stats display */}
                        {(anomaly.pct_change != null || (anomaly as any).recent_mean != null) && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-sm">
                            {anomaly.pct_change != null && (
                              <span className={`font-semibold ${anomaly.pct_change < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {anomaly.pct_change > 0 ? '↑' : '↓'} {anomaly.pct_change > 0 ? '+' : ''}{anomaly.pct_change.toFixed(1)}%
                              </span>
                            )}
                            {anomaly.period_type && (
                              <Badge variant="outline" className="text-xs uppercase">
                                {anomaly.period_type}ly
                              </Badge>
                            )}
                            {(anomaly as any).recent_mean != null && (anomaly as any).comparison_mean != null && (
                              <span className="text-muted-foreground">
                                <span className="font-medium text-foreground">{Number((anomaly as any).recent_mean).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                                {' '}this {anomaly.period_type || 'week'}
                                {' · '}
                                <span className="font-medium text-foreground">{Number((anomaly as any).comparison_mean).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                                {' '}({(anomaly as any).comparison_window?.size || 12}-{anomaly.period_type || 'week'} avg)
                              </span>
                            )}
                          </div>
                        )}

                        {/* Description (only when no stats line) */}
                        {anomaly.description && !(anomaly as any).recent_mean && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {anomaly.description}
                          </p>
                        )}

                        {/* Meta line */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                          {anomaly.data_source && <span>City: {anomaly.data_source}</span>}
                          {anomaly.created_at && <span>Added {new Date(anomaly.created_at).toLocaleDateString()}</span>}
                        </div>

                        {/* Keywords */}
                        {anomaly.keywords?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {anomaly.keywords.map(keyword => (
                              <Badge key={keyword.id} variant="outline" className="text-xs">
                                {keyword.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Three-dots menu */}
                      <div className="relative z-10 shrink-0">
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Open menu">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-50">
                            {(anomaly.crm_status || anomaly.status || 'new') === 'new' && (
                              <DropdownMenuItem onClick={() => handleStatusChange(String(anomaly.id), 'sent')} disabled={isPending}>
                                <Send className="w-4 h-4 mr-2" />
                                Mark as Sent
                              </DropdownMenuItem>
                            )}
                            {(anomaly.crm_status || anomaly.status) === 'sent' && (
                              <DropdownMenuItem onClick={() => handleStatusChange(String(anomaly.id), 'acknowledged')} disabled={isPending}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Mark Acknowledged
                              </DropdownMenuItem>
                            )}
                            {((anomaly.crm_status || anomaly.status) === 'acknowledged' || (anomaly.crm_status || anomaly.status) === 'sent') && (
                              <DropdownMenuItem onClick={() => handleStatusChange(String(anomaly.id), 'resolved')} disabled={isPending}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Mark Resolved
                              </DropdownMenuItem>
                            )}
                            {!ignored && (
                              <AnomalyDialog anomaly={anomaly} keywords={keywords}>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                  <AlertTriangle className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                              </AnomalyDialog>
                            )}
                            {ignored && (
                              <DropdownMenuItem disabled className="text-muted-foreground">
                                <AlertTriangle className="w-4 h-4 mr-2" />
                                Unignore to edit
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {ignored ? (
                              <DropdownMenuItem onClick={() => handleUnignore([anomaly])} className="text-green-600">
                                <Eye className="w-4 h-4 mr-2" />
                                Unignore
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleIgnore([anomaly])} className="text-orange-600">
                                <EyeOff className="w-4 h-4 mr-2" />
                                Ignore
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(String(anomaly.id))} disabled={isPending}>
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
