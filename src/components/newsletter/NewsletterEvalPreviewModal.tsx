"use client";

import type { ReactNode } from "react";
import Loader from "@/components/Loader";
import {
  ResultDetailPane,
} from "@/components/newsletter/NewsletterEvalResultDetailPane";
import type { ModelInfo, NewsletterEvalResultDetail } from "@/lib/apiClient";
import styles from "../NewsletterAdmin.module.css";

export function NewsletterEvalPreviewModal({
  open,
  loading,
  title = "Eval result",
  panes,
  models,
  onClose,
  onRejudged,
  headerActions,
  compareMode = false,
}: {
  open: boolean;
  loading: boolean;
  title?: string;
  panes: NewsletterEvalResultDetail[];
  models: ModelInfo[];
  onClose: () => void;
  onRejudged: (updated: NewsletterEvalResultDetail) => void;
  headerActions?: ReactNode;
  compareMode?: boolean;
}) {
  if (!open && !loading) return null;

  return (
    <div
      className={styles.emailPreviewOverlay}
      style={compareMode && panes.length === 2 ? { padding: 8 } : undefined}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles.emailPreviewModal}
        style={
          compareMode && panes.length === 2
            ? {
                width: "100%",
                maxWidth: "100%",
                height: "100%",
                maxHeight: "100%",
                borderRadius: 12,
              }
            : { maxWidth: 1100, width: "94vw" }
        }
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.emailPreviewHeader}>
          <div className={styles.emailPreviewTitle}>{title}</div>
          <div className={styles.emailPreviewActions}>
            {headerActions}
            <button type="button" className={styles.secondaryBtn} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div
          className={styles.emailPreviewBody}
          style={{
            display: "flex",
            gap: compareMode && panes.length === 2 ? 12 : 16,
            minHeight: 0,
            padding: compareMode && panes.length === 2 ? 12 : undefined,
          }}
        >
          {loading ? (
            <div className={styles.emailPreviewEmpty}>
              <Loader size="sm" color="dark" />
              <span>Loading preview…</span>
            </div>
          ) : (
            panes.map((d) => (
              <div
                key={d.id || d.source_ref || d.subject}
                style={{
                  flex: "1 1 0",
                  display: "flex",
                  minWidth: 0,
                  width: `${100 / Math.max(panes.length, 1)}%`,
                }}
              >
                <ResultDetailPane
                  detail={d}
                  models={models}
                  compareMode={compareMode && panes.length === 2}
                  onRejudged={onRejudged}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
