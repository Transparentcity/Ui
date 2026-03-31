import { cn } from "@/lib/utils";

interface DataNoticeProps {
  children: React.ReactNode;
  severity?: "info" | "warning";
}

export default function DataNotice({
  children,
  severity = "info",
}: DataNoticeProps) {
  return (
    <div
      className={cn(
        "rounded-md px-4 py-3 text-sm",
        severity === "info"
          ? "bg-blue-50 text-blue-700 border border-blue-200"
          : "bg-amber-50 text-amber-700 border border-amber-200"
      )}
    >
      {children}
    </div>
  );
}
