"use client"

import { useState, useTransition, useCallback, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth0 } from "@auth0/auth0-react"
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
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
  CheckSquare,
  Square,
  Search,
  AlertTriangle,
} from "lucide-react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"
import type { SendQueueItem, Contact } from "@/lib/types"
import {
  updateQueueItemContent,
  updateQueueItemStatus,
  deleteQueueItems,
  sendSingleQueueItem,
  checkSendGridStatus,
} from "@/app/actions/send-queue"
import { getApiBaseUrl } from "@/lib/apiBase"
import { toast } from "sonner"

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
  const { getAccessTokenSilently } = useAuth0()
  const [activeTab, setActiveTab] = useState<TabKey>("pending")
  const [searchQuery, setSearchQuery] = useState("")
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

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Generate drafts state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<string | null>(null)

  // Per-item loading states
  const [markingSentId, setMarkingSentId] = useState<string | null>(null)
  const [discardingId, setDiscardingId] = useState<string | null>(null)
  const [bulkAction, setBulkAction] = useState<"sent" | "discard" | null>(null)

  // SendGrid configuration status
  const [sendGridReady, setSendGridReady] = useState<boolean | null>(null)
  useEffect(() => {
    checkSendGridStatus().then(({ configured }) => setSendGridReady(configured))
  }, [])

  // Confirm dialog state (replaces window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    description: string
    action: () => void
    actionLabel: string
    variant: "destructive" | "default"
  } | null>(null)

  // Helper to get auth headers for API calls
  const getAuthHeaders = useCallback(async (contentType?: boolean) => {
    const headers: Record<string, string> = {}
    try {
      const token = await getAccessTokenSilently()
      headers["Authorization"] = `Bearer ${token}`
    } catch {
      // In dev mode, auth may not be configured
    }
    if (contentType) headers["Content-Type"] = "application/json"
    return headers
  }, [getAccessTokenSilently])

  // Filter items by tab and search
  const filteredItems = items.filter((item) => {
    if (activeTab === "pending" && item.status !== "pending_review") return false
    if (activeTab === "sent" && item.status !== "sent") return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const name = item.prospect?.name?.toLowerCase() || ""
      const email = item.prospect?.email?.toLowerCase() || ""
      const city = (item.prospect as any)?.city_name?.toLowerCase() || ""
      const subject = item.personalized_subject?.toLowerCase() || ""
      const snippet = item.anomaly_snippet?.toLowerCase() || ""
      if (!name.includes(q) && !email.includes(q) && !city.includes(q) && !subject.includes(q) && !snippet.includes(q)) return false
    }
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
      toast.success("Copied")
      setTimeout(() => { setCopiedId(null); setCopiedField(null) }, 2000)
    } catch (err) {
      toast.error("Failed to copy")
    }
  }

  const copyBody = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField("body")
      toast.success("Copied")
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      toast.error("Failed to copy")
    }
  }

  const copySubject = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField("subject")
      toast.success("Copied")
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      toast.error("Failed to copy")
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
      try {
        await updateQueueItemContent(editingItem.id, {
          personalized_subject: editSubject,
          personalized_body: editBody,
        })
        toast.success("Draft saved")
        setEditingItem(null)
        router.refresh()
      } catch (err) {
        toast.error("Failed to save draft")
      }
    })
  }

  // Mark as sent
  const markAsSent = (id: string) => {
    setMarkingSentId(id)
    startTransition(async () => {
      try {
        await updateQueueItemStatus(id, "sent")
        toast.success("Marked as sent")
        setMarkingSentId(null)
        router.refresh()
      } catch (err) {
        toast.error("Failed to mark as sent")
        setMarkingSentId(null)
      }
    })
  }

  const markAsSentFromDialog = () => {
    if (!editingItem) return
    startTransition(async () => {
      try {
        await updateQueueItemStatus(editingItem.id, "sent")
        toast.success("Marked as sent")
        setEditingItem(null)
        router.refresh()
      } catch (err) {
        toast.error("Failed to mark as sent")
      }
    })
  }

  // Send via SendGrid
  const [sendingId, setSendingId] = useState<string | null>(null)

  const sendViaEmail = (id: string) => {
    setConfirmDialog({
      title: "Send this email?",
      description: "This will send the email to the contact via SendGrid. This action cannot be undone.",
      actionLabel: "Send Email",
      variant: "default",
      action: () => {
        setSendingId(id)
        startTransition(async () => {
          try {
            const item = items.find(i => i.id === id)
            if (item?.status === "pending_review") {
              await updateQueueItemStatus(id, "queued")
            }
            const result = await sendSingleQueueItem(id)
            if (result.success) {
              toast.success("Email sent successfully")
            } else {
              toast.error(result.error || "Failed to send email")
            }
            setSendingId(null)
            router.refresh()
          } catch (err) {
            toast.error("Failed to send email")
            setSendingId(null)
          }
        })
      },
    })
  }

  const sendViaEmailFromDialog = () => {
    if (!editingItem) return
    setConfirmDialog({
      title: "Send this email?",
      description: "This will send the email to the contact via SendGrid. This action cannot be undone.",
      actionLabel: "Send Email",
      variant: "default",
      action: () => {
        setSendingId(editingItem.id)
        startTransition(async () => {
          try {
            if (editingItem.status === "pending_review") {
              await updateQueueItemStatus(editingItem.id, "queued")
            }
            const result = await sendSingleQueueItem(editingItem.id)
            if (result.success) {
              toast.success("Email sent successfully")
            } else {
              toast.error(result.error || "Failed to send email")
            }
            setSendingId(null)
            setEditingItem(null)
            router.refresh()
          } catch (err) {
            toast.error("Failed to send email")
            setSendingId(null)
          }
        })
      },
    })
  }

  // Discard
  const discardItem = (id: string) => {
    setConfirmDialog({
      title: "Discard draft?",
      description: "This draft will be permanently removed from the queue.",
      actionLabel: "Discard",
      variant: "destructive",
      action: () => {
        setDiscardingId(id)
        startTransition(async () => {
          try {
            await deleteQueueItems([id])
            toast.success("Draft discarded")
            setDiscardingId(null)
            router.refresh()
          } catch (err) {
            toast.error("Failed to discard draft")
            setDiscardingId(null)
          }
        })
      },
    })
  }

  // Regenerate draft text (keep same anomaly, new LLM variation)
  const regenerateDraft = useCallback(async (draftId: string) => {
    setRegeneratingId(draftId)
    try {
      const headers = await getAuthHeaders(true)
      const resp = await fetch(`${getApiBaseUrl()}/api/crm/drafts/${draftId}/regenerate`, {
        method: "POST",
        headers,
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        const detail = data.detail || ""
        if (detail.includes("missing anomaly") || resp.status === 400) {
          toast.error("Can't regenerate — this older draft doesn't have anomaly data linked. Use AI Compose to create a new draft for this contact.")
        } else {
          toast.error("Regenerate failed. Please try again.")
        }
        return
      }
      toast.success("Draft regenerated")
      router.refresh()
    } catch (err) {
      console.error("Regenerate error:", err)
      toast.error("Regenerate failed. Please try again.")
    } finally {
      setRegeneratingId(null)
    }
  }, [router, getAuthHeaders])

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
      const headers = await getAuthHeaders()
      const resp = await fetch(`${getApiBaseUrl()}/api/crm/drafts/${draftId}/applicable-anomalies`, { headers })
      if (!resp.ok) throw new Error("Failed to fetch anomalies")
      const data = await resp.json()
      setApplicableAnomalies(data.anomalies || [])
    } catch (err) {
      console.error("Fetch anomalies error:", err)
      setApplicableAnomalies([])
    } finally {
      setLoadingAnomalies(false)
    }
  }, [anomalyPickerDraftId, getAuthHeaders])

  // Swap anomaly on a draft
  const swapAnomaly = useCallback(async (draftId: string, resultId: number) => {
    setSwappingAnomalyId(resultId)
    try {
      const headers = await getAuthHeaders(true)
      const resp = await fetch(`${getApiBaseUrl()}/api/crm/drafts/${draftId}/swap-anomaly`, {
        method: "POST",
        headers,
        body: JSON.stringify({ anomaly_result_id: resultId }),
      })
      if (!resp.ok) throw new Error("Swap failed")
      toast.success("Anomaly swapped")
      setAnomalyPickerDraftId(null)
      setApplicableAnomalies([])
      router.refresh()
    } catch (err) {
      console.error("Swap anomaly error:", err)
      toast.error("Failed to swap anomaly")
    } finally {
      setSwappingAnomalyId(null)
    }
  }, [router, getAuthHeaders])

  // Generate drafts (bulk anomaly-to-prospect matching)
  const generateDrafts = useCallback(async () => {
    setIsGenerating(true)
    setGenerateResult(null)
    try {
      const headers = await getAuthHeaders(true)
      const resp = await fetch(`${getApiBaseUrl()}/api/crm/generate-drafts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ lookback_days: 7 }),
      })
      if (!resp.ok) throw new Error("Generate drafts failed")
      const data = await resp.json()
      if (data.drafts_created > 0) {
        setGenerateResult(`Created ${data.drafts_created} draft(s) from ${data.anomalies_found} anomalies across ${data.cities_processed} city/cities.`)
        router.refresh()
      } else if (data.error) {
        setGenerateResult(data.error)
      } else {
        setGenerateResult("No new matches found. Try adjusting lookback or adding more contacts.")
      }
    } catch (err) {
      console.error("Generate drafts error:", err)
      setGenerateResult("Failed to generate drafts. Check the console for details.")
    } finally {
      setIsGenerating(false)
    }
  }, [router, getAuthHeaders])

  // Bulk selection helpers
  const pendingItems = useMemo(
    () => items.filter((i) => i.status === "pending_review"),
    [items]
  )

  // Filtered pending items: the subset of filteredItems that are pending
  const filteredPendingItems = useMemo(
    () => filteredItems.filter((i) => i.status === "pending_review"),
    [filteredItems]
  )

  const allPendingSelected =
    filteredPendingItems.length > 0 && filteredPendingItems.every((i) => selectedIds.has(i.id))
  const somePendingSelected = selectedIds.size > 0

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredPendingItems.map((i) => i.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // Clear selection when tab changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [activeTab])

  // Bulk mark as sent
  const bulkMarkSent = () => {
    if (selectedIds.size === 0) return
    setConfirmDialog({
      title: `Mark ${selectedIds.size} item(s) as sent?`,
      description: "These drafts will be moved to the Sent tab.",
      actionLabel: "Mark Sent",
      variant: "default",
      action: () => {
        setBulkAction("sent")
        startTransition(async () => {
          try {
            await Promise.all(
              Array.from(selectedIds).map((id) => updateQueueItemStatus(id, "sent"))
            )
            toast.success(`Marked ${selectedIds.size} draft${selectedIds.size !== 1 ? 's' : ''} as sent`)
            setSelectedIds(new Set())
            setBulkAction(null)
            router.refresh()
          } catch (err) {
            toast.error("Failed to mark drafts as sent")
            setBulkAction(null)
          }
        })
      },
    })
  }

  // Bulk discard
  const bulkDiscard = () => {
    if (selectedIds.size === 0) return
    setConfirmDialog({
      title: `Discard ${selectedIds.size} item(s)?`,
      description: "These drafts will be permanently removed from the queue.",
      actionLabel: "Discard",
      variant: "destructive",
      action: () => {
        setBulkAction("discard")
        startTransition(async () => {
          try {
            await deleteQueueItems(Array.from(selectedIds))
            toast.success(`Discarded ${selectedIds.size} draft${selectedIds.size !== 1 ? 's' : ''}`)
            setSelectedIds(new Set())
            setBulkAction(null)
            router.refresh()
          } catch (err) {
            toast.error("Failed to discard drafts")
            setBulkAction(null)
          }
        })
      },
    })
  }

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "pending", label: "Pending Review", count: pendingCount },
    { key: "sent", label: "Sent", count: sentCount },
    { key: "all", label: "All", count: items.length },
  ]

  return (
    <TooltipProvider>
    <div className="space-y-4">
      {/* SendGrid not configured banner */}
      {sendGridReady === false && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            <strong>Email sending not configured.</strong> Add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL to .env.local (same values as the backend .env) to enable the Send Email button.
          </span>
        </div>
      )}
      {/* Tabs + Generate button */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-0">
        <div className="flex items-center gap-1">
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
        <Button
          onClick={generateDrafts}
          disabled={isGenerating}
          className="gap-2 bg-purple-600 hover:bg-purple-700 text-white mb-1"
          size="sm"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isGenerating ? "Generating..." : "Generate Drafts"}
        </Button>
      </div>

      {/* Generate drafts progress card */}
      {isGenerating && (
        <Card className="border-purple-100">
          <CardContent className="p-5">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500 shrink-0" />
                <span className="text-gray-700">Scanning recent anomalies across cities...</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-4 h-4 rounded-full border-2 border-gray-200 shrink-0" />
                <span className="text-gray-300">Matching anomalies to contacts...</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-4 h-4 rounded-full border-2 border-gray-200 shrink-0" />
                <span className="text-gray-300">Generating personalized drafts...</span>
              </div>
              <p className="text-xs text-gray-500 pl-7">This may take a moment depending on how many contacts match.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search drafts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {searchQuery && (
          <p className="text-sm text-muted-foreground" data-testid="search-count">
            Showing {filteredItems.length} of{" "}
            {activeTab === "pending"
              ? pendingCount
              : activeTab === "sent"
                ? sentCount
                : items.length}{" "}
            drafts
          </p>
        )}
      </div>

      {/* Generate result banner */}
      {generateResult && !isGenerating && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">
          <span>{generateResult}</span>
          <button onClick={() => setGenerateResult(null)} className="text-gray-500 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk action toolbar (pending tab only) */}
      {activeTab === "pending" && filteredPendingItems.length > 0 && (
        <div className="flex items-center gap-3 px-1">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            {allPendingSelected ? (
              <CheckSquare className="w-4 h-4 text-purple-600" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            {allPendingSelected
              ? "Deselect all"
              : searchQuery
                ? `Select all ${filteredPendingItems.length}`
                : "Select all"}
          </button>
          {somePendingSelected && (
            <>
              <span className="text-xs text-gray-500">
                {selectedIds.size} selected
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={bulkMarkSent}
                disabled={isPending || bulkAction !== null}
                className="gap-1.5 text-xs text-green-700 border-green-300 hover:bg-green-50"
              >
                {bulkAction === "sent" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <SendHorizontal className="w-3.5 h-3.5" />
                )}
                {bulkAction === "sent" ? "Sending..." : "Mark Sent"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={bulkDiscard}
                disabled={isPending || bulkAction !== null}
                className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
              >
                {bulkAction === "discard" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {bulkAction === "discard" ? "Discarding..." : "Discard"}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {filteredItems.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            {searchQuery ? (
              <p className="text-gray-500">
                No drafts matching &ldquo;{searchQuery}&rdquo;.{" "}
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-purple-600 hover:text-purple-800 underline"
                >
                  Clear search
                </button>
              </p>
            ) : (
              <p className="text-gray-500">
                {activeTab === "pending"
                  ? "No messages pending review. Use AI Compose to generate drafts."
                  : activeTab === "sent"
                  ? "No sent messages yet."
                  : "No messages in the queue."}
              </p>
            )}
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
                      {!isSent && activeTab === "pending" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSelect(item.id) }}
                          className="shrink-0"
                        >
                          {selectedIds.has(item.id) ? (
                            <CheckSquare className="w-4 h-4 text-purple-600" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-300 hover:text-gray-500" />
                          )}
                        </button>
                      )}
                      <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4 text-gray-500" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-medium text-gray-900 cursor-default">
                              {item.prospect?.name || "Unknown"}
                            </span>
                          </TooltipTrigger>
                          {item.prospect && (
                            <TooltipContent side="bottom" className="text-xs space-y-0.5 max-w-xs">
                              {item.prospect.title && <p>{item.prospect.title}</p>}
                              {item.prospect.department && <p>{item.prospect.department}</p>}
                              {(item.prospect as any)?.city_name && <p>{(item.prospect as any).city_name}</p>}
                              {item.prospect.jurisdiction && <p>{item.prospect.jurisdiction}</p>}
                            </TooltipContent>
                          )}
                        </Tooltip>
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
                        <span className="text-xs text-gray-500">
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
                    <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="font-medium text-gray-900 truncate">
                          {item.personalized_subject || "(No subject)"}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-sm">{item.personalized_subject || "(No subject)"}</p>
                      </TooltipContent>
                    </Tooltip>
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
                          {loadingAnomalies && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
                        </div>
                        {!loadingAnomalies && applicableAnomalies.length === 0 && (
                          <p className="text-sm text-gray-500">No anomalies found for this city in the last 14 days. Newer anomalies will appear here automatically.</p>
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
                                <ArrowRightLeft className="w-3 h-3 shrink-0 text-gray-500" />
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
                            disabled={isPending || discardingId === item.id}
                            className="gap-1.5 text-xs text-gray-500 hover:text-red-600"
                          >
                            {discardingId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            {discardingId === item.id ? "Discarding..." : "Discard"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => sendViaEmail(item.id)}
                            disabled={isPending || sendingId === item.id || sendGridReady === false}
                            title={sendGridReady === false ? "SendGrid not configured" : undefined}
                            className="gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white disabled:bg-gray-400"
                          >
                            {sendingId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Mail className="w-3.5 h-3.5" />
                            )}
                            {sendingId === item.id ? "Sending..." : "Send Email"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markAsSent(item.id)}
                            disabled={isPending || markingSentId === item.id}
                            className="gap-1.5 text-xs"
                          >
                            {markingSentId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            {markingSentId === item.id ? "Marking..." : "Mark Sent"}
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
      <Dialog open={!!editingItem} onOpenChange={(open) => {
        if (!open && editingItem) {
          const subjectChanged = editSubject !== (editingItem.personalized_subject || "")
          const bodyChanged = editBody !== (editingItem.personalized_body || "")
          if (subjectChanged || bodyChanged) {
            setConfirmDialog({
              title: "Discard unsaved changes?",
              description: "You have unsaved edits to this draft. Closing will discard them.",
              actionLabel: "Discard changes",
              variant: "destructive",
              action: () => setEditingItem(null),
            })
            return
          }
        }
        if (!open) setEditingItem(null)
      }}>
        <DialogContent className="max-w-2xl" onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault()
            saveEdit()
          }
        }}>
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
                <BarChart3 className="w-4 h-4 text-gray-500" />
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
              {editingItem && editingItem.status !== "sent" && (
                <Button
                  onClick={sendViaEmailFromDialog}
                  disabled={isPending || sendingId === editingItem?.id || sendGridReady === false}
                  title={sendGridReady === false ? "SendGrid not configured" : undefined}
                  className="gap-2 bg-purple-600 hover:bg-purple-700 text-white disabled:bg-gray-400"
                >
                  {sendingId === editingItem?.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  Send Email
                </Button>
              )}
              <Button
                variant="outline"
                onClick={markAsSentFromDialog}
                disabled={isPending || editingItem?.status === "sent"}
                className="gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark Sent
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

      {/* Confirm Dialog (replaces window.confirm) */}
      <AlertDialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { confirmDialog?.action(); setConfirmDialog(null) }}
              className={confirmDialog?.variant === "destructive"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-purple-600 text-white hover:bg-purple-700"
              }
            >
              {confirmDialog?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  )
}
