"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth0 } from "@auth0/auth0-react"
import { useRouter } from "next/navigation"
import { Sparkles, X } from "lucide-react"
import {
  getAvailableModels,
  getSessionStats,
  sendChatMessage,
  type SessionStats,
  type WasteFinding,
} from "@/lib/apiClient"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  PREFERRED_DEFAULT_MODEL_KEY,
  pickDefaultModelKey,
} from "@/lib/modelDefaults"

const SEYMOUR_ANALYSIS_TIMEOUT_MS = 60_000

export interface WasteSeymourRequest {
  finding: WasteFinding
}

interface WasteSeymourPanelProps {
  request: WasteSeymourRequest | null
  onClose: () => void
  onSeymourUsage?: (tokensUsed: number) => void
}

function formatDollar(amount: number | null | undefined): string {
  if (amount == null) return ""
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`
  return `$${abs.toLocaleString()}`
}

function buildAnalysisPrompt(finding: WasteFinding): string {
  return (
    `Analyze this waste finding:\n\n` +
    `Item: ${finding.entity} (${finding.subcategory})\n` +
    `Amount: ${finding.amount != null ? formatDollar(finding.amount) : "N/A"}\n` +
    `Issue: ${finding.metric} ${finding.metricDetail}\n` +
    `Context: ${finding.description}\n` +
    `Tool: ${finding.tool}\n\n` +
    `Briefly explain what happened, if it's unusual, potential legitimate reasons, and recommended next steps.`
  )
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export function WasteSeymourPanel({
  request,
  onClose,
  onSeymourUsage,
}: WasteSeymourPanelProps) {
  const router = useRouter()
  const { getAccessTokenSilently } = useAuth0()
  const [promptDraft, setPromptDraft] = useState("")
  const [analysisResult, setAnalysisResult] = useState("")
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [usageStats, setUsageStats] = useState<SessionStats | null>(null)

  const finding = request?.finding ?? null
  const isOpen = Boolean(finding)

  useEffect(() => {
    if (!finding) return
    setPromptDraft(buildAnalysisPrompt(finding))
    setAnalysisResult("")
    setAnalysisError(null)
    setUsageStats(null)
  }, [finding])

  const heading = useMemo(() => {
    if (!finding) return "Seymour Side Chat"
    return `Seymour: ${finding.subcategory}`
  }, [finding])

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

  const handleAnalyze = async () => {
    if (!promptDraft.trim() || isAnalyzing) return
    setIsAnalyzing(true)
    setAnalysisError(null)
    setAnalysisResult("")
    setUsageStats(null)
    try {
      const token = await withTimeout(
        getAccessTokenSilently(),
        SEYMOUR_ANALYSIS_TIMEOUT_MS,
        "Auth timed out while preparing Seymour analysis. Please try again."
      )
      const models = await withTimeout(
        getAvailableModels(token),
        SEYMOUR_ANALYSIS_TIMEOUT_MS,
        "Loading models timed out. Please try again."
      )
      const selectedModel = pickDefaultModelKey(models) ?? PREFERRED_DEFAULT_MODEL_KEY

      const response = await withTimeout(
        sendChatMessage(
          {
            message: promptDraft,
            model_key: selectedModel,
          },
          token
        ),
        SEYMOUR_ANALYSIS_TIMEOUT_MS,
        "Seymour analysis timed out after 60s. Please retry or open full chat."
      )

      setAnalysisResult(response.response || "No analysis returned.")
      if (response.session_id) {
        try {
          const stats = await withTimeout(
            getSessionStats(response.session_id, token),
            15_000,
            "Usage stats request timed out."
          )
          setUsageStats(stats)
          onSeymourUsage?.(stats.total_tokens_used ?? 0)
        } catch {
          // Keep response even if stats request fails.
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

  const handleOpenFullChat = () => {
    const prompt = encodeURIComponent(promptDraft || (finding ? buildAnalysisPrompt(finding) : ""))
    router.push(`/dashboard?prefill=${prompt}`)
  }

  if (!isOpen || !finding) return null

  return (
    <aside className="fixed right-4 top-20 bottom-4 z-40 w-[440px] max-w-[calc(100vw-2rem)] rounded-xl border border-purple-200 bg-white shadow-2xl flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{heading}</p>
          <p className="text-xs text-gray-500 truncate">
            {finding.metric} - {finding.entity}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-gray-100 text-gray-500"
          aria-label="Close Seymour side chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto flex-1">
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Prompt</p>
          <Textarea
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            rows={10}
            placeholder="Describe what you want Seymour to analyze..."
          />
        </div>

        {analysisError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {analysisError}
          </div>
        ) : null}

        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 min-h-[180px]">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            Seymour analysis
          </p>
          <div className="whitespace-pre-wrap text-sm text-gray-800">
            {isAnalyzing
              ? "Seymour is analyzing this finding... You can keep using the module."
              : analysisResult || "Run analysis to see Seymour's output."}
          </div>
          {usageStats && !isAnalyzing ? (
            <div className="mt-3 border-t border-gray-200 pt-2 text-xs text-gray-700 grid grid-cols-2 gap-2">
              <div>Tokens: {formatTokens(usageStats.total_tokens_used)}</div>
              <div>Prompt: {formatTokens(usageStats.total_prompt_tokens)}</div>
              <div>Completion: {formatTokens(usageStats.total_completion_tokens)}</div>
              <div>Cost: {formatCost(usageStats.estimated_cost_usd ?? 0)}</div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 flex items-center gap-2">
        <Button variant="outline" onClick={handleOpenFullChat} disabled={isAnalyzing}>
          Open full Seymour chat
        </Button>
        <Button onClick={handleAnalyze} disabled={!promptDraft.trim() || isAnalyzing}>
          <Sparkles className="h-4 w-4" />
          {isAnalyzing ? "Analyzing..." : "Run analysis"}
        </Button>
      </div>
    </aside>
  )
}
