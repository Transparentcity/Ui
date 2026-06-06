import { Badge } from "@/components/ui/badge";

export type ReportStatus = "draft" | "under-review" | "final";

const reportStatusTint: Record<ReportStatus, string> = {
  draft: "bg-amber-50 text-amber-700 border-amber-200",
  "under-review": "bg-blue-50 text-blue-700 border-blue-200",
  final: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const reportStatusLabel: Record<ReportStatus, string> = {
  draft: "Draft",
  "under-review": "Under review",
  final: "Final",
};

export function ReportStatusChip({ status }: { status: ReportStatus }) {
  return (
    <Badge variant="outline" className={`px-2 py-0.5 ${reportStatusTint[status]}`}>
      {reportStatusLabel[status]}
    </Badge>
  );
}
