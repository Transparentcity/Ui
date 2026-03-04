"use client"

import { useMemo, useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { 
  Check, 
  X, 
  Pencil, 
  Mail, 
  User,
  Building,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Copy,
  SendHorizontal,
} from "lucide-react"
import type { SendQueueItem, Contact } from "@/lib/types"
import { 
  updateQueueItemContent, 
  updateQueueItemStatus,
  bulkUpdateQueueItemContent,
  addRecipientsToDraftEmail,
  approveQueueItems, 
  rejectQueueItems,
  regenerateQueueItems
} from "@/app/actions/send-queue"
import { listActiveContactsLite } from "@/app/actions/contacts"
import { useAnomalies } from "@/lib/hooks/useAnomalies"
import { mapApiAnomaliesToCrm } from "@/lib/anomalyMapper"
import { CRM_DEFAULT_CITY_ID } from "@/lib/apiBase"
import { toSlimEmailAnomaly, type CrmEmailAnomaly } from "@/lib/crmAnomalyUtils"
import { isAnomalyIgnored } from "./anomalies-manager"

interface MessageReviewProps {
  items: (SendQueueItem & { prospect?: Contact })[]
  onUpdate?: () => void
}

export function MessageReview({ items, onUpdate }: MessageReviewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingItem, setEditingItem] = useState<SendQueueItem | null>(null)
  const [editSubject, setEditSubject] = useState("")
  const [editBody, setEditBody] = useState("")
  const [isPending, startTransition] = useTransition()
  const [isRegenerating, setIsRegenerating] = useState<Set<string>>(new Set())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [viewMode, setViewMode] = useState<"list" | "single">("list")
  const [showAddRecipientsDialog, setShowAddRecipientsDialog] = useState(false)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsLite, setContactsLite] = useState<
    Array<{
      id: string
      name: string
      email: string | null
      organization: string | null
      department: string | null
      jurisdiction: string | null
      status: string
    }>
  >([])
  const [recipientSearch, setRecipientSearch] = useState("")
  const [addRecipientIds, setAddRecipientIds] = useState<Set<string>>(new Set())
  type ContactLite = {
    id: string
    name: string
    email: string | null
    organization: string | null
    department: string | null
    jurisdiction: string | null
    status: string
  }
  
  // Fetch anomalies from Platform API for email regeneration
  // API max limit is 200 - this provides enough for district + citywide coverage
  const { data: anomalyData, isLoading: anomaliesLoading } = useAnomalies({
    is_anomaly: true,
    limit: 200,
    city_id: CRM_DEFAULT_CITY_ID,
  })
  const anomalies = anomalyData?.results ? mapApiAnomaliesToCrm(anomalyData.results) : []
  
  // Filter out ignored anomalies and create slim objects to avoid payload size issues
  const activeAnomalies = anomalies.filter(a => !isAnomalyIgnored(a.id))
  const slimAnomalies = activeAnomalies.map((a) =>
    toSlimEmailAnomaly(a as CrmEmailAnomaly)
  )

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const selectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  const openEdit = (item: SendQueueItem) => {
    setEditingItem(item)
    setEditSubject(item.personalized_subject || "")
    setEditBody(item.personalized_body || "")
  }

  const saveDraft = () => {
    if (!editingItem) return
    
    startTransition(async () => {
      await updateQueueItemContent(editingItem.id, {
        personalized_subject: editSubject,
        personalized_body: editBody,
      })
      setEditingItem(null)
      onUpdate?.()
    })
  }

  const saveAndMarkSent = () => {
    if (!editingItem) return
    if (!confirm("Save changes and mark this message as sent? This cannot be undone.")) return

    startTransition(async () => {
      await updateQueueItemContent(editingItem.id, {
        personalized_subject: editSubject,
        personalized_body: editBody,
      })
      await updateQueueItemStatus(editingItem.id, "sent")
      setEditingItem(null)
      onUpdate?.()
    })
  }

  const applyEditToSelected = () => {
    if (!editingItem) return
    const ids = new Set<string>(Array.from(selectedIds))
    ids.add(editingItem.id)
    const targetIds = Array.from(ids)
    if (targetIds.length < 2) return
    if (!confirm(`Apply this exact subject/body to ${targetIds.length} selected message(s)?`)) return

    startTransition(async () => {
      await bulkUpdateQueueItemContent({
        ids: targetIds,
        personalized_subject: editSubject,
        personalized_body: editBody,
      })
      setEditingItem(null)
      onUpdate?.()
    })
  }

  const existingProspectIds = useMemo(() => {
    return new Set(items.map((i) => String(i.prospect_id)))
  }, [items])

  const filteredContacts = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase()
    const rows = contactsLite
    const visible = q
      ? rows.filter((c) => {
          const hay = `${c.name || ""} ${c.email || ""} ${c.organization || ""} ${
            c.department || ""
          } ${c.jurisdiction || ""}`.toLowerCase()
          return hay.includes(q)
        })
      : rows

    // Hide contacts already in this pending-review batch.
    return visible.filter((c) => !existingProspectIds.has(String(c.id)))
  }, [contactsLite, recipientSearch, existingProspectIds])

  const openAddRecipients = async () => {
    if (!editingItem) return
    setAddRecipientIds(new Set())
    setRecipientSearch("")
    setShowAddRecipientsDialog(true)

    if (contactsLite.length === 0 && !contactsLoading) {
      setContactsLoading(true)
      try {
        const rows = await listActiveContactsLite()
        setContactsLite(rows as ContactLite[])
      } finally {
        setContactsLoading(false)
      }
    }
  }

  const confirmAddRecipients = () => {
    if (!editingItem) return
    const ids = Array.from(addRecipientIds)
    if (ids.length === 0) return
    startTransition(async () => {
      await addRecipientsToDraftEmail({
        source_queue_item_id: editingItem.id,
        prospect_ids: ids,
        personalized_subject: editSubject,
        personalized_body: editBody,
      })
      setShowAddRecipientsDialog(false)
      setAddRecipientIds(new Set())
      onUpdate?.()
    })
  }

  // Copy helpers for edit dialog
  const [copiedField, setCopiedField] = useState<"subject" | "body" | null>(null)
  const copyToClipboard = async (text: string, field: "subject" | "body") => {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleApprove = (ids: string[]) => {
    if (ids.length === 0) return
    
    startTransition(async () => {
      // Approve without manual scheduling - uses automatic throttle scheduling
      await approveQueueItems(ids)
      setSelectedIds(new Set())
      onUpdate?.()
    })
  }

  const handleReject = (ids: string[]) => {
    if (ids.length === 0) return
    if (!confirm(`Are you sure you want to reject ${ids.length} message(s)? This cannot be undone.`)) return
    
    startTransition(async () => {
      await rejectQueueItems(ids)
      setSelectedIds(new Set())
      onUpdate?.()
    })
  }

  const handleRegenerate = async (ids: string[]) => {
    if (ids.length === 0) return
    
    // Check if anomalies are still loading
    if (anomaliesLoading) {
      alert('Anomaly data is still loading. Please wait a moment and try again.')
      return
    }
    
    // Warn if no anomalies available
    if (slimAnomalies.length === 0) {
      const proceed = confirm(
        'Warning: No anomaly data available for regeneration.\n\n' +
        'This could be an authentication or API issue.\n' +
        'Regenerating without anomaly data will produce generic emails.\n\n' +
        'Continue anyway?'
      )
      if (!proceed) return
    }
    
    if (!confirm(`Regenerate ${ids.length} message(s) with AI using DIFFERENT anomalies? The current content will be replaced.`)) return
    
    // Log detailed anomaly info
    const citywideCount = slimAnomalies.filter(a => a.is_citywide === true || a.district === 0).length
    const districtCounts: Record<string, number> = {}
    slimAnomalies.forEach(a => {
      const d = a.district === 0 ? 'Citywide' : `D${a.district}`
      districtCounts[d] = (districtCounts[d] || 0) + 1
    })
    console.log('[MessageReview] Regenerating with', slimAnomalies.length, 'anomalies available')
    console.log('[MessageReview] Citywide anomalies:', citywideCount)
    console.log('[MessageReview] By district:', districtCounts)
    if (slimAnomalies.length > 0) {
      console.log('[MessageReview] Sample anomaly:', JSON.stringify(slimAnomalies[0]))
    }
    
    // Mark items as regenerating
    setIsRegenerating(new Set(ids))
    
    startTransition(async () => {
      try {
        await regenerateQueueItems(ids, slimAnomalies)
        onUpdate?.()
      } finally {
        setIsRegenerating(new Set())
      }
    })
  }

  const currentItem = items[currentIndex]

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No messages pending review</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            List View
          </Button>
          <Button
            variant={viewMode === "single" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("single")}
          >
            Single View
          </Button>
        </div>
        
        {viewMode === "list" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} of {items.length} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
            >
              {selectedIds.size === items.length ? "Deselect All" : "Select All"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRegenerate(Array.from(selectedIds))}
              disabled={selectedIds.size === 0 || isPending || isRegenerating.size > 0}
              className="gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Regenerate ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              onClick={() => handleApprove(Array.from(selectedIds))}
              disabled={selectedIds.size === 0 || isPending}
              className="gap-2"
              style={{ background: 'var(--brand-primary)' }}
            >
              <Check className="w-4 h-4" />
              Approve Selected
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleReject(Array.from(selectedIds))}
              disabled={selectedIds.size === 0 || isPending}
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Reject Selected
            </Button>
          </div>
        )}
      </div>

      {/* List View */}
      {viewMode === "list" && (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className={selectedIds.has(item.id) ? "ring-2 ring-(--brand-primary)" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={() => toggleSelect(item.id)}
                    className="mt-1"
                  />
                  
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Recipient info */}
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{item.prospect?.name || 'Unknown'}</span>
                      </div>
                      <span className="text-muted-foreground">{item.prospect?.email}</span>
                      {item.prospect?.organization && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Building className="w-3 h-3" />
                          <span>{item.prospect.organization}</span>
                        </div>
                      )}
                      {item.prospect?.jurisdiction && (
                        <Badge variant="outline" className="text-xs">
                          {item.prospect.jurisdiction}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Subject */}
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="font-medium truncate">{item.personalized_subject || "(No subject)"}</p>
                    </div>
                    
                    {/* Body preview */}
                    <p className="text-sm text-muted-foreground line-clamp-2 pl-6">
                      {item.personalized_body}
                    </p>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRegenerate([item.id])}
                      disabled={isPending || isRegenerating.has(item.id)}
                      className="gap-1"
                      title="Regenerate with AI"
                    >
                      {isRegenerating.has(item.id) ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(item)}
                      className="gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleApprove([item.id])}
                      disabled={isPending}
                      className="gap-1"
                    >
                      <Check className="w-3 h-3" />
                      Approve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Single View (one at a time) */}
      {viewMode === "single" && currentItem && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Message {currentIndex + 1} of {items.length}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentIndex(Math.min(items.length - 1, currentIndex + 1))}
                  disabled={currentIndex === items.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Recipient */}
            <div className="p-4 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Recipient</h4>
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-semibold">{currentItem.prospect?.name}</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{currentItem.prospect?.email}</p>
                </div>
                {currentItem.prospect?.organization && (
                  <Badge variant="outline">{currentItem.prospect.organization}</Badge>
                )}
                {currentItem.prospect?.jurisdiction && (
                  <Badge variant="outline">{currentItem.prospect.jurisdiction}</Badge>
                )}
              </div>
            </div>

            {/* Subject */}
            <div>
              <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Subject</h4>
              <p className="text-lg font-medium p-3 rounded-lg border" style={{ borderColor: 'var(--border-primary)' }}>
                {currentItem.personalized_subject || "(No subject)"}
              </p>
            </div>

            {/* Body */}
            <div>
              <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Message Body</h4>
              <div 
                className="p-4 rounded-lg border whitespace-pre-wrap text-sm"
                style={{ borderColor: 'var(--border-primary)', minHeight: '200px' }}
              >
                {currentItem.personalized_body}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleRegenerate([currentItem.id])}
                  disabled={isPending || isRegenerating.has(currentItem.id)}
                  className="gap-2"
                >
                  {isRegenerating.has(currentItem.id) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Regenerate
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openEdit(currentItem)}
                  className="gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Edit Message
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="destructive"
                  onClick={() => handleReject([currentItem.id])}
                  disabled={isPending}
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Reject
                </Button>
                <Button
                  onClick={() => handleApprove([currentItem.id])}
                  disabled={isPending}
                  className="gap-2"
                  style={{ background: 'var(--brand-primary)' }}
                >
                  <Check className="w-4 h-4" />
                  Approve
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editingItem?.prospect && (
              <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  To: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{editingItem.prospect.name}</span>
                  {" "}&lt;{editingItem.prospect.email}&gt;
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Subject</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-muted-foreground"
                  onClick={() => copyToClipboard(editSubject, "subject")}
                >
                  {copiedField === "subject" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedField === "subject" ? "Copied" : "Copy"}
                </Button>
              </div>
              <Input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Email subject..."
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Message Body</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-muted-foreground"
                  onClick={() => copyToClipboard(editBody, "body")}
                >
                  {copiedField === "body" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedField === "body" ? "Copied" : "Copy"}
                </Button>
              </div>
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Email body..."
                className="min-h-[300px]"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={applyEditToSelected}
              disabled={isPending || (() => {
                const ids = new Set<string>(Array.from(selectedIds))
                if (editingItem?.id) ids.add(editingItem.id)
                return ids.size < 2
              })()}
              className="sm:mr-auto"
              title="Make the selected messages identical"
            >
              Make Selected Identical
            </Button>
            <Button variant="outline" onClick={openAddRecipients} disabled={isPending}>
              Add Recipients...
            </Button>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={saveDraft} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Draft"
              )}
            </Button>
            <Button
              onClick={saveAndMarkSent}
              disabled={isPending || editingItem?.status === "sent"}
              className="gap-2"
              style={{ background: "var(--brand-primary)" }}
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <SendHorizontal className="w-4 h-4" />
                  Save and Mark Sent
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add recipients dialog */}
      <Dialog open={showAddRecipientsDialog} onOpenChange={setShowAddRecipientsDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Recipients</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Search contacts and add them to this same draft email. New recipients will appear
              as separate draft messages in Message Review.
            </p>
            <Input
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
              placeholder="Search contacts by name, email, org…"
            />
            <div className="border rounded-md max-h-[320px] overflow-auto">
              {contactsLoading ? (
                <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading contacts…
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No contacts found.</div>
              ) : (
                <div className="divide-y">
                  {filteredContacts.slice(0, 150).map((c) => {
                    const id = String(c.id)
                    const checked = addRecipientIds.has(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setAddRecipientIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(id)) next.delete(id)
                            else next.add(id)
                            return next
                          })
                        }}
                        className="w-full text-left p-3 hover:bg-muted/40 flex items-start gap-3"
                      >
                        <Checkbox checked={checked} />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {[c.email, c.organization, c.department, c.jurisdiction]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Selected: {addRecipientIds.size}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRecipientsDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmAddRecipients}
              disabled={isPending || addRecipientIds.size === 0}
            >
              Add {addRecipientIds.size || ""} Recipient{addRecipientIds.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
