"use client"

import { useState, useCallback } from "react"
import {
  useWasteInvestigation,
  useCreateInvestigationAction,
  useCloseInvestigation,
  useRunAIAuditorReview,
} from "@/lib/hooks/useWaste"
import { useAuth0 } from "@auth0/auth0-react"
import { toast } from "sonner"
import { WasteShell } from "./waste-shell"
import { SeverityBadge } from "./severity-badge"
import { ScoreBar } from "./score-bar"
import { TCScoreBadge } from "./tc-score-badge"
import { ActionCard } from "./action-card"
import { AIAuditorStepCard, AIAuditorSummary } from "./ai-auditor-step-card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Bot,
  Download,
  Plus,
  XCircle,
  Loader2,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import type {
  AIAuditorReport,
  WasteDispositionType,
  WasteInvestigationAction,
} from "@/lib/apiClient"
import { exportInvestigationEvidence } from "@/lib/apiClient"

// Simplified status display
const DISPLAY_STATUS: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-blue-100 text-blue-700" },
  in_progress: { label: "Open", className: "bg-blue-100 text-blue-700" },
  pending_response: { label: "Open", className: "bg-yellow-100 text-yellow-700" },
  closed: { label: "Resolved", className: "bg-gray-100 text-gray-600" },
}

interface InvestigationDetailPageProps {
  investigationId: string
}

export function InvestigationDetailPage({ investigationId }: InvestigationDetailPageProps) {
  const { getAccessTokenSilently } = useAuth0()
  const { data: investigation, isLoading, error } = useWasteInvestigation(investigationId)
  const addActionMutation = useCreateInvestigationAction()
  const closeMutation = useCloseInvestigation()
  const aiAuditorMutation = useRunAIAuditorReview()

  const [exporting, setExporting] = useState(false)
  const [aiAuditorReport, setAIAuditorReport] = useState<AIAuditorReport | null>(null)

  // Simplified note input
  const [noteText, setNoteText] = useState("")

  const handleRunAIAuditor = useCallback(() => {
    if (!investigation?.finding) return
    const findingId = Number(investigation.finding.id ?? investigation.finding_id)
    const cityId = investigation.city_id
    if (!findingId || !cityId) {
      toast.error("Missing finding or city data")
      return
    }
    aiAuditorMutation.mutate(
      { finding_id: findingId, city_id: cityId },
      {
        onSuccess: (result) => {
          setAIAuditorReport(result.report)
          toast.success("AI Auditor review complete")
        },
        onError: (err) => toast.error(`AI Auditor failed: ${err.message}`),
      }
    )
  }, [investigation, aiAuditorMutation])

  const handleAddNote = useCallback(() => {
    const text = noteText.trim()
    if (!text) return
    addActionMutation.mutate(
      {
        investigationId,
        data: {
          action_type: "note",
          title: text.length > 80 ? text.slice(0, 80) + "…" : text,
          description: text,
        },
      },
      {
        onSuccess: () => {
          setNoteText("")
          toast.success("Note added")
        },
        onError: () => toast.error("Failed to add note"),
      }
    )
  }, [investigationId, noteText, addActionMutation])

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
      toast.success("Evidence exported")
    } catch {
      toast.error("Failed to export evidence")
    } finally {
      setExporting(false)
    }
  }, [getAccessTokenSilently, investigationId])

  const handleResolve = useCallback(() => {
    closeMutation.mutate(
      { investigationId, data: { final_disposition: "inconclusive" as WasteDispositionType } },
      {
        onSuccess: () => toast.success("Investigation resolved"),
        onError: () => toast.error("Failed to resolve investigation"),
      }
    )
  }, [investigationId, closeMutation])

  const handleEscalate = useCallback(async () => {
    // Add escalation note, close, and export evidence
    addActionMutation.mutate(
      {
        investigationId,
        data: {
          action_type: "referral",
          title: "Escalated for further review",
          description: "Case escalated to Inspector General / appropriate authority.",
        },
      },
      {
        onSuccess: () => {
          closeMutation.mutate(
            { investigationId, data: { final_disposition: "confirmed_fraud" as WasteDispositionType } },
            {
              onSuccess: () => {
                handleExport()
                toast.success("Investigation escalated and evidence exported")
              },
              onError: () => toast.error("Failed to escalate investigation"),
            }
          )
        },
        onError: () => toast.error("Failed to add escalation note"),
      }
    )
  }, [investigationId, addActionMutation, closeMutation, handleExport])

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
          {investigation.status !== "closed" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunAIAuditor}
              disabled={aiAuditorMutation.isPending}
              className="border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              {aiAuditorMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Bot className="w-4 h-4 mr-1" />
              )}
              {aiAuditorMutation.isPending ? "Reviewing…" : "AI Auditor Review"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            Export Evidence
          </Button>
          {investigation.status !== "closed" && (
            <>
              <Button size="sm" variant="outline" onClick={handleResolve} disabled={closeMutation.isPending}>
                <CheckCircle2 className="w-4 h-4 mr-1" /> Resolve
              </Button>
              <Button size="sm" variant="destructive" onClick={handleEscalate} disabled={closeMutation.isPending || addActionMutation.isPending}>
                <XCircle className="w-4 h-4 mr-1" /> Escalate
              </Button>
            </>
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
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${(DISPLAY_STATUS[investigation.status] ?? DISPLAY_STATUS.open).className}`}
          >
            {(DISPLAY_STATUS[investigation.status] ?? DISPLAY_STATUS.open).label}
          </span>
          {investigation.lead_auditor_id && (
            <span className="text-sm text-gray-600">
              Lead: <strong>{investigation.lead_auditor_id}</strong>
            </span>
          )}
          {investigation.opened_at && (
            <span className="text-xs text-gray-500">
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
              <div className="mt-3 flex items-center gap-3">
                <TCScoreBadge
                  score={Number(investigation.entity_score.composite_score ?? 0)}
                  size="md"
                  showLabel
                />
                <ScoreBar score={Number(investigation.entity_score.composite_score ?? 0)} className="w-32" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Auditor Report */}
      {aiAuditorReport && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-1.5">
            <Bot className="w-4 h-4" />
            AI Auditor Investigation ({aiAuditorReport.steps.length} steps)
          </h3>
          <div className="space-y-2 mb-4">
            {aiAuditorReport.steps.map((step) => (
              <AIAuditorStepCard key={step.step_number} step={step} />
            ))}
          </div>
          <AIAuditorSummary
            classification={aiAuditorReport.classification}
            confidence={aiAuditorReport.confidence}
            summary={aiAuditorReport.summary}
            estimatedHumanHours={aiAuditorReport.estimated_human_hours}
            actualAISeconds={aiAuditorReport.actual_ai_seconds}
            recommendedActions={aiAuditorReport.recommended_actions}
          />
        </div>
      )}

      {/* Notes thread */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Notes ({sortedActions.length})
        </h3>

        {sortedActions.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            No notes yet. Add the first note to start tracking this case.
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

        {/* Inline note input */}
        {investigation.status !== "closed" && (
          <div className="mt-4 flex gap-2">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note…"
              rows={2}
              className="flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleAddNote()
                }
              }}
            />
            <Button
              size="sm"
              onClick={handleAddNote}
              disabled={!noteText.trim() || addActionMutation.isPending}
              className="self-end"
            >
              {addActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Dialogs removed — notes are inline, resolve/escalate are header buttons */}
    </WasteShell>
  )
}
