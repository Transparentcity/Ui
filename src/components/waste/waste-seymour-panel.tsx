"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useAuth0 } from "@auth0/auth0-react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  X,
} from "lucide-react"
import {
  getAvailableModels,
  getSessionStats,
  createChatJob,
  getJob,
  type SessionStats,
  type WasteFinding,
} from "@/lib/apiClient"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  PREFERRED_DEFAULT_MODEL_KEY,
  pickDefaultModelKey,
} from "@/lib/modelDefaults"

const SEYMOUR_ANALYSIS_TIMEOUT_MS = 300_000

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
  const lines: string[] = []

  lines.push(`You are a municipal auditor's AI assistant. Analyze this entity and finding from San Francisco's waste detection system.\n`)

  // Entity identity
  lines.push(`## Entity Under Review`)
  lines.push(`- **Name:** ${finding.entity}`)
  lines.push(`- **Category:** ${finding.subcategory}`)
  if (finding.department) lines.push(`- **Department:** ${finding.department}`)
  if (finding.fiscal_year) lines.push(`- **Fiscal Year:** FY${finding.fiscal_year}`)
  lines.push(`- **Severity:** ${finding.severity?.toUpperCase() ?? "UNKNOWN"}`)
  lines.push(`- **Confidence:** ${finding.confidence} — ${finding.confidence_reason ?? ""}`)
  lines.push(`- **Amount at risk:** ${finding.amount != null ? formatDollar(finding.amount) : "N/A"}`)
  if (finding.estimated_dollar_impact != null) {
    lines.push(`- **Estimated dollar impact:** ${formatDollar(finding.estimated_dollar_impact)}`)
  }
  lines.push(`- **Priority score:** ${finding.priority_score}`)
  lines.push(`- **Corroboration count:** ${finding.corroboration_count} (other detectors flagging the same entity)`)
  lines.push(`- **Data completeness:** ${Math.round(finding.data_completeness * 100)}%`)
  if (finding.is_partial_data) lines.push(`- **Note:** Based on partial fiscal year data`)
  lines.push(``)

  // What was detected
  lines.push(`## What Was Detected`)
  lines.push(`- **Finding:** ${finding.metric}`)
  lines.push(`- **Detail:** ${finding.metricDetail}`)
  lines.push(`- **Detector:** ${finding.tool}`)
  lines.push(``)

  // Full description / how we found it
  lines.push(`## How We Found It`)
  lines.push(finding.description)
  lines.push(``)

  // Convergence details if present
  if (finding.convergence_details) {
    const cd = finding.convergence_details
    lines.push(`## Cross-Domain Convergence`)
    if (cd.domains_flagged) lines.push(`- Domains flagged: ${cd.domains_flagged}`)
    if (cd.convergence_multiplier) lines.push(`- Convergence multiplier: ${cd.convergence_multiplier}x`)
    if (cd.triangle_legs_present?.length) lines.push(`- Fraud Triangle legs present: ${cd.triangle_legs_present.join(", ")}`)
    if (cd.finding_count) lines.push(`- Total findings for this entity: ${cd.finding_count}`)
    lines.push(``)
  }

  // Finding narrative if available
  if (finding.narrative) {
    lines.push(`## Analyst Narrative`)
    lines.push(finding.narrative)
    lines.push(``)
  }

  // What we want
  lines.push(`## Your Analysis`)
  lines.push(`Please provide a thorough investigation brief covering:\n`)
  lines.push(`1. **Who is this entity?** Search your knowledge for any public information about "${finding.entity}" in San Francisco — prior audits, news coverage, lawsuits, government reports, campaign contributions, lobbying activity, or regulatory actions. If this is a vendor, describe what they do and their relationship with the city.`)
  lines.push(`2. **Why were they flagged?** Explain the specific anomaly in plain language. What makes this pattern suspicious compared to normal municipal operations?`)
  lines.push(`3. **How serious is this?** Rate the risk (Critical/High/Medium/Low) considering the dollar amount, pattern type, confidence level, and whether multiple independent detectors corroborate the finding.`)
  lines.push(`4. **Innocent explanations:** What legitimate operational reasons could explain this? (e.g., emergency spending, sole-source proprietary technology, grant-funded surge)`)
  lines.push(`5. **Red flags to watch for:** What additional evidence would confirm this is genuine waste, fraud, or abuse vs. a false positive?`)
  lines.push(`6. **Recommended next steps:** List 3-5 specific, actionable investigation steps an auditor should take — e.g., which records to pull, which officials to interview, which contracts to cross-reference.`)

  return lines.join("\n")
}

