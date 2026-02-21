"use client"

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

interface DispositionSelectProps {
  value?: WasteDispositionType
  onValueChange: (value: WasteDispositionType) => void
  placeholder?: string
  className?: string
}

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

export { DISPOSITION_OPTIONS }
