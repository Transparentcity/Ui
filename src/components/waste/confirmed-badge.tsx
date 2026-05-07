import { BadgeCheck } from "lucide-react"
import { cn } from "@/lib/utils"

interface ConfirmedBadgeProps {
  variant?: "compact" | "stamp"
  className?: string
}

// "Stamp" style: red, uppercase, slightly tilted — reads as a verified
// investigation stamp so reviewers don't mistake the row for a newly
// surfaced finding. "Compact" is a smaller pill for dense rows.
export function ConfirmedBadge({ variant = "compact", className }: ConfirmedBadgeProps) {
  if (variant === "stamp") {
    return (
      <span
        title="Previously confirmed case — not a newly surfaced finding"
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-[0.08em] border-2 border-red-600 text-red-700 bg-red-50 shadow-sm shrink-0",
          className
        )}
      >
        <BadgeCheck className="w-3.5 h-3.5 fill-red-600 text-white" />
        Confirmed
      </span>
    )
  }

  return (
    <span
      title="Previously confirmed case — not a newly surfaced finding"
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border border-red-300 bg-red-50 text-red-700 uppercase tracking-wide shrink-0",
        className
      )}
    >
      <BadgeCheck className="w-3 h-3 fill-red-600 text-white" />
      Confirmed
    </span>
  )
}
