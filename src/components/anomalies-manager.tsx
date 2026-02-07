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
import { Search, MoreHorizontal, Send, CheckCircle, Trash2, AlertTriangle, AlertCircle, Info, EyeOff, Eye, XCircle } from "lucide-react"
import { Anomaly, Keyword } from "@/lib/types"
import { AnomalyDialog } from "./anomaly-dialog"
import { updateAnomalyStatus, deleteAnomaly } from "@/app/actions/anomalies"

// LocalStorage key for ignored anomalies
const IGNORED_ANOMALIES_KEY = 'transparentcity_ignored_anomalies'

// Helper functions for localStorage
function getIgnoredAnomalies(): Set<string | number> {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = localStorage.getItem(IGNORED_ANOMALIES_KEY)
    if (stored) {
      return new Set(JSON.parse(stored))
    }
  } catch (e) {
    console.error('Error reading ignored anomalies from localStorage:', e)
  }
  return new Set()
}

function saveIgnoredAnomalies(ids: Set<string | number>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(IGNORED_ANOMALIES_KEY, JSON.stringify([...ids]))
  } catch (e) {
    console.error('Error saving ignored anomalies to localStorage:', e)
  }
}

// Export function for email generation to check if anomaly is ignored
export function isAnomalyIgnored(id: string | number): boolean {
  return getIgnoredAnomalies().has(id) || getIgnoredAnomalies().has(String(id))
}

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

