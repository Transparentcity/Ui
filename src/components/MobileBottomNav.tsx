"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import UserMenuPanel from "./UserMenuPanel";
import styles from "./MobileBottomNav.module.css";
import menuStyles from "./ContextMenu.module.css";

export type MobileTab = "my-places" | "profile";

interface MobileBottomNavProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  profilePictureUrl?: string | null;
  profileInitial?: string;
  isAdmin?: boolean;
  onViewChange?: (view: string) => void;
  onOpenSettings?: () => void;
  /** Called when the profile menu opens or closes (e.g. close sidebar on open). */
  onProfileMenuToggle?: (open: boolean) => void;
}

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    return ["text", "search", "url", "tel", "email", "password", "number"].includes(type);
  }
  if (el.getAttribute("contenteditable") === "true") return true;
  if (el.getAttribute("role") === "textbox") return true;
  return false;
}

/**
 * Mobile bottom nav: Profile (left) | My Places (right).
 * Profile opens account menu; My Places toggles the left sidebar.
 */
export default function MobileBottomNav({
  sidebarOpen,
  onToggleSidebar,
  profilePictureUrl = null,
  profileInitial = "U",
  isAdmin = false,
  onViewChange,
  onOpenSettings,
  onProfileMenuToggle,
}: MobileBottomNavProps) {
  const [hidden, setHidden] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const inputFocusedRef = useRef(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileWrapRef = useRef<HTMLDivElement>(null);

  const updateVisibility = useCallback(() => {
    const vv = window.visualViewport;
    if (vv) {
      const viewportShrank = vv.height < window.innerHeight * 0.7;
      setHidden(viewportShrank && inputFocusedRef.current);
    } else {
      setHidden(inputFocusedRef.current);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const vv = window.visualViewport;
    const handleVVResize = () => updateVisibility();
    if (vv) vv.addEventListener("resize", handleVVResize);

    const handleFocusIn = (e: FocusEvent) => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
      if (isTextInput(e.target as Element)) {
        inputFocusedRef.current = true;
        requestAnimationFrame(() => updateVisibility());
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      if (isTextInput(e.target as Element)) {
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

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (profileWrapRef.current && !profileWrapRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileMenuOpen]);

  const closeProfileMenu = () => {
    setProfileMenuOpen(false);
    onProfileMenuToggle?.(false);
  };

  const handleProfileClick = () => {
    setProfileMenuOpen((open) => {
      const next = !open;
      onProfileMenuToggle?.(next);
      return next;
    });
  };

  const handleMyPlacesClick = () => {
    closeProfileMenu();
    onToggleSidebar();
  };

  return (
    <>
      {profileMenuOpen && (
        <button
          type="button"
          className={styles.menuBackdrop}
          aria-label="Close menu"
          onClick={closeProfileMenu}
        />
      )}
      <nav
        className={`${styles.bottomNav}${hidden ? ` ${styles.bottomNavKeyboardHidden}` : ""}`}
        aria-label="Main navigation"
        aria-hidden={hidden}
      >
        <div ref={profileWrapRef} className={styles.profileTabWrap}>
          {profileMenuOpen && (
            <div
              className={`${menuStyles.menu} ${menuStyles.open} ${styles.profileMenu}`}
              id="mobile-profile-menu"
              role="menu"
              aria-label="User menu"
            >
              <UserMenuPanel
                isAdmin={isAdmin}
                onClose={closeProfileMenu}
                onViewChange={onViewChange}
                onOpenSettings={onOpenSettings}
              />
            </div>
          )}
          <button
            type="button"
            className={`${styles.tab}${profileMenuOpen ? ` ${styles.tabActive}` : ""}`}
            onClick={handleProfileClick}
            aria-label="Account"
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
            tabIndex={hidden ? -1 : 0}
          >
            <span
              className={`${styles.profileAvatar}${isAdmin ? ` ${styles.profileAvatarAdmin}` : ""}`}
            >
              {profilePictureUrl ? (
                <img src={profilePictureUrl} alt="" />
              ) : (
                profileInitial
              )}
            </span>
            <span className={styles.tabLabel}>Account</span>
          </button>
        </div>

        <button
          type="button"
          className={`${styles.tab}${sidebarOpen && !profileMenuOpen ? ` ${styles.tabActive}` : ""}`}
          onClick={handleMyPlacesClick}
          aria-label="My Places"
          aria-expanded={sidebarOpen}
          aria-current={sidebarOpen && !profileMenuOpen ? "page" : undefined}
          tabIndex={hidden ? -1 : 0}
        >
          <svg className={styles.tabIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span className={styles.tabLabel}>My Places</span>
        </button>
      </nav>
    </>
  );
}
