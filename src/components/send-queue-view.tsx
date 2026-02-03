"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Search,
  Trash2,
  RefreshCw,
  Mail,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Send,
  Filter,
  FileSearch,
  Pencil,
  Calendar,
  Loader2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal } from "lucide-react"
import type { SendQueueItem, Contact } from "@/lib/types"
import { cancelQueueItems, retryFailedItems, deleteQueueItems, deleteAllQueueItems, updateQueueItemContent, scheduleQueueItems, sendNowQueueItems } from "@/app/actions/send-queue"
import { StatCard } from "./stat-card"

interface QueueItemWithProspect extends SendQueueItem {
  prospect?: Contact
}

interface QueueStats {
  total: number
  pending_review: number
  queued: number
  processing: number
  sent: number
  failed: number
  cancelled: number
  todaySent?: number
  hourSent?: number
}

interface SendQueueViewProps {
  queueItems: QueueItemWithProspect[]
  campaigns: { id: string; name: string; status: string }[]
  stats: QueueStats
}

function getStatusIcon(status: string) {
  switch (status) {
    case "queued": return <Clock className="w-4 h-4 text-muted-foreground" />
    case "processing": return <RefreshCw className="w-4 h-4 text-primary animate-spin" />
    case "sent": return <CheckCircle2 className="w-4 h-4 text-success" />
    case "failed": return <XCircle className="w-4 h-4 text-destructive" />
    case "cancelled": return <AlertCircle className="w-4 h-4 text-muted-foreground" />
    default: return null
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "queued": return "bg-muted text-muted-foreground"
    case "processing": return "bg-primary/10 text-primary"
    case "sent": return "bg-success/10 text-success"
    case "failed": return "bg-destructive/10 text-destructive"
    case "cancelled": return "bg-muted text-muted-foreground"
    default: return "bg-muted text-muted-foreground"
  }
}