export function AnomaliesManager({ anomalies, keywords }: AnomaliesManagerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [isPending, startTransition] = useTransition()
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set())
  const [ignoredIds, setIgnoredIds] = useState<Set<string | number>>(new Set())
  const [showIgnored, setShowIgnored] = useState(false)

  // Load ignored anomalies from localStorage on mount
  useEffect(() => {
    setIgnoredIds(getIgnoredAnomalies())
  }, [])

  const toggleSelect = (id: string | number) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const selectAll = () => {
    if (selectedIds.size === filteredAnomalies.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredAnomalies.map(a => a.id)))
    }
  }

  const handleIgnore = (ids: (string | number)[]) => {
    const newIgnored = new Set(ignoredIds)
    for (const id of ids) {
      newIgnored.add(id)
    }
    setIgnoredIds(newIgnored)
    saveIgnoredAnomalies(newIgnored)
    setSelectedIds(new Set()) // Clear selection
  }

  const handleUnignore = (ids: (string | number)[]) => {
    const newIgnored = new Set(ignoredIds)
    for (const id of ids) {
      newIgnored.delete(id)
      newIgnored.delete(String(id))
    }
    setIgnoredIds(newIgnored)
    saveIgnoredAnomalies(newIgnored)
    setSelectedIds(new Set()) // Clear selection
  }

  const isIgnored = (id: string | number) => {
    return ignoredIds.has(id) || ignoredIds.has(String(id))
  }

  const filteredAnomalies = anomalies.filter(anomaly => {
    const searchLower = searchQuery.toLowerCase()
    // Search across all relevant text fields including period type
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
    
    // Filter by ignored status
    const anomalyIsIgnored = isIgnored(anomaly.id)
    const matchesIgnored = showIgnored ? anomalyIsIgnored : !anomalyIsIgnored
    
    return matchesSearch && matchesStatus && matchesSeverity && matchesIgnored
  })

  const ignoredCount = anomalies.filter(a => isIgnored(a.id)).length

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
        <p className="text-sm text-muted-foreground">
          {filteredAnomalies.length} anomal{filteredAnomalies.length !== 1 ? 'ies' : 'y'}
        </p>
      </div>

      {/* Selection & Ignore Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={selectAll}
          >
            {selectedIds.size === filteredAnomalies.length && filteredAnomalies.length > 0 ? "Deselect All" : "Select All"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} selected
          </span>
          {selectedIds.size > 0 && !showIgnored && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleIgnore([...selectedIds])}
              className="gap-2 text-orange-600 border-orange-300 hover:bg-orange-50"
            >
              <EyeOff className="w-4 h-4" />
              Ignore Selected ({selectedIds.size})
            </Button>
          )}
          {selectedIds.size > 0 && showIgnored && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleUnignore([...selectedIds])}
              className="gap-2 text-green-600 border-green-300 hover:bg-green-50"
            >
              <Eye className="w-4 h-4" />
              Unignore Selected ({selectedIds.size})
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showIgnored ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowIgnored(!showIgnored)
              setSelectedIds(new Set()) // Clear selection when switching views
            }}
            className="gap-2"
          >
            {showIgnored ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {showIgnored ? "Showing Ignored" : `Ignored (${ignoredCount})`}
          </Button>
        </div>
      </div>

      {filteredAnomalies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {searchQuery || statusFilter !== 'all' || severityFilter !== 'all'
              ? 'No anomalies found matching your filters' 
              : 'No anomalies yet. Add anomalies from your data to send to relevant officials.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredAnomalies.map((anomaly) => (
            <Card key={anomaly.id} className={isIgnored(anomaly.id) ? 'opacity-75 border-orange-200 bg-orange-50/50' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.has(anomaly.id)}
                      onCheckedChange={() => toggleSelect(anomaly.id)}
                      className="mt-1"
                    />
                    <div className={`p-2 rounded-lg ${getSeverityColor(anomaly.severity || 'medium')}`}>
                      {getSeverityIcon(anomaly.severity || 'medium')}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
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
                      {isIgnored(anomaly.id) && (
                        <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
                          <EyeOff className="w-3 h-3 mr-1" />
                          Ignored
                        </Badge>
                      )}
                    </div>
                    {/* Stats display */}
                    {(anomaly.pct_change != null || (anomaly as any).recent_mean != null) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-sm">
                        {/* Percentage change */}
                        {anomaly.pct_change != null && (
                          <span className={`font-semibold ${anomaly.pct_change < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {anomaly.pct_change > 0 ? '↑' : '↓'} {anomaly.pct_change > 0 ? '+' : ''}{anomaly.pct_change.toFixed(1)}%
                          </span>
                        )}
                        {/* Period badge */}
                        {anomaly.period_type && (
                          <Badge variant="outline" className="text-xs uppercase">
                            {anomaly.period_type}ly
                          </Badge>
                        )}
                        {/* Comparison numbers */}
                        {(anomaly as any).recent_mean != null && (anomaly as any).comparison_mean != null && (
                          <span className="text-muted-foreground">
                            <span className="font-medium text-foreground">{Number((anomaly as any).recent_mean).toLocaleString(undefined, {maximumFractionDigits: 1})}</span>
                            {' '}this {anomaly.period_type || 'week'}
                            {' · '}
                            <span className="font-medium text-foreground">{Number((anomaly as any).comparison_mean).toLocaleString(undefined, {maximumFractionDigits: 1})}</span>
                            {' '}({(anomaly as any).comparison_window?.size || 12}-{anomaly.period_type || 'week'} avg)
                          </span>
                        )}
                      </div>
                    )}
                    {/* Description - only show if it has additional info beyond the stats */}
                    {anomaly.description && !(anomaly as any).recent_mean && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {anomaly.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                      {anomaly.data_source && (
                        <span>City: {anomaly.data_source}</span>
                      )}
                      {anomaly.created_at && (
                        <span>Added {new Date(anomaly.created_at).toLocaleDateString()}</span>
                      )}
                    </div>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(anomaly.crm_status || anomaly.status || 'new') === 'new' && (
                        <DropdownMenuItem 
                          onClick={() => handleStatusChange(String(anomaly.id), 'sent')}
                          disabled={isPending}
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Mark as Sent
                        </DropdownMenuItem>
                      )}
                      {(anomaly.crm_status || anomaly.status) === 'sent' && (
                        <DropdownMenuItem 
                          onClick={() => handleStatusChange(String(anomaly.id), 'acknowledged')}
                          disabled={isPending}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Mark Acknowledged
                        </DropdownMenuItem>
                      )}
                      {((anomaly.crm_status || anomaly.status) === 'acknowledged' || (anomaly.crm_status || anomaly.status) === 'sent') && (
                        <DropdownMenuItem 
                          onClick={() => handleStatusChange(String(anomaly.id), 'resolved')}
                          disabled={isPending}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Mark Resolved
                        </DropdownMenuItem>
                      )}
                      <AnomalyDialog anomaly={anomaly} keywords={keywords}>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                      </AnomalyDialog>
                      <DropdownMenuSeparator />
                      {isIgnored(anomaly.id) ? (
                        <DropdownMenuItem 
                          onClick={() => handleUnignore([anomaly.id])}
                          className="text-green-600"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Unignore
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem 
                          onClick={() => handleIgnore([anomaly.id])}
                          className="text-orange-600"
                        >
                          <EyeOff className="w-4 h-4 mr-2" />
                          Ignore
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => handleDelete(String(anomaly.id))}
                        disabled={isPending}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
