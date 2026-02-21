"use client"

import { useState, useCallback } from "react"
import {
  useWasteInvestigation,
  useCreateInvestigationAction,
  useCloseInvestigation,
} from "@/lib/hooks/useWaste"
import { useAuth0 } from "@auth0/auth0-react"
import { WasteShell } from "./waste-shell"
import { SeverityBadge } from "./severity-badge"
import { ScoreBar } from "./score-bar"
import { ActionCard } from "./action-card"
import { DispositionSelect } from "./disposition-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Download,
  Plus,
  XCircle,
  Loader2,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import type {
  WasteDispositionType,
  WasteInvestigationAction,
} from "@/lib/apiClient"
import { exportInvestigationEvidence } from "@/lib/apiClient"

const STATUS_BADGE: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  pending_response: "bg-orange-100 text-orange-700",
  closed: "bg-gray-100 text-gray-600",
}

const ACTION_TYPES: { value: WasteInvestigationAction["action_type"]; label: string }[] = [
  { value: "document_request", label: "Document Request" },
  { value: "interview", label: "Interview" },
  { value: "site_visit", label: "Site Visit" },
  { value: "subpoena", label: "Subpoena" },
  { value: "referral", label: "Referral" },
  { value: "note", label: "Note" },
  { value: "evidence_collected", label: "Evidence Collected" },
]

interface InvestigationDetailPageProps {
  investigationId: string
}

