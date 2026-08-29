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

/**
 * Dismiss reason → internal disposition mapping. The backend enum is coarse,
 * so each reason also carries a structured `note` (stored on the disposition
 * row) preserving WHY it was dismissed: "legitimate explanation" implies the
 * detector logic misread the pattern, "threshold too tight" implies
 * calibration, "wrong entity" implies entity resolution — three different
 * fixes that a bare false_positive can't distinguish. "Already known"
 * findings that were substantiated are true positives for detector
 * calibration, so they map to confirmed_waste rather than inconclusive.
 * `key` doubles as the keyboard shortcut in the triage list.
 */
export interface DismissReason {
  key: string
  label: string
  value: WasteDispositionType
  note: string
}

export const DISMISS_REASONS: DismissReason[] = [
  {
    key: "1",
    label: "Legitimate explanation",
    value: "false_positive",
    note: "Dismissed: pattern has a legitimate explanation",
  },
  {
    key: "2",
    label: "Threshold too tight",
    value: "false_positive",
    note: "Dismissed: within normal range — detector threshold too tight",
  },
  {
    key: "3",
    label: "Bad data",
    value: "data_error",
    note: "Dismissed: source data wrong or stale",
  },
  {
    key: "4",
    label: "Wrong entity",
    value: "data_error",
    note: "Dismissed: finding attached to the wrong entity",
  },
  {
    key: "5",
    label: "Already known (substantiated)",
    value: "confirmed_waste",
    note: "Already known: previously substantiated by audit or investigation",
  },
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
  onDispose: (disposition: WasteDispositionType, note?: string) => void
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
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
              key={reason.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowDismissReasons(false)
                onDispose(reason.value, reason.note)
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
