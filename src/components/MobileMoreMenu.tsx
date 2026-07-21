"use client";

import React, { useEffect, useCallback, useRef } from "react";
import styles from "./MobileMoreMenu.module.css";
import { ADMIN_MOBILE_ITEMS } from "@/lib/adminMenuItems";

interface MobileMoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  isAdmin?: boolean;
  onAdminViewChange?: (view: string) => void;
}

/**
 * Slide-up bottom sheet for secondary navigation items on mobile.
 * Shows Settings, and admin tools if the user is an admin.
 * Includes focus trap and keyboard navigation.
 */
export default function MobileMoreMenu({
  isOpen,
  onClose,
  onOpenSettings,
  isAdmin = false,
  onAdminViewChange,
}: MobileMoreMenuProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on Escape, trap Tab focus inside the sheet
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Focus trap: cycle Tab within the sheet
      if (e.key === "Tab" && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose]
  );

  // Attach keyboard handler, auto-focus first item, and lock body scroll on open
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);

    // Lock body scroll so content behind the sheet can't scroll (especially iOS)
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Auto-focus the first menu button after animation settles
    const timer = requestAnimationFrame(() => {
      const firstBtn = sheetRef.current?.querySelector<HTMLElement>("button");
      if (firstBtn) firstBtn.focus();
    });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(timer);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="More options"
      >
        <div className={styles.handle} />
        <ul className={styles.menuList}>
          <li>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                onOpenSettings();
                onClose();
              }}
            >
              <svg className={styles.menuItemIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>
          </li>

          {isAdmin && onAdminViewChange && ADMIN_MOBILE_ITEMS.length > 0 && (
            <>
              <li><div className={styles.separator} /></li>
              <li><div className={styles.sectionLabel}>Admin</div></li>
              {ADMIN_MOBILE_ITEMS.map((item) => (
                <li key={item.view}>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      onAdminViewChange(item.view);
                      onClose();
                    }}
                  >
                    <span
                      className={styles.menuItemIcon}
                      aria-hidden="true"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      </div>
    </>
  );
}