export function SendQueueView({ queueItems, campaigns, stats }: SendQueueViewProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [campaignFilter, setCampaignFilter] = useState<string>("all")
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [previewItem, setPreviewItem] = useState<QueueItemWithProspect | null>(null)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [isPending, startTransition] = useTransition()
  
  // Edit state
  const [editingItem, setEditingItem] = useState<QueueItemWithProspect | null>(null)
  const [editSubject, setEditSubject] = useState("")
  const [editBody, setEditBody] = useState("")
  
  // Schedule state
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [scheduleDate, setScheduleDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  })
  const [scheduleTime, setScheduleTime] = useState("09:00")
  const [scheduleItemIds, setScheduleItemIds] = useState<string[]>([])
  
  const filteredItems = queueItems.filter(item => {
    const matchesSearch = 
      item.prospect?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.prospect?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.prospect?.organization?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === "all" || item.status === statusFilter
    const matchesCampaign = campaignFilter === "all" || item.campaign_id === campaignFilter
    
    return matchesSearch && matchesStatus && matchesCampaign
  })
  
  const toggleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(filteredItems.map(i => i.id)))
    }
  }
  
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedItems)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedItems(newSet)
  }
  
  const handleCancelSelected = async () => {
    if (selectedItems.size === 0) return
    if (!confirm(`Cancel ${selectedItems.size} queued items?`)) return
    
    startTransition(async () => {
      await cancelQueueItems(Array.from(selectedItems))
      setSelectedItems(new Set())
    })
  }
  
  const handleRetryFailed = async () => {
    startTransition(async () => {
      await retryFailedItems()
    })
  }

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return
    if (!confirm(`Delete ${selectedItems.size} item(s) permanently? This cannot be undone.`)) return
    
    startTransition(async () => {
      await deleteQueueItems(Array.from(selectedItems))
      setSelectedItems(new Set())
    })
  }

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Delete this item permanently? This cannot be undone.")) return
    
    startTransition(async () => {
      await deleteQueueItems([id])
      setSelectedItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    })
  }

  const handleDeleteByStatus = async (status: string) => {
    const count = queueItems.filter(i => i.status === status).length
    if (count === 0) return
    if (!confirm(`Delete all ${count} ${status} items permanently? This cannot be undone.`)) return
    
    startTransition(async () => {
      await deleteAllQueueItems({ status })
      setSelectedItems(new Set())
    })
  }

  const handleSendNow = async (ids: string[]) => {
    if (ids.length === 0) return
    if (!confirm(`Send ${ids.length} message(s) immediately?`)) return
    
    startTransition(async () => {
      await sendNowQueueItems(ids)
      setSelectedItems(new Set())
      router.refresh()
    })
  }

  // Preview handlers
  const openPreview = (item: QueueItemWithProspect) => {
    setPreviewItem(item)
    setShowPreviewDialog(true)
  }

  const closePreview = () => {
    setShowPreviewDialog(false)
    setPreviewItem(null)
  }

  // Edit handlers
  const openEdit = (item: QueueItemWithProspect) => {
    setEditingItem(item)
    setEditSubject(item.personalized_subject || "")
    setEditBody(item.personalized_body || "")
  }

  const saveEdit = () => {
    if (!editingItem) return
    
    startTransition(async () => {
      await updateQueueItemContent(editingItem.id, {
        personalized_subject: editSubject,
        personalized_body: editBody,
      })
      setEditingItem(null)
      router.refresh()
    })
  }

  // Schedule handlers
  const openSchedule = (ids: string[]) => {
    setScheduleItemIds(ids)
    setShowScheduleDialog(true)
  }

  const confirmSchedule = () => {
    if (scheduleItemIds.length === 0) return
    
    const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}:00`)
    
    startTransition(async () => {
      await scheduleQueueItems(scheduleItemIds, scheduledDateTime.toISOString())
      setScheduleItemIds([])
      setShowScheduleDialog(false)
      setSelectedItems(new Set())
      router.refresh()
    })
  }

  // Get only queued items for scheduling
  const selectedQueuedItems = Array.from(selectedItems).filter(id => {
    const item = filteredItems.find(i => i.id === id)
    return item?.status === "queued"
  })

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard
          title="Queued"
          value={stats.queued}
          icon={Clock}
          variant={stats.queued > 0 ? "primary" : "default"}
        />
        <StatCard
          title="Processing"
          value={stats.processing}
          icon={RefreshCw}
          variant={stats.processing > 0 ? "primary" : "default"}
        />
        <StatCard
          title="Sent"
          value={stats.sent}
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          title="Failed"
          value={stats.failed}
          icon={XCircle}
          variant={stats.failed > 0 ? "destructive" : "default"}
        />
        <StatCard
          title="Cancelled"
          value={stats.cancelled}
          icon={AlertCircle}
          variant="default"
        />
        <StatCard
          title="Sent Today"
          value={stats.todaySent || 0}
          icon={Send}
          variant="default"
        />
        <StatCard
          title="Sent This Hour"
          value={stats.hourSent || 0}
          icon={Send}
          variant="default"
        />
      </div>

      {/* Link to Message Review if there are pending items */}
      {stats.pending_review > 0 && (
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSearch className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="font-medium text-purple-900">
                    {stats.pending_review} message{stats.pending_review !== 1 ? 's' : ''} pending review
                  </p>
                  <p className="text-sm text-purple-700">
                    Review and approve messages before they're scheduled
                  </p>
                </div>
              </div>
              <Link href="/message-review">
                <Button variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-100">
                  <FileSearch className="w-4 h-4 mr-2" />
                  Go to Message Review
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters and Actions */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by contact name, email, or organization..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map(campaign => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2 flex-wrap">
              {selectedItems.size > 0 && (
                <>
                  {selectedQueuedItems.length > 0 && (
                    <>
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={() => handleSendNow(selectedQueuedItems)}
                        disabled={isPending}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Send Now ({selectedQueuedItems.length})
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openSchedule(selectedQueuedItems)}
                        disabled={isPending}
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        Reschedule ({selectedQueuedItems.length})
                      </Button>
                    </>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleCancelSelected}
                    disabled={isPending}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancel ({selectedItems.size})
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={handleDeleteSelected}
                    disabled={isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete ({selectedItems.size})
                  </Button>
                </>
              )}
              
              {stats.failed > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRetryFailed}
                  disabled={isPending}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Failed
                </Button>
              )}
              
              {/* Bulk delete dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={isPending}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear...
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {stats.sent > 0 && (
                    <DropdownMenuItem onClick={() => handleDeleteByStatus("sent")}>
                      <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                      Delete all Sent ({stats.sent})
                    </DropdownMenuItem>
                  )}
                  {stats.cancelled > 0 && (
                    <DropdownMenuItem onClick={() => handleDeleteByStatus("cancelled")}>
                      <AlertCircle className="w-4 h-4 mr-2 text-muted-foreground" />
                      Delete all Cancelled ({stats.cancelled})
                    </DropdownMenuItem>
                  )}
                  {stats.failed > 0 && (
                    <DropdownMenuItem onClick={() => handleDeleteByStatus("failed")}>
                      <XCircle className="w-4 h-4 mr-2 text-destructive" />
                      Delete all Failed ({stats.failed})
                    </DropdownMenuItem>
                  )}
                  {stats.queued > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleDeleteByStatus("queued")}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete all Queued ({stats.queued})
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Queue Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Queue Items ({filteredItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {queueItems.length === 0 
                ? "No items in queue. Approve messages in Message Review to add them here."
                : "No items match your filters."}
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.prospect?.name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.prospect?.email || item.prospect?.phone || '—'}
                          </p>
                          {item.prospect?.organization && (
                            <p className="text-xs text-muted-foreground">
                              {item.prospect.organization}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.channel === "email" ? (
                          <Mail className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate text-sm">
                          {item.personalized_subject || "(No subject)"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">
                          {item.scheduled_for 
                            ? new Date(item.scheduled_for).toLocaleString()
                            : "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(item.status)}>
                          <span className="mr-1">{getStatusIcon(item.status)}</span>
                          {item.status}
                        </Badge>
                        {item.error_message && (
                          <p className="text-xs text-destructive mt-1 truncate max-w-[150px]">
                            {item.error_message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => openPreview(item)}
                            title="Preview message"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openPreview(item)}>
                                <Eye className="w-4 h-4 mr-2" />
                                Preview
                              </DropdownMenuItem>
                              {item.status === "queued" && (
                                <>
                                  <DropdownMenuItem onClick={() => handleSendNow([item.id])}>
                                    <Send className="w-4 h-4 mr-2" />
                                    Send Now
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openSchedule([item.id])}>
                                    <Calendar className="w-4 h-4 mr-2" />
                                    Reschedule
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openEdit(item)}>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      startTransition(async () => {
                                        await cancelQueueItems([item.id])
                                      })
                                    }}
                                  >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Cancel
                                  </DropdownMenuItem>
                                </>
                              )}
                              {item.status === "failed" && (
                                <DropdownMenuItem 
                                  onClick={() => {
                                    startTransition(async () => {
                                      await retryFailedItems()
                                    })
                                  }}
                                >
                                  <RefreshCw className="w-4 h-4 mr-2" />
                                  Retry
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDeleteOne(item.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Message Preview</DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Recipient</p>
                  <p className="font-medium">{previewItem.prospect?.name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">
                    {previewItem.prospect?.email || '—'}
                  </p>
                  {previewItem.prospect?.organization && (
                    <p className="text-xs text-muted-foreground">
                      {previewItem.prospect.organization}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="outline" className={getStatusColor(previewItem.status)}>
                    {previewItem.status}
                  </Badge>
                  {previewItem.scheduled_for && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Scheduled: {new Date(previewItem.scheduled_for).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              
              {previewItem.personalized_subject && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Subject</p>
                  <p className="font-medium">{previewItem.personalized_subject}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm text-muted-foreground mb-1">Body</p>
                <ScrollArea className="h-[300px]">
                  <div className="bg-muted/50 rounded-md p-4 text-sm whitespace-pre-wrap">
                    {previewItem.personalized_body}
                  </div>
                </ScrollArea>
              </div>
              
              {previewItem.variation_seed && (
                <p className="text-xs text-muted-foreground">
                  Variation seed: {previewItem.variation_seed}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            {previewItem?.status === "queued" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    closePreview()
                    if (previewItem) openEdit(previewItem)
                  }}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    closePreview()
                    if (previewItem) openSchedule([previewItem.id])
                  }}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Reschedule
                </Button>
                <Button
                  onClick={() => {
                    closePreview()
                    if (previewItem) handleSendNow([previewItem.id])
                  }}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send Now
                </Button>
              </>
            )}
            <Button variant="outline" onClick={closePreview}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editingItem?.prospect && (
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  To: <span className="font-medium text-foreground">{editingItem.prospect.name}</span>
                  {" "}&lt;{editingItem.prospect.email}&gt;
                </p>
                {editingItem.prospect.organization && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {editingItem.prospect.organization}
                  </p>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Email subject..."
              />
            </div>
            
            <div className="space-y-2">
              <Label>Message Body</Label>
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Email body..."
                className="min-h-[300px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button 
              onClick={saveEdit} 
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Reschedule {scheduleItemIds.length} Message{scheduleItemIds.length !== 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Choose a new time for these messages. They will be sent automatically at the scheduled time.
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Date
                </Label>
                <Input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Time
                </Label>
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm">
                <strong>Scheduled for:</strong>{" "}
                {scheduleDate && scheduleTime && (
                  new Date(`${scheduleDate}T${scheduleTime}:00`).toLocaleString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmSchedule} 
              disabled={isPending || !scheduleDate || !scheduleTime}
              className="gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  Reschedule
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
