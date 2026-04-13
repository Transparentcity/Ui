"use client"

import { cn } from "@/lib/utils"
import {
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Clock,
} from "lucide-react"
import type { AIAuditorStepResult } from "@/lib/apiClient"

const STATUS_STYLE: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  completed: { icon: CheckCircle2, color: "text-green-500" },
  failed: { icon: XCircle, color: "text-red-500" },
  running: { icon: Loader2, color: "text-blue-500" },
  pending: { icon: Clock, color: "text-gray-500" },
}

interface AIAuditorStepCardProps {
  step: AIAuditorStepResult
  className?: string
}

export function AIAuditorStepCard({ step, className }: AIAuditorStepCardProps) {
  const statusMeta = STATUS_STYLE[step.status] ?? STATUS_STYLE.pending
  const StatusIcon = statusMeta.icon

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-4",
        step.status === "running" ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {/* Step indicator */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="rounded-full bg-purple-100 p-1.5">
            <Bot className="w-4 h-4 text-purple-600" />
          </div>
          <span className="text-[10px] font-mono text-gray-500">
            {step.step_number}/8
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-800">
              {step.step_name}
            </span>
            <StatusIcon
              className={cn(
                "w-4 h-4 shrink-0",
                statusMeta.color,
                step.status === "running" && "animate-spin"
              )}
            />
            {step.duration_seconds > 0 && (
              <span className="text-[10px] text-gray-500 ml-auto">
                {step.duration_seconds.toFixed(1)}s
              </span>
            )}
          </div>

          {/* Reasoning */}
          {step.reasoning && (
            <p className="text-sm text-gray-600 whitespace-pre-wrap mb-2">
              {step.reasoning}
            </p>
          )}

          {/* Sources */}
          {step.sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {step.sources.map((source, i) => (
                <a
                  key={i}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {(() => {
                    try {
                      return new URL(source).hostname.replace("www.", "")
                    } catch {
                      return source.slice(0, 30)
                    }
                  })()}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Summary card shown after all steps complete ──

interface AIAuditorSummaryProps {
  classification: string
  confidence: string
  summary: string
  estimatedHumanHours: number
  actualAISeconds: number
  recommendedActions: string[]
  className?: string
}

const CLASSIFICATION_STYLE: Record<string, string> = {
  false_positive: "bg-green-100 text-green-800",
  likely_false_positive: "bg-green-50 text-green-700",
  inconclusive: "bg-yellow-100 text-yellow-800",
  corroborated_concern: "bg-red-100 text-red-800",
  confirmed: "bg-red-200 text-red-900",
}

export function AIAuditorSummary({
  classification,
  confidence,
  summary,
  estimatedHumanHours,
  actualAISeconds,
  recommendedActions,
  className,
}: AIAuditorSummaryProps) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 border-purple-200 bg-purple-50/50 p-5",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-5 h-5 text-purple-600" />
        <span className="text-sm font-bold text-purple-900">
          AI Auditor Classification
        </span>
      </div>

      {/* Classification badge */}
      <div className="flex items-center gap-3 mb-3">
        <span
          className={cn(
            "inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
            CLASSIFICATION_STYLE[classification] ?? "bg-gray-100 text-gray-700"
          )}
        >
          {classification.replace(/_/g, " ")}
        </span>
        <span className="text-xs text-gray-500">
          Confidence: <strong className="capitalize">{confidence}</strong>
        </span>
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-700 mb-4">{summary}</p>

      {/* Time comparison */}
      <div className="flex gap-4 mb-4 text-xs text-gray-500">
        <div>
          <span className="font-semibold text-purple-700">
            {Math.round(actualAISeconds)}s
          </span>{" "}
          AI analysis time
        </div>
        <div>
          <span className="font-semibold text-gray-700">
            ~{estimatedHumanHours}h
          </span>{" "}
          estimated human equivalent
        </div>
      </div>

      {/* Recommended actions */}
      {recommendedActions.length > 0 && (
        <div>
          <span className="text-xs font-semibold text-gray-600 mb-1 block">
            Recommended Next Steps
          </span>
          <ul className="space-y-1">
            {recommendedActions.map((action, i) => (
              <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                <span className="text-purple-400 shrink-0">•</span>
                {action}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
