"use client"

import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, MoreHorizontal, Send, CheckCircle, Trash2, AlertTriangle, AlertCircle, Info } from "lucide-react"
import { Anomaly, Keyword } from "@/lib/types"
import { AnomalyDialog } from "./anomaly-dialog"
import { updateAnomalyStatus, deleteAnomaly } from "@/app/actions/anomalies"

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
    
    return matchesSearch && matchesStatus && matchesSeverity
  })

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
            <Card key={anomaly.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${getSeverityColor(anomaly.severity || 'medium')}`}>
                    {getSeverityIcon(anomaly.severity || 'medium')}
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
                    </div>
                    {/* Percentage change highlight */}
                    {anomaly.pct_change != null && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-lg font-semibold ${anomaly.pct_change < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {anomaly.pct_change > 0 ? '↑' : '↓'} {anomaly.pct_change > 0 ? '+' : ''}{anomaly.pct_change.toFixed(1)}%
                        </span>
                        {anomaly.period_type && (
                          <Badge variant="outline" className="text-xs uppercase">
                            {anomaly.period_type}ly
                          </Badge>
                        )}
                      </div>
                    )}
                    {/* Description with comparison stats */}
                    {anomaly.description && (
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
