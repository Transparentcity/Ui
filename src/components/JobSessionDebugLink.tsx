"use client";

import styles from "./NewsletterAdmin.module.css";

type Props = {
  /** Chat session id for the Seymour job run (opens in dashboard chat). */
  sessionId: string | null | undefined;
  label?: string;
  className?: string;
};

/**
 * Opens the dashboard job-session chat for debugging (dispatches `job-session:open`).
 */
export default function JobSessionDebugLink({
  sessionId,
  label = "Job session",
  className,
}: Props) {
  const id = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!id) return null;

  return (
    <button
      type="button"
      className={className ?? styles.linkBtn}
      onClick={() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("job-session:open", { detail: { session_id: id } })
          );
        }
      }}
    >
      {label}
    </button>
  );
}
