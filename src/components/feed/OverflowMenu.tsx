"use client";

import { useEffect, useCallback } from "react";
import { Share2, EyeOff, Trash2, Lock, ThumbsUp } from "lucide-react";
import { createPortal } from "react-dom";
import styles from "./feed.module.css";

interface OverflowMenuProps {
  open: boolean;
  onClose: () => void;
  onShare: () => void;
  onHide?: () => void;
  onApplaud?: () => void;
  /** When true, show Unlike instead of Like (admin already liked this story). */
  likedByMe?: boolean;
  onDelete?: () => void;
  /** Owner: move a shared saved-place story back to private place scope. */
  onMakePrivate?: () => void;
  makePrivatePending?: boolean;
  /**
   * When true, omit Share from this menu (card action bar already has Share).
   * Use for signed-in owner overflow with only Make private.
   */
  omitShare?: boolean;
  /** Use mobile bottom-sheet style */
  mobile: boolean;
}

export default function OverflowMenu({
  open,
  onClose,
  onShare,
  onHide,
  onApplaud,
  likedByMe = false,
  onDelete,
  onMakePrivate,
  makePrivatePending = false,
  omitShare = false,
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
      onHide?.();
      onClose();
    },
    [onHide, onClose],
  );

  const handleMakePrivate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMakePrivate?.();
      onClose();
    },
    [onMakePrivate, onClose],
  );

  const handleApplaud = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Keep menu open so Like ↔ Unlike label/icon can update in place.
      onApplaud?.();
    },
    [onApplaud],
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

          {!omitShare && (
            <button type="button" className={styles.sheetItem} onClick={handleShare}>
              <span className={styles.sheetItemIcon}><Share2 size={18} /></span>
              Share
            </button>
          )}

          {onHide && (
            <button type="button" className={styles.sheetItem} onClick={handleHide}>
              <span className={styles.sheetItemIcon}><EyeOff size={18} /></span>
              Hide
            </button>
          )}

          {onMakePrivate && (
            <button
              type="button"
              className={styles.sheetItem}
              onClick={handleMakePrivate}
              disabled={makePrivatePending}
            >
              <span className={styles.sheetItemIcon}><Lock size={18} /></span>
              {makePrivatePending ? "Making private…" : "Make private"}
            </button>
          )}

          {onApplaud && (
            <button
              type="button"
              className={`${styles.sheetItem}${likedByMe ? ` ${styles.sheetItemLiked}` : ""}`}
              onClick={handleApplaud}
              aria-pressed={likedByMe}
            >
              <span className={styles.sheetItemIcon}>
                <ThumbsUp size={18} fill={likedByMe ? "currentColor" : "none"} />
              </span>
              {likedByMe ? "Admin: Unlike" : "Admin: Like"}
            </button>
          )}

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
      {!omitShare && (
        <button type="button" className={styles.overflowItem} onClick={handleShare}>
          <span className={styles.overflowItemIcon}><Share2 size={16} /></span>
          Share
        </button>
      )}

      {onHide && (
        <button type="button" className={styles.overflowItem} onClick={handleHide}>
          <span className={styles.overflowItemIcon}><EyeOff size={16} /></span>
          Hide
        </button>
      )}

      {onMakePrivate && (
        <button
          type="button"
          className={styles.overflowItem}
          onClick={handleMakePrivate}
          disabled={makePrivatePending}
        >
          <span className={styles.overflowItemIcon}><Lock size={16} /></span>
          {makePrivatePending ? "Making private…" : "Make private"}
        </button>
      )}

      {onApplaud && (
        <button
          type="button"
          className={`${styles.overflowItem}${likedByMe ? ` ${styles.overflowItemLiked}` : ""}`}
          onClick={handleApplaud}
          aria-pressed={likedByMe}
        >
          <span className={styles.overflowItemIcon}>
            <ThumbsUp size={16} fill={likedByMe ? "currentColor" : "none"} />
          </span>
          {likedByMe ? "Admin: Unlike" : "Admin: Like"}
        </button>
      )}

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
