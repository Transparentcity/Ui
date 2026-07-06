import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  "under-review": {
    label: "Under review",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  final: {
    label: "Final",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
}

export function WasteReportStatusChip({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border",
        s.className,
      )}
    >
      {s.label}
    </span>
  )
}
