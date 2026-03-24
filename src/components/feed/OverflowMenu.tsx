"use client";

import { useEffect, useCallback } from "react";
import { Share2, EyeOff, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import styles from "./feed.module.css";

interface OverflowMenuProps {
  open: boolean;
  onClose: () => void;
  onShare: () => void;
  onHide: () => void;
  onDelete?: () => void;
  /** Use mobile bottom-sheet style */
  mobile: boolean;
}

export default function OverflowMenu({
  open,
  onClose,
  onShare,
  onHide,
  onDelete,
  mobile,
}: OverflowMenuProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleShare = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onShare();
      onClose();
    },
    [onShare, onClose],
  );

  const handleHide = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onHide();
      onClose();
    },
    [onHide, onClose],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm("Permanently delete this story? This cannot be undone.")) return;
      onDelete?.();
      onClose();
    },
    [onDelete, onClose],
  );

  if (!open) return null;

  // ── Mobile: bottom sheet via portal ──
  if (mobile) {
    return createPortal(
      <>
        <div className={styles.sheetBackdrop} onClick={onClose} />
        <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
          <div className={styles.sheetHandle} />

          <button type="button" className={styles.sheetItem} onClick={handleShare}>
            <span className={styles.sheetItemIcon}><Share2 size={18} /></span>
            Share
          </button>

          <button type="button" className={styles.sheetItem} onClick={handleHide}>
            <span className={styles.sheetItemIcon}><EyeOff size={18} /></span>
            Hide
          </button>

          {onDelete && (
            <button
              type="button"
              className={`${styles.sheetItem} ${styles.sheetItemDanger}`}
              onClick={handleDelete}
            >
              <span className={styles.sheetItemIcon}><Trash2 size={18} /></span>
              Admin: Delete this card
            </button>
          )}
        </div>
      </>,
      document.body,
    );
  }

  // ── Desktop: dropdown ──
  return (
    <div className={styles.overflowDropdown} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={styles.overflowItem} onClick={handleShare}>
        <span className={styles.overflowItemIcon}><Share2 size={16} /></span>
        Share
      </button>

      <button type="button" className={styles.overflowItem} onClick={handleHide}>
        <span className={styles.overflowItemIcon}><EyeOff size={16} /></span>
        Hide
      </button>

      {onDelete && (
        <button
          type="button"
          className={`${styles.overflowItem} ${styles.overflowItemDanger}`}
          onClick={handleDelete}
        >
          <span className={styles.overflowItemIcon}><Trash2 size={16} /></span>
          Admin: Delete this card
        </button>
      )}
    </div>
  );
}
