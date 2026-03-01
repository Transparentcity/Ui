"use client"

import { useState, useTransition, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
  Sparkles,
  Copy,
  SendHorizontal,
  ExternalLink,
  Trash2,
  BarChart3,
  MapPin,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowRightLeft,
} from "lucide-react"
import type { SendQueueItem, Contact } from "@/lib/types"
import {
  updateQueueItemContent,
  updateQueueItemStatus,
  deleteQueueItems,
} from "@/app/actions/send-queue"
import { API_BASE } from "@/lib/apiBase"

type TabKey = "pending" | "sent" | "all"

interface ApplicableAnomaly {
  result_id: number
  snippet: string
  object_name: string
  pct_change: number
  period_type: string
  district: number | null
  current: boolean
}

interface ReviewAndSendProps {
  items: (SendQueueItem & { prospect?: Contact })[]
}

export function ReviewAndSend({ items }: ReviewAndSendProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>("pending")
  const [editingItem, setEditingItem] = useState<SendQueueItem | null>(null)
  const [editSubject, setEditSubject] = useState("")
  const [editBody, setEditBody] = useState("")
  const [isPending, startTransition] = useTransition()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<"subject" | "body" | "full" | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Regenerate state
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)

  // Anomaly picker state
  const [anomalyPickerDraftId, setAnomalyPickerDraftId] = useState<string | null>(null)
  const [applicableAnomalies, setApplicableAnomalies] = useState<ApplicableAnomaly[]>([])
  const [loadingAnomalies, setLoadingAnomalies] = useState(false)
  const [swappingAnomalyId, setSwappingAnomalyId] = useState<number | null>(null)

  // Filter items by tab
  const filteredItems = items.filter((item) => {
    if (activeTab === "pending") return item.status === "pending_review"
    if (activeTab === "sent") return item.status === "sent"
    return true
  })

  const pendingCount = items.filter((i) => i.status === "pending_review").length
  const sentCount = items.filter((i) => i.status === "sent").length

  // Toggle body expand/collapse
  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedIds(next)
  }

  // Copy full email
  const copyFullEmail = async (item: SendQueueItem) => {
    try {
      const text = `Subject: ${item.personalized_subject || ""}\n\n${item.personalized_body || ""}`
      await navigator.clipboard.writeText(text)
      setCopiedId(item.id)
      setCopiedField("full")
      setTimeout(() => { setCopiedId(null); setCopiedField(null) }, 2000)
    } catch (err) {
      console.error("Copy failed:", err)
    }
  }

  const copyBody = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField("body")
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error("Copy failed:", err)
    }
  }

  const copySubject = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField("subject")
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error("Copy failed:", err)
    }
  }

  // Open edit dialog
  const openEdit = (item: SendQueueItem) => {
    setEditingItem(item)
    setEditSubject(item.personalized_subject || "")
    setEditBody(item.personalized_body || "")
  }

  // Save edits
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

  // Mark as sent
  const markAsSent = (id: string) => {
    startTransition(async () => {
      await updateQueueItemStatus(id, "sent")
      router.refresh()
    })
  }

  const markAsSentFromDialog = () => {
    if (!editingItem) return
    startTransition(async () => {
      await updateQueueItemStatus(editingItem.id, "sent")
      setEditingItem(null)
      router.refresh()
    })
  }

  // Discard
  const discardItem = (id: string) => {
    if (!confirm("Discard this draft? It will be removed from the queue.")) return
    startTransition(async () => {
      await deleteQueueItems([id])
      router.refresh()
    })
  }

  // Regenerate draft text (keep same anomaly, new LLM variation)
  const regenerateDraft = useCallback(async (draftId: string) => {
    setRegeneratingId(draftId)
    try {
      const resp = await fetch(`${API_BASE}/api/crm/drafts/${draftId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!resp.ok) throw new Error("Regenerate failed")
      router.refresh()
    } catch (err) {
      console.error("Regenerate error:", err)
    } finally {
      setRegeneratingId(null)
    }
  }, [router])

  // Fetch applicable anomalies for a draft
  const fetchApplicableAnomalies = useCallback(async (draftId: string) => {
    if (anomalyPickerDraftId === draftId) {
      // Toggle off
      setAnomalyPickerDraftId(null)
      setApplicableAnomalies([])
      return
    }
    setAnomalyPickerDraftId(draftId)
    setLoadingAnomalies(true)
    try {
      const resp = await fetch(`${API_BASE}/api/crm/drafts/${draftId}/applicable-anomalies`)
      if (!resp.ok) throw new Error("Failed to fetch anomalies")
      const data = await resp.json()
      setApplicableAnomalies(data.anomalies || [])
    } catch (err) {
      console.error("Fetch anomalies error:", err)
      setApplicableAnomalies([])
    } finally {
      setLoadingAnomalies(false)
    }
  }, [anomalyPickerDraftId])

  // Swap anomaly on a draft
  const swapAnomaly = useCallback(async (draftId: string, resultId: number) => {
    setSwappingAnomalyId(resultId)
    try {
      const resp = await fetch(`${API_BASE}/api/crm/drafts/${draftId}/swap-anomaly`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anomaly_result_id: resultId }),
      })
      if (!resp.ok) throw new Error("Swap failed")
      setAnomalyPickerDraftId(null)
      setApplicableAnomalies([])
      router.refresh()
    } catch (err) {
      console.error("Swap anomaly error:", err)
    } finally {
      setSwappingAnomalyId(null)
    }
  }, [router])

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "pending", label: "Pending Review", count: pendingCount },
    { key: "sent", label: "Sent", count: sentCount },
    { key: "all", label: "All", count: items.length },
  ]

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
            <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
              activeTab === tab.key
                ? "bg-purple-100 text-purple-700"
                : "bg-gray-100 text-gray-500"
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filteredItems.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">
              {activeTab === "pending"
                ? "No messages pending review. Use AI Compose to generate drafts."
                : activeTab === "sent"
                ? "No sent messages yet."
                : "No messages in the queue."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Draft cards */}
      <div className="space-y-3">
        {filteredItems.map((item) => {
          const isExpanded = expandedIds.has(item.id)
          const isSent = item.status === "sent"
          const isCopied = copiedId === item.id && copiedField === "full"
          const isRegenerating = regeneratingId === item.id
          const isAnomalyPickerOpen = anomalyPickerDraftId === item.id

          return (
            <Card
              key={item.id}
              className={`transition-shadow hover:shadow-md ${
                isSent ? "opacity-75" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* Top row: contact info + status badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900">
                          {item.prospect?.name || "Unknown"}
                        </span>
                      </div>
                      {item.prospect?.email && (
                        <span className="text-gray-500">{item.prospect.email}</span>
                      )}
                      {item.prospect?.organization && (
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <Building className="w-3 h-3" />
                          <span>{item.prospect.organization}</span>
                        </div>
                      )}
                      {(item.prospect as any)?.city_name && (
                        <div className="flex items-center gap-1 text-gray-500">
                          <MapPin className="w-3 h-3" />
                          <span className="text-xs">{(item.prospect as any).city_name}</span>
                        </div>
                      )}
                      {item.prospect?.jurisdiction && (
                        <Badge variant="outline" className="text-xs">
                          {item.prospect.jurisdiction}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isSent && item.sent_at && (
                        <span className="text-xs text-gray-400">
                          Sent {new Date(item.sent_at).toLocaleDateString()}
                        </span>
                      )}
                      <Badge
                        variant={isSent ? "default" : "secondary"}
                        className={`text-xs ${
                          isSent
                            ? "bg-green-100 text-green-700 border-green-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {isSent ? "Sent" : "Pending Review"}
                      </Badge>
                    </div>
                  </div>

                  {/* Subject line */}
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                    <p className="font-medium text-gray-900 truncate">
                      {item.personalized_subject || "(No subject)"}
                    </p>
                  </div>

                  {/* Body preview / expanded */}
                  <div
                    className="cursor-pointer pl-6"
                    onClick={() => toggleExpand(item.id)}
                  >
                    {isExpanded ? (
                      <div className="text-sm text-gray-700 whitespace-pre-wrap p-3 bg-gray-50 rounded-lg border border-gray-100">
                        {item.personalized_body}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {item.personalized_body}
                      </p>
                    )}
                  </div>

                  {/* Anomaly info + chart link + anomaly count */}
                  {(item.anomaly_snippet || item.chart_url) && (
                    <div className="flex items-center gap-3 pl-6 text-xs text-gray-500">
                      {item.anomaly_snippet && (
                        <div className="flex items-center gap-1">
                          <BarChart3 className="w-3 h-3" />
                          <span>{item.anomaly_snippet}</span>
                        </div>
                      )}
                      {item.chart_url && (
                        <a
                          href={item.chart_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-purple-600 hover:text-purple-800"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" />
                          View Chart
                        </a>
                      )}
                    </div>
                  )}

                  {/* Anomaly picker (inline, toggled) */}
                  {isAnomalyPickerOpen && (
                    <div className="pl-6">
                      <div className="border rounded-lg bg-gray-50 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-700">
                            Choose a different anomaly
                          </p>
                          {loadingAnomalies && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                        </div>
                        {!loadingAnomalies && applicableAnomalies.length === 0 && (
                          <p className="text-sm text-gray-500">No other anomalies found for this city.</p>
                        )}
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {applicableAnomalies.map((a) => (
                            <button
                              key={a.result_id}
                              onClick={() => {
                                if (!a.current) swapAnomaly(item.id, a.result_id)
                              }}
                              disabled={a.current || swappingAnomalyId === a.result_id}
                              className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors ${
                                a.current
                                  ? "bg-purple-100 border border-purple-200 text-purple-800"
                                  : "hover:bg-white border border-transparent hover:border-gray-200"
                              }`}
                            >
                              {swappingAnomalyId === a.result_id ? (
                                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                              ) : a.current ? (
                                <Check className="w-3 h-3 shrink-0 text-purple-600" />
                              ) : (
                                <ArrowRightLeft className="w-3 h-3 shrink-0 text-gray-400" />
                              )}
                              <span className="flex-1 truncate">{a.snippet}</span>
                              {a.current && (
                                <span className="text-xs text-purple-600 font-medium">Current</span>
                              )}
                              {a.district !== null && a.district !== 0 && (
                                <Badge variant="outline" className="text-xs">D{a.district}</Badge>
                              )}
                              {(a.district === null || a.district === 0) && (
                                <Badge variant="outline" className="text-xs">Citywide</Badge>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyFullEmail(item)}
                        className="gap-1.5 text-xs"
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {isCopied ? "Copied!" : "Copy Email"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(item)}
                        className="gap-1.5 text-xs"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      {!isSent && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => regenerateDraft(item.id)}
                            disabled={isRegenerating}
                            className="gap-1.5 text-xs"
                          >
                            {isRegenerating ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                            {isRegenerating ? "Regenerating..." : "Regenerate"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchApplicableAnomalies(item.id)}
                            disabled={loadingAnomalies && anomalyPickerDraftId === item.id}
                            className={`gap-1.5 text-xs ${isAnomalyPickerOpen ? 'bg-purple-50 border-purple-200' : ''}`}
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            Anomalies
                            {isAnomalyPickerOpen ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isSent && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => discardItem(item.id)}
                            disabled={isPending}
                            className="gap-1.5 text-xs text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Discard
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => markAsSent(item.id)}
                            disabled={isPending}
                            className="gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white"
                          >
                            <SendHorizontal className="w-3.5 h-3.5" />
                            Mark as Sent
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editingItem?.prospect && (
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-sm text-gray-500">
                  To:{" "}
                  <span className="font-medium text-gray-900">
                    {editingItem.prospect.name}
                  </span>{" "}
                  &lt;{editingItem.prospect.email}&gt;
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
                  className="h-7 gap-1.5 text-xs text-gray-500"
                  onClick={() => copySubject(editSubject)}
                >
                  {copiedField === "subject" ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
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
                  className="h-7 gap-1.5 text-xs text-gray-500"
                  onClick={() => copyBody(editBody)}
                >
                  {copiedField === "body" ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
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

            {/* Chart link in edit dialog */}
            {editingItem?.chart_url && (
              <div className="flex items-center gap-2 text-sm">
                <BarChart3 className="w-4 h-4 text-gray-400" />
                <a
                  href={editingItem.chart_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:text-purple-800 flex items-center gap-1"
                >
                  View anomaly chart
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2 sm:mr-auto">
              <Button
                variant="outline"
                onClick={markAsSentFromDialog}
                disabled={isPending || editingItem?.status === "sent"}
                className="gap-2 text-green-600 border-green-300 hover:bg-green-50"
              >
                <SendHorizontal className="w-4 h-4" />
                Mark as Sent
              </Button>
              {editingItem && editingItem.status !== "sent" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (editingItem) {
                      regenerateDraft(editingItem.id)
                      setEditingItem(null)
                    }
                  }}
                  disabled={regeneratingId === editingItem?.id}
                  className="gap-2 text-purple-600 border-purple-300 hover:bg-purple-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Regenerate
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white"
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
    </div>
  )
}
