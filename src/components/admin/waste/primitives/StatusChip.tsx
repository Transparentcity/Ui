import { Badge } from "@/components/ui/badge";

export type FindingStatus = "open" | "in-review" | "confirmed" | "dismissed";

const statusTint: Record<FindingStatus, string> = {
  open: "bg-purple-50 text-purple-700 border-purple-200",
  "in-review": "bg-indigo-50 text-indigo-700 border-indigo-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  dismissed: "bg-gray-100 text-gray-600 border-gray-200",
};

const statusLabel: Record<FindingStatus, string> = {
  open: "Open",
  "in-review": "In review",
  confirmed: "Confirmed",
  dismissed: "Dismissed",
};

export function StatusChip({ status }: { status: FindingStatus }) {
  return (
    <Badge variant="outline" className={`px-2 py-0.5 ${statusTint[status]}`}>
      {statusLabel[status]}
    </Badge>
  );
}