export function InvestigationDetailPage({ investigationId }: InvestigationDetailPageProps) {
  const { getAccessTokenSilently } = useAuth0()
  const { data: investigation, isLoading, error } = useWasteInvestigation(investigationId)
  const addActionMutation = useCreateInvestigationAction()
  const closeMutation = useCloseInvestigation()

  const [showAddAction, setShowAddAction] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Add action form state
  const [actionType, setActionType] = useState<WasteInvestigationAction["action_type"]>("note")
  const [actionTitle, setActionTitle] = useState("")
  const [actionDesc, setActionDesc] = useState("")
  const [actionAssignee, setActionAssignee] = useState("")
  const [actionDue, setActionDue] = useState("")

  // Close form state
  const [closeDisposition, setCloseDisposition] = useState<WasteDispositionType | undefined>()

  const handleAddAction = useCallback(() => {
    if (!actionTitle.trim()) return
    addActionMutation.mutate(
      {
        investigationId,
        data: {
          action_type: actionType,
          title: actionTitle.trim(),
          description: actionDesc.trim(),
          assigned_to: actionAssignee.trim() || undefined,
          due_date: actionDue || undefined,
        },
      },
      {
        onSuccess: () => {
          setShowAddAction(false)
          setActionTitle("")
          setActionDesc("")
          setActionAssignee("")
          setActionDue("")
          setActionType("note")
        },
      }
    )
  }, [investigationId, actionType, actionTitle, actionDesc, actionAssignee, actionDue, addActionMutation])

  const handleClose = useCallback(() => {
    if (!closeDisposition) return
    closeMutation.mutate(
      { investigationId, data: { final_disposition: closeDisposition } },
      { onSuccess: () => { setShowClose(false); setCloseDisposition(undefined) } }
    )
  }, [investigationId, closeDisposition, closeMutation])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const token = await getAccessTokenSilently()
      const blob = await exportInvestigationEvidence(token, investigationId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `investigation-${investigationId}-evidence.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent
    } finally {
      setExporting(false)
    }
  }, [getAccessTokenSilently, investigationId])

  if (isLoading) {
    return (
      <WasteShell title="Investigation" description="Loading…">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </WasteShell>
    )
  }

  if (error || !investigation) {
    return (
      <WasteShell title="Investigation" description="Not found">
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm mb-4">
            {error instanceof Error ? error.message : "Investigation not found"}
          </p>
          <Link href="/waste/queue">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Queue
            </Button>
          </Link>
        </div>
      </WasteShell>
    )
  }

  const sortedActions = [...investigation.actions].sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? "")
  )

  return (
    <WasteShell
      title={investigation.title}
      description={`Investigation #${investigation.id}`}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            Export Evidence
          </Button>
          {investigation.status !== "closed" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowClose(true)}
            >
              <XCircle className="w-4 h-4 mr-1" /> Close Investigation
            </Button>
          )}
        </div>
      }
    >
      {/* Back link */}
      <Link
        href="/waste/queue"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-purple-600 mb-6 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" /> Back to Queue
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_BADGE[investigation.status] ?? STATUS_BADGE.open}`}
          >
            {investigation.status.replace("_", " ")}
          </span>
          {investigation.lead_auditor_id && (
            <span className="text-sm text-gray-600">
              Lead: <strong>{investigation.lead_auditor_id}</strong>
            </span>
          )}
          {investigation.opened_at && (
            <span className="text-xs text-gray-400">
              Opened {new Date(investigation.opened_at).toLocaleDateString()}
            </span>
          )}
          {investigation.final_disposition && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full capitalize">
              {investigation.final_disposition.replace(/_/g, " ")}
            </span>
          )}
        </div>

        {/* Linked finding */}
        {investigation.finding && (
          <div className="p-4 rounded-lg border border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2 mb-1">
              <SeverityBadge severity={String(investigation.finding.severity ?? "info")} />
              <span className="text-sm font-medium text-gray-800">
                {String(investigation.finding.entity_name ?? "")}
              </span>
              <span className="text-xs text-gray-500">
                {String(investigation.finding.subcategory ?? "")}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 line-clamp-3">
              {String(investigation.finding.description ?? investigation.finding.finding_description ?? "")}
            </p>
            {investigation.entity_score && (
              <div className="mt-3 w-48">
                <ScoreBar score={Number(investigation.entity_score.composite_score ?? 0)} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action timeline */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Action Timeline ({sortedActions.length})
          </h3>
          {investigation.status !== "closed" && (
            <Button size="sm" variant="outline" onClick={() => setShowAddAction(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Action
            </Button>
          )}
        </div>

        {sortedActions.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            No actions yet. Add the first action to begin the investigation timeline.
          </p>
        ) : (
          <div className="relative pl-6 space-y-3">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-200" />
            {sortedActions.map((action) => (
              <div key={action.id} className="relative">
                <div className="absolute -left-[18px] top-4 w-2.5 h-2.5 rounded-full border-2 border-white bg-gray-400 ring-2 ring-gray-100" />
                <ActionCard action={action} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Action Dialog */}
      <Dialog open={showAddAction} onOpenChange={setShowAddAction}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Investigation Action</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs">Action Type</Label>
              <Select value={actionType} onValueChange={(v) => setActionType(v as WasteInvestigationAction["action_type"])}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                className="mt-1"
                value={actionTitle}
                onChange={(e) => setActionTitle(e.target.value)}
                placeholder="Action title"
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={actionDesc}
                onChange={(e) => setActionDesc(e.target.value)}
                placeholder="Describe the action…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Assignee</Label>
                <Input
                  className="mt-1"
                  value={actionAssignee}
                  onChange={(e) => setActionAssignee(e.target.value)}
                  placeholder="Name"
                />
              </div>
              <div>
                <Label className="text-xs">Due Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={actionDue}
                  onChange={(e) => setActionDue(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAddAction(false)}>
              Cancel
            </Button>
            <Button
              disabled={!actionTitle.trim() || addActionMutation.isPending}
              onClick={handleAddAction}
            >
              {addActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-1" />
              )}
              Add Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Investigation Dialog */}
      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close Investigation</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <Label className="text-xs">Final Disposition</Label>
            <DispositionSelect
              value={closeDisposition}
              onValueChange={setCloseDisposition}
              className="mt-1"
            />
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowClose(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!closeDisposition || closeMutation.isPending}
              onClick={handleClose}
            >
              {closeMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-1" />
              )}
              Close Investigation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WasteShell>
  )
}
