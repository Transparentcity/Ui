import styles from "./primitives.module.css";

export type ReportStatus = "draft" | "under-review" | "final";

const reportStatusClass: Record<ReportStatus, string> = {
  draft: styles.reportStatusDraft,
  "under-review": styles.reportStatusUnderReview,
  final: styles.reportStatusFinal,
};

const reportStatusLabel: Record<ReportStatus, string> = {
  draft: "Draft",
  "under-review": "Under review",
  final: "Final",
};

export function ReportStatusChip({ status }: { status: ReportStatus }) {
  return (
    <span className={`${styles.reportStatusChip} ${reportStatusClass[status]}`}>
      {reportStatusLabel[status]}
    </span>
  );
}
