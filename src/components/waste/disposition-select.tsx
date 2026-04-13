"use client"

import { useState } from "react"
import { Flag, X, SkipForward } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { WasteDispositionType } from "@/lib/apiClient"

const DISPOSITION_OPTIONS: { value: WasteDispositionType; label: string }[] = [
  { value: "confirmed_fraud", label: "Confirmed Fraud" },
  { value: "confirmed_waste", label: "Confirmed Waste" },
  { value: "policy_violation", label: "Policy Violation" },
  { value: "data_error", label: "Data Error" },
  { value: "false_positive", label: "False Positive" },
  { value: "under_investigation", label: "Under Investigation" },
  { value: "inconclusive", label: "Inconclusive" },
]

/** Dismiss reason → internal disposition mapping */
const DISMISS_REASONS: { label: string; value: WasteDispositionType }[] = [
  { label: "Not real", value: "false_positive" },
  { label: "Bad data", value: "data_error" },
  { label: "Already known", value: "inconclusive" },
]

interface DispositionSelectProps {
  value?: WasteDispositionType
  onValueChange: (value: WasteDispositionType) => void
  placeholder?: string
  className?: string
}

/** Full 7-option disposition dropdown (admin / legacy use). */
export function DispositionSelect({
  value,
  onValueChange,
  placeholder = "Select disposition…",
  className,
}: DispositionSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {DISPOSITION_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ---------------------------------------------------------------------------
// Simplified Flag / Dismiss / Skip buttons
// ---------------------------------------------------------------------------

interface QuickDispositionProps {
  /** Called when the user flags or dismisses (skip does not call this). */
  onDispose: (disposition: WasteDispositionType) => void
  /** Called when the user clicks Skip. */
  onSkip?: () => void
  className?: string
}

/**
 * Three-button triage UI: Flag, Dismiss, Skip.
 *
 * - **Flag** → maps to ``under_investigation``
 * - **Dismiss** → shows a quick reason picker that maps to the right
 *   internal disposition (``false_positive``, ``data_error``, or ``inconclusive``)
 * - **Skip** → no DB write, just moves on
 */
export function QuickDisposition({
  onDispose,
  onSkip,
  className,
}: QuickDispositionProps) {
  const [showDismissReasons, setShowDismissReasons] = useState(false)

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {/* Flag */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDispose("under_investigation")
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <Flag className="w-3.5 h-3.5" />
          Flag
        </button>

        {/* Dismiss */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowDismissReasons(!showDismissReasons)
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Dismiss
        </button>

        {/* Skip */}
        {onSkip && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSkip()
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:text-gray-600 transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip
          </button>
        )}
      </div>

      {/* Dismiss reason picker */}
      {showDismissReasons && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Why?</span>
          {DISMISS_REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowDismissReasons(false)
                onDispose(reason.value)
              }}
              className="px-2 py-1 rounded text-[11px] text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              {reason.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export { DISPOSITION_OPTIONS }
