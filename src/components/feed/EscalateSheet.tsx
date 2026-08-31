"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import styles from "./feed.module.css";

interface EscalateSheetProps {
  open: boolean;
  headline: string;
  isOfficial?: boolean;
  onClose: () => void;
  onSend: (comment: string, includeName: boolean) => void;
}

export default function EscalateSheet({ open, headline, isOfficial, onClose, onSend }: EscalateSheetProps) {
  // Reset key increments each time sheet opens, resetting controlled inputs
  const [resetKey, setResetKey] = useState(0);
  const prevOpen = useRef(false);
  if (open && !prevOpen.current) {
    // Transition from closed → open: bump key to reset state
    setResetKey((k) => k + 1);
  }
  prevOpen.current = open;

  const [comment, setComment] = useState("");
  const [includeName, setIncludeName] = useState(true);

  // Reset controlled state when resetKey changes (sheet re-opens)
  const lastResetKey = useRef(resetKey);
  if (resetKey !== lastResetKey.current) {
    lastResetKey.current = resetKey;
    if (comment !== "") setComment("");
    if (!includeName) setIncludeName(true);
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleSend = useCallback(() => {
    onSend(comment, isOfficial ? true : includeName);
    onClose();
    toast.success(
      isOfficial
        ? "Added to your Research Queue."
        : "Your flag was sent to your district representative. They'll see it in their dashboard.",
    );
  }, [onSend, onClose, comment, includeName, isOfficial]);

  const handleSkip = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!open) return null;

  // Word count for textarea
  const wordCount = comment.trim() ? comment.trim().split(/\s+/).length : 0;

  return createPortal(
    <>
      <div className={styles.sheetBackdrop} onClick={() => {
        if (comment.trim() && !confirm("You have unsaved feedback. Close anyway?")) return;
        onClose();
      }} />
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.sheetHandle} />
        <div className={styles.escalateSheet}>
          <p className={styles.escalateContext}>{headline}</p>

          <textarea
            className={styles.escalateTextarea}
            placeholder={
              isOfficial
                ? "Add a note for your research queue (optional)"
                : "Send a comment to your local representative"
            }
            value={comment}
            onChange={(e) => {
              const words = e.target.value.trim().split(/\s+/);
              if (e.target.value.trim() === "" || words.length <= 150) {
                setComment(e.target.value);
              }
            }}
            rows={3}
          />
          {wordCount > 0 && (
            <div style={{ fontSize: 12, color: wordCount >= 140 ? "var(--error)" : "var(--text-tertiary)", textAlign: "right", marginTop: 2 }}>
              {wordCount}/150 words{wordCount >= 140 ? " — approaching limit" : ""}
            </div>
          )}

          {!isOfficial && (
            <div className={styles.escalateToggleRow}>
              <span>Include my name</span>
              <button
                type="button"
                role="switch"
                aria-checked={includeName}
                className={`${styles.escalateToggle} ${includeName ? styles.escalateToggleOn : ""}`}
                onClick={() => setIncludeName((v) => !v)}
                aria-label="Include my name"
              />
            </div>
          )}

          {isOfficial && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "8px 0 0" }}>
              This will be added to your Research Queue. Your name is included automatically.
            </p>
          )}

          <button type="button" className={styles.escalateSendBtn} onClick={handleSend}>
            {isOfficial ? "Flag for Research" : "Send"}
          </button>

          <button type="button" className={styles.escalateSkip} onClick={handleSkip}>
            Skip
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
