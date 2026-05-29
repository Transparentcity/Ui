"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import styles from "./MobileBottomNav.module.css";

export type MobileTab = "feed" | "my-places" | "inbox" | "more";

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  inboxUnreadCount?: number;
}

/**
 * Whether an element is a text-entry field that would summon the virtual keyboard.
 */
function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true; // native picker on iOS, soft input on Android
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    // These input types open the keyboard
    return ["text", "search", "url", "tel", "email", "password", "number"].includes(type);
  }
  if (el.getAttribute("contenteditable") === "true") return true;
  if (el.getAttribute("role") === "textbox") return true;
  return false;
}

/**
 * Persistent bottom navigation bar for mobile (<=768px).
 * Three tabs: Feed | My Places | More.
 *
 * Hides when the virtual keyboard is open using three combined signals:
 * 1. visualViewport resize (primary, most reliable)
 * 2. focusin/focusout on text inputs (fast response)
 * 3. CSS fallback via pointer-events when hidden
 *
 * The nav reappears immediately when the keyboard closes.
 */
export default function MobileBottomNav({ activeTab, onTabChange, inboxUnreadCount = 0 }: MobileBottomNavProps) {
  const [hidden, setHidden] = useState(false);
  // Track whether a text input is focused (keyboard likely open)
  const inputFocusedRef = useRef(false);
  // Debounce timer for focusout to avoid flash between input transitions
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateVisibility = useCallback(() => {
    const vv = window.visualViewport;
    if (vv) {
      // Primary signal: viewport shrank significantly while a text input has focus
      const viewportShrank = vv.height < window.innerHeight * 0.7;
      setHidden(viewportShrank && inputFocusedRef.current);
    } else {
      // Fallback for browsers without visualViewport: rely on focus state alone
      setHidden(inputFocusedRef.current);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // --- Signal 1: visualViewport resize ---
    const vv = window.visualViewport;
    const handleVVResize = () => updateVisibility();

    if (vv) {
      vv.addEventListener("resize", handleVVResize);
    }

    // --- Signal 2: focusin/focusout on text inputs ---
    const handleFocusIn = (e: FocusEvent) => {
      // Clear any pending blur timer so we don't flash the nav between inputs
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      if (isTextInput(e.target as Element)) {
        inputFocusedRef.current = true;
        // Small delay to let visualViewport resize fire first on iOS
        requestAnimationFrame(() => updateVisibility());
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      if (isTextInput(e.target as Element)) {
        // Delay the "keyboard closed" signal: when the user taps from one input
        // to another, focusout fires before focusin on the new input. Without
        // this delay the nav would flash visible between inputs. 150ms covers
        // slow Android devices where focusin can be delayed.
        blurTimerRef.current = setTimeout(() => {
          inputFocusedRef.current = false;
          updateVisibility();
        }, 150);
      }
    };

    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);

    return () => {
      if (vv) vv.removeEventListener("resize", handleVVResize);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, [updateVisibility]);

  const tabs: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "feed",
      label: "Feed",
      icon: (
        <svg className={styles.tabIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
          <path d="M18 14h-8" />
          <path d="M15 18h-5" />
          <path d="M10 6h8v4h-8V6Z" />
        </svg>
      ),
    },
    {
      id: "my-places",
      label: "My Places",
      icon: (
        <svg className={styles.tabIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
    },
    {
      id: "inbox",
      label: "Inbox",
      icon: (
        <span className={styles.tabIconWrapper}>
          <svg className={styles.tabIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
          {inboxUnreadCount > 0 && (
            <span
              className={styles.tabUnreadDot}
              aria-label={`${inboxUnreadCount} unread`}
            />
          )}
        </span>
      ),
    },
    {
      id: "more",
      label: "More",
      icon: (
        <svg className={styles.tabIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      className={`${styles.bottomNav}${hidden ? ` ${styles.bottomNavKeyboardHidden}` : ""}`}
      aria-label="Main navigation"
      aria-hidden={hidden}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`${styles.tab}${activeTab === tab.id ? ` ${styles.tabActive}` : ""}`}
          onClick={() => onTabChange(tab.id)}
          aria-label={
            tab.id === "inbox" && inboxUnreadCount > 0
              ? `Inbox, ${inboxUnreadCount} unread`
              : tab.label
          }
          aria-current={activeTab === tab.id ? "page" : undefined}
          tabIndex={hidden ? -1 : 0}
        >
          {tab.icon}
          <span className={styles.tabLabel}>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
