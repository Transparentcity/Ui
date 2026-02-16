"use client"

import { useState } from "react"
import { useAuth0 } from "@auth0/auth0-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { ChevronDown, ShieldCheck, ShieldAlert, ShieldQuestion, AlertCircle, Sparkles } from "lucide-react"
import {
  getAvailableModels,
  getSessionStats,
  sendChatMessage,
  type SessionStats,
  type WasteFinding,
} from "@/lib/apiClient"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  PREFERRED_DEFAULT_MODEL_KEY,
  pickDefaultModelKey,
} from "@/lib/modelDefaults"

function formatDollar(amount: number | null | undefined): string {
  if (amount == null) return ""
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`
  return `$${abs.toLocaleString()}`
}

const severityConfig = {
  critical: {
    bg: "bg-red-100",
    text: "text-red-700",
    border: "border-red-200",
    label: "CRIT",
    metricColor: "text-red-600",
  },
  high: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-200",
    label: "HIGH",
    metricColor: "text-amber-600",
  },
  medium: {
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    border: "border-indigo-200",
    label: "MED",
    metricColor: "text-indigo-600",
  },
}

const confidenceConfig = {
  high: {
    icon: ShieldCheck,
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    label: "High confidence",
  },
  medium: {
    icon: ShieldAlert,
    bg: "bg-slate-50",
    text: "text-slate-600",
    border: "border-slate-200",
    label: "Medium confidence",
  },
  low: {
    icon: ShieldQuestion,
    bg: "bg-gray-50",
    text: "text-gray-500",
    border: "border-gray-200",
    label: "Low confidence",
  },
}

interface WasteFindingCardProps {
  finding: WasteFinding
  isExpanded: boolean
  onToggle: () => void
  onSeymourUsage?: (tokensUsed: number) => void
}

export function WasteFindingCard({
  finding,
  isExpanded,
  onToggle,
  onSeymourUsage,
}: WasteFindingCardProps) {
  const router = useRouter()
  const { getAccessTokenSilently } = useAuth0()
  const sev = severityConfig[finding.severity]
  const conf = confidenceConfig[finding.confidence ?? "medium"]
  const ConfIcon = conf.icon
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState("")
  const [analysisResult, setAnalysisResult] = useState("")
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [usageStats, setUsageStats] = useState<SessionStats | null>(null)

  const formatTokens = (tokens: number) => {
    if (tokens < 1000) return tokens.toString()
    if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`
    return `${(tokens / 1_000_000).toFixed(2)}M`
  }

  const formatCost = (costUsd: number) => {
    if (costUsd === 0) return "$0.00"
    if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`
    if (costUsd < 1) return `$${costUsd.toFixed(3)}`
    return `$${costUsd.toFixed(2)}`
  }

  const buildAnalysisPrompt = () =>
    `Analyze this waste finding:\n\n` +
    `Item: ${finding.entity} (${finding.subcategory})\n` +
    `Amount: ${finding.amount != null ? formatDollar(finding.amount) : "N/A"}\n` +
    `Issue: ${finding.metric} ${finding.metricDetail}\n` +
    `Context: ${finding.description}\n` +
    `Tool: ${finding.tool}\n\n` +
    `Briefly explain what happened, if it's unusual, potential legitimate reasons, and recommended next steps.`

  const handleAskSeymour = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPromptDraft(buildAnalysisPrompt())
    setAnalysisResult("")
    setAnalysisError(null)
    setUsageStats(null)
    setIsDialogOpen(true)
  }

  const handleAnalyzeInModal = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!promptDraft.trim() || isAnalyzing) return

    setIsAnalyzing(true)
    setAnalysisError(null)
    setAnalysisResult("")
    setUsageStats(null)

    try {
      const token = await getAccessTokenSilently()
      const models = await getAvailableModels(token)
      const selectedModel =
        pickDefaultModelKey(models) ?? PREFERRED_DEFAULT_MODEL_KEY

      const response = await sendChatMessage(
        {
          message: promptDraft,
          model_key: selectedModel,
        },
        token
      )

      setAnalysisResult(response.response || "No analysis returned.")
      if (response.session_id) {
        try {
          const stats = await getSessionStats(response.session_id, token)
          setUsageStats(stats)
          onSeymourUsage?.(stats.total_tokens_used ?? 0)
        } catch {
          // If stats lookup fails, we still keep the analysis response.
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get Seymour analysis."
      setAnalysisError(message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleOpenFullChat = (e: React.MouseEvent) => {
    e.stopPropagation()
    const prompt = encodeURIComponent(promptDraft || buildAnalysisPrompt())
    router.push(`/dashboard?prefill=${prompt}`)
    setIsDialogOpen(false)
  }

  return (
    <div
      className={cn(
        "border rounded-lg transition-all cursor-pointer",
        isExpanded ? "shadow-sm border-gray-300" : "border-gray-200 hover:border-gray-300",
        finding.isPartialData && "border-l-2 border-l-amber-400"
      )}
      onClick={onToggle}
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Severity badge */}
        <span
          className={cn(
            "inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0",
            sev.bg,
            sev.text
          )}
        >
          {sev.label}
        </span>

        {/* Metric headline */}
        <span className={cn("font-semibold text-sm whitespace-nowrap", sev.metricColor)}>
          {finding.metric}
        </span>

        {/* Metric detail */}
        <span className="text-sm text-gray-600 truncate">
          {finding.metricDetail}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Confidence indicator (compact) */}
        <span className="hidden lg:inline-flex shrink-0" title={conf.label}>
          <ConfIcon className={cn("w-3.5 h-3.5", conf.text)} />
        </span>

        {/* Entity tag */}
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap hidden sm:inline-flex">
          {finding.entity}
        </span>

        {/* Amount */}
        {finding.amount != null && finding.amount > 0 && (
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap hidden md:inline">
            {formatDollar(finding.amount)}
          </span>
        )}

        {/* Chevron */}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-gray-400 shrink-0 transition-transform",
            isExpanded && "rotate-180"
          )}
        />
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          {/* Mobile entity + amount */}
          <div className="flex items-center gap-2 mb-2 sm:hidden">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {finding.entity}
            </span>
            {finding.amount != null && finding.amount > 0 && (
              <span className="text-sm font-medium text-gray-700">
                {formatDollar(finding.amount)}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            {finding.description}
          </p>

          {/* Confidence badge */}
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs mb-3",
            conf.bg, conf.text, "border", conf.border
          )}>
            <ConfIcon className="w-3.5 h-3.5" />
            <span className="font-medium">{conf.label}</span>
            {finding.confidenceReason && (
              <span className="text-gray-500 ml-1">— {finding.confidenceReason}</span>
            )}
          </div>

          {/* Caveat / data quality warning */}
          {finding.caveat && (
            <div className="flex items-start gap-2 mb-3 p-2 bg-amber-50 border border-amber-100 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{finding.caveat}</p>
            </div>
          )}

          {/* Partial data indicator */}
          {finding.isPartialData && !finding.caveat?.includes("partial") && (
            <div className="flex items-start gap-2 mb-3 p-2 bg-amber-50 border border-amber-100 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Based on partial fiscal year data. Values may change when the full year is available.
              </p>
            </div>
          )}

          {/* Tool tag + Ask Seymour */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="bg-gray-50 px-2 py-0.5 rounded">
                {finding.tool}
              </span>
              <span>{finding.id}</span>
              <span className="text-gray-300">
                Priority: {finding.priority_score ?? "—"}
              </span>
            </div>

            {/* Ask Seymour button */}
            <button
              onClick={handleAskSeymour}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium",
                "bg-violet-50 text-violet-700 border border-violet-200",
                "hover:bg-violet-100 hover:border-violet-300 transition-colors"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ask Seymour for analysis
            </button>
          </div>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className="max-w-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Ask Seymour About This Finding</DialogTitle>
            <DialogDescription>
              Edit the prompt if needed, then run analysis here without leaving
              Waste Detection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={10}
              placeholder="Describe what you want Seymour to analyze..."
            />

            {analysisError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {analysisError}
              </div>
            )}

            {(analysisResult || isAnalyzing) && (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Seymour analysis
                </p>
                <div className="max-h-[320px] overflow-y-auto whitespace-pre-wrap text-sm text-gray-800">
                  {isAnalyzing ? "Seymour is analyzing..." : analysisResult}
                </div>
                {usageStats && !isAnalyzing && (
                  <div className="mt-3 border-t border-gray-200 pt-2">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Token accounting
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700 sm:grid-cols-4">
                      <div>Tokens: {formatTokens(usageStats.total_tokens_used)}</div>
                      <div>Prompt: {formatTokens(usageStats.total_prompt_tokens)}</div>
                      <div>Completion: {formatTokens(usageStats.total_completion_tokens)}</div>
                      <div>Cost: {formatCost(usageStats.estimated_cost_usd ?? 0)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenFullChat}
              disabled={isAnalyzing}
            >
              Open full Seymour chat
            </Button>
            <Button
              type="button"
              onClick={handleAnalyzeInModal}
              disabled={!promptDraft.trim() || isAnalyzing}
            >
              {isAnalyzing ? "Analyzing..." : "Run analysis"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