/** Build contextual follow-up prompts based on finding category and content. */
function buildSuggestedPrompts(finding: WasteFinding): { label: string; prompt: string }[] {
  const entity = finding.entity ?? "this entity"
  const category = (finding.subcategory ?? finding.category ?? "").toLowerCase()
  const suggestions: { label: string; prompt: string }[] = []

  // Universal prompts
  suggestions.push({
    label: "Summarize all findings",
    prompt: `Summarize all the waste detection findings for "${entity}" in plain language. What is the overall picture of risk for this entity?`,
  })
  suggestions.push({
    label: "Total dollar exposure",
    prompt: `What is the total dollar exposure and financial risk associated with "${entity}" across all findings? Break it down by category.`,
  })

  // Category-specific prompts
  if (category.includes("vendor") || category.includes("contract") || category.includes("payment")) {
    suggestions.push({
      label: "Draft document request",
      prompt: `Draft a formal letter requesting documentation from "${entity}" regarding the suspicious patterns identified. Include specific records to request (invoices, contracts, bank statements) and a reasonable response deadline.`,
    })
    suggestions.push({
      label: "Check for shell company indicators",
      prompt: `Based on the findings for "${entity}", what are the indicators that this could be a shell company or fictitious vendor? What additional checks should an auditor perform?`,
    })
  } else if (category.includes("payroll") || category.includes("overtime") || category.includes("compensation")) {
    suggestions.push({
      label: "Compare to department norms",
      prompt: `How does this overtime/payroll pattern compare to normal patterns in the ${finding.department ?? "relevant"} department? What would be considered acceptable vs. suspicious?`,
    })
    suggestions.push({
      label: "Draft supervisor inquiry",
      prompt: `Draft a memo to the department supervisor inquiring about the overtime patterns identified for employees in ${finding.department ?? "this department"}. Ask about approval processes and justification.`,
    })
  } else if (category.includes("integrity") || category.includes("revolving")) {
    suggestions.push({
      label: "Check conflict of interest",
      prompt: `What conflict of interest concerns exist for "${entity}"? Are there any legal or policy requirements that may have been violated?`,
    })
  }

  // Always offer cross-city comparison
  suggestions.push({
    label: "Similar patterns in other cities",
    prompt: `Are there similar patterns of potential waste or fraud in other cities that match what we see with "${entity}"? What precedents exist for this type of finding?`,
  })

  return suggestions.slice(0, 5) // max 5 suggestions
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
  const MIN_PANEL_WIDTH = 360
  const MAX_PANEL_WIDTH = 760
  const DEFAULT_PANEL_WIDTH = 440
  const router = useRouter()
  const { getAccessTokenSilently } = useAuth0()
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [promptDraft, setPromptDraft] = useState("")
  const [analysisResult, setAnalysisResult] = useState("")
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null)
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0)
  const [usageStats, setUsageStats] = useState<SessionStats | null>(null)
  /** Abort ref: incremented on each new finding to cancel stale polling loops. */
  const analysisGenerationRef = useRef(0)

  const finding = request?.finding ?? null
  const isOpen = Boolean(finding)

  useEffect(() => {
    if (!finding) return
    // Bump generation to abort any in-flight polling from a previous finding
    analysisGenerationRef.current += 1
    const nextPrompt = buildAnalysisPrompt(finding)
    setPromptDraft(nextPrompt)
    setAnalysisResult("")
    setAnalysisError(null)
    setUsageStats(null)
    setIsAnalyzing(false)
    // Auto-run once when a new finding is opened in the side panel.
    void runAnalysis(nextPrompt)
  }, [finding])

  useEffect(() => {
    if (!isAnalyzing || analysisStartedAt == null) return
    setAnalysisElapsedSeconds(
      Math.max(0, Math.floor((Date.now() - analysisStartedAt) / 1000))
    )
    const interval = window.setInterval(() => {
      setAnalysisElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - analysisStartedAt) / 1000))
      )
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isAnalyzing, analysisStartedAt])

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

  const runAnalysis = async (promptToRun: string) => {
    if (!promptToRun.trim()) return
    // Capture the current generation so we can bail if a new finding arrives.
    const myGeneration = analysisGenerationRef.current
    setIsAnalyzing(true)
    setAnalysisStartedAt(Date.now())
    setAnalysisElapsedSeconds(0)
    setAnalysisError(null)
    setAnalysisResult("")
    setUsageStats(null)

    let jobId: string | null = null

    try {
      const token = await withTimeout(
        getAccessTokenSilently(),
        30000,
        "Auth timed out while preparing Seymour analysis. Please try again."
      )

      // Bail if finding changed while we were getting the token
      if (analysisGenerationRef.current !== myGeneration) return

      const models = await withTimeout(
        getAvailableModels(token),
        30000,
        "Loading models timed out. Please try again."
      )
      const selectedModel = pickDefaultModelKey(models) ?? PREFERRED_DEFAULT_MODEL_KEY

      if (analysisGenerationRef.current !== myGeneration) return

      // 1. Create background job
      const jobResponse = await createChatJob(
        {
          message: promptToRun,
          model_key: selectedModel,
        },
        token
      )
      jobId = jobResponse.job_id

      // 2. Poll for completion
      const POLL_INTERVAL = 2000
      const MAX_POLLS = 150 // 5 minutes max

      for (let i = 0; i < MAX_POLLS; i++) {
        // Abort if finding changed during polling
        if (analysisGenerationRef.current !== myGeneration) return

        // Wait before polling
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))

        if (analysisGenerationRef.current !== myGeneration) return

        const job = await getJob(jobId, token)

        if (job.status === "completed") {
          // Only apply results if this is still the active generation
          if (analysisGenerationRef.current !== myGeneration) return
          const result = job.result as { response?: string; session_id?: string }
          setAnalysisResult(result?.response || "Analysis completed.")

          if (result?.session_id) {
            try {
              const stats = await getSessionStats(result.session_id, token)
              setUsageStats(stats)
              onSeymourUsage?.(stats.total_tokens_used ?? 0)
            } catch {
              // Ignore stats error
            }
          }
          return // Success
        }

        if (job.status === "failed" || job.status === "cancelled") {
          throw new Error(job.error_message || `Analysis ${job.status}`)
        }
        // Continue polling if pending/running
      }

      throw new Error("Analysis timed out waiting for completion.")

    } catch (error) {
      // Only show errors for the active generation
      if (analysisGenerationRef.current !== myGeneration) return
      const message =
        error instanceof Error ? error.message : "Failed to get Seymour analysis."
      setAnalysisError(message)
    } finally {
      // Only clear loading state if this is still the active generation
      if (analysisGenerationRef.current === myGeneration) {
        setIsAnalyzing(false)
        setAnalysisStartedAt(null)
      }
    }
  }

  const handleAnalyze = async () => {
    await runAnalysis(promptDraft)
  }

  const handleOpenFullChat = () => {
    const prompt = encodeURIComponent(promptDraft || (finding ? buildAnalysisPrompt(finding) : ""))
    router.push(`/home?prefill=${prompt}`)
  }

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsResizing(true)
    const startX = event.clientX
    const startWidth = panelWidth
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX
      const nextWidth = Math.min(
        MAX_PANEL_WIDTH,
        Math.max(MIN_PANEL_WIDTH, startWidth + delta)
      )
      setPanelWidth(nextWidth)
    }

    const handlePointerUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
  }

  if (!isOpen || !finding) return null

  return (
    <aside
      className={`fixed right-0 sm:right-4 top-0 sm:top-20 bottom-0 sm:bottom-4 z-40 w-full sm:w-auto sm:max-w-[calc(100vw-2rem)] sm:rounded-xl border border-purple-200 bg-white shadow-2xl flex flex-col ${
        isResizing ? "select-none" : ""
      }`}
      style={{
        // On sm+ we use panelWidth; on mobile the w-full class handles it
        "--panel-width": `${panelWidth}px`,
        minWidth: `min(360px, 100vw)`,
      } as React.CSSProperties}
    >
      <style>{`@media (min-width: 640px) { aside[style*="--panel-width"] { width: var(--panel-width) !important; } }`}</style>
      <div
        className="absolute left-0 top-0 bottom-0 w-3 -translate-x-1.5 cursor-col-resize group"
        onPointerDown={handleResizeStart}
        onDoubleClick={() => setPanelWidth(DEFAULT_PANEL_WIDTH)}
        title="Drag to resize Seymour panel (double-click to reset)"
        aria-hidden="true"
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 rounded-full bg-purple-200/80 group-hover:bg-purple-400 transition-colors" />
      </div>
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{heading}</p>
          <p className="text-xs text-gray-500 truncate">
            {finding.metric} - {finding.entity}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPanelWidth((prev) => Math.max(MIN_PANEL_WIDTH, prev - 60))}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-gray-100 text-gray-500"
            aria-label="Make Seymour panel narrower"
            title="Narrower"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPanelWidth((prev) => Math.min(MAX_PANEL_WIDTH, prev + 60))}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-gray-100 text-gray-500"
            aria-label="Make Seymour panel wider"
            title="Wider"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-gray-100 text-gray-500"
            aria-label="Close Seymour side chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
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
              ? `Seymour is analyzing this finding... (${analysisElapsedSeconds}s elapsed)\nYou can keep using the module while this runs.`
              : analysisResult || "Run analysis to see Seymour's output."}
          </div>
          {isAnalyzing ? (
            <div className="mt-3">
              <div className="h-2 w-full rounded-full bg-purple-100 overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-purple-500 seymour-indeterminate" />
              </div>
              <style>{`@keyframes seymour-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } } .seymour-indeterminate { animation: seymour-slide 1.5s ease-in-out infinite; }`}</style>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Request in progress. Complex analyses may take up to 2-3 minutes.
              </p>
            </div>
          ) : null}
          {usageStats && !isAnalyzing ? (
            <div className="mt-3 border-t border-gray-200 pt-2 text-xs text-gray-700 grid grid-cols-2 gap-2">
              <div>Tokens: {formatTokens(usageStats.total_tokens_used)}</div>
              <div>Prompt: {formatTokens(usageStats.total_prompt_tokens ?? 0)}</div>
              <div>Completion: {formatTokens(usageStats.total_completion_tokens ?? 0)}</div>
              <div>Cost: {formatCost(usageStats.estimated_cost_usd ?? 0)}</div>
            </div>
          ) : null}
        </div>

        {/* Contextual follow-up prompts */}
        {finding && !isAnalyzing && analysisResult && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Follow up
            </p>
            <div className="flex flex-wrap gap-1.5">
              {buildSuggestedPrompts(finding).map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setPromptDraft(s.prompt)
                    void runAnalysis(s.prompt)
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 hover:border-purple-300 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
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
