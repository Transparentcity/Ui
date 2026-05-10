import styles from "./primitives.module.css";

export type FindingStatus = "open" | "in-review" | "confirmed" | "dismissed";

const statusClass: Record<FindingStatus, string> = {
  open: styles.statusOpen,
  "in-review": styles.statusInReview,
  confirmed: styles.statusConfirmed,
  dismissed: styles.statusDismissed,
};

const statusLabel: Record<FindingStatus, string> = {
  open: "Open",
  "in-review": "In review",
  confirmed: "Confirmed",
  dismissed: "Dismissed",
};

export function StatusChip({ status }: { status: FindingStatus }) {
  return <span className={`${styles.statusChip} ${statusClass[status]}`}>{statusLabel[status]}</span>;
}
