"use client";

import Link from "next/link";
import { useAuth0 } from "@auth0/auth0-react";
import {
  ADMIN_MENU_ITEMS,
  ADMIN_API_DOCS_ICON,
  ADMIN_SITEMAP_ICON,
} from "@/lib/adminMenuItems";
import { API_BASE_FOR_ASSETS } from "@/lib/apiBase";
import { clearPersistedWasteCache } from "@/lib/wasteQueryPersister";
import styles from "./ContextMenu.module.css";

interface UserMenuPanelProps {
  isAdmin?: boolean;
  onClose: () => void;
  onViewChange?: (view: string) => void;
  onOpenSettings?: () => void;
}

function MenuIcon({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "20px",
        height: "20px",
      }}
    >
      {children}
    </span>
  );
}

export default function UserMenuPanel({
  isAdmin = false,
  onClose,
  onViewChange,
  onOpenSettings,
}: UserMenuPanelProps) {
  const { logout, getAccessTokenSilently } = useAuth0();

  const handleLogout = async () => {
    onClose();
    try {
      localStorage.clear();
      sessionStorage.clear();
      await clearPersistedWasteCache();
      await logout({
        logoutParams: {
          returnTo: window.location.origin + "/?logged_out=true",
        },
      });
    } catch (error) {
      console.error("Logout error:", error);
      window.location.href = "/?logged_out=true";
    }
  };

  const handleAdminView = (view: string) => {
    onViewChange?.(view);
    onClose();
  };

  const handleApiDocsClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onClose();
    try {
      const token = await getAccessTokenSilently();
      const docsUrl = `${API_BASE_FOR_ASSETS}/admin/docs?token=${encodeURIComponent(token)}`;
      window.open(docsUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Failed to get access token for API docs:", error);
      window.open(`${API_BASE_FOR_ASSETS}/admin/docs`, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      {isAdmin && (
        <>
          <Link href="/sitemap" className={styles.item} id="sitemap-menu-item" role="menuitem" onClick={onClose}>
            <MenuIcon>{ADMIN_SITEMAP_ICON}</MenuIcon>
            <span>Sitemap</span>
          </Link>
          <a
            href={`${API_BASE_FOR_ASSETS}/admin/docs`}
            className={styles.item}
            id="api-docs-menu-item"
            role="menuitem"
            onClick={handleApiDocsClick}
          >
            <MenuIcon>{ADMIN_API_DOCS_ICON}</MenuIcon>
            <span>API Documentation</span>
          </a>
          <div className={styles.divider}>Administration</div>
          {ADMIN_MENU_ITEMS.map((item) => (
            <button
              key={item.view}
              type="button"
              className={styles.item}
              data-view={item.view}
              role="menuitem"
              onClick={() => handleAdminView(item.view)}
            >
              <MenuIcon>{item.icon}</MenuIcon>
              <span>{item.label}</span>
            </button>
          ))}
        </>
      )}
      {onOpenSettings && (
        <button
          type="button"
          className={styles.item}
          id="settings-menu-item"
          role="menuitem"
          onClick={() => {
            onOpenSettings();
            onClose();
          }}
        >
          <MenuIcon>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: "grayscale(100%)" }}
              aria-hidden="true"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </MenuIcon>
          <span>Settings</span>
        </button>
      )}
      <button type="button" className={styles.item} id="logout-btn" role="menuitem" onClick={handleLogout}>
        <MenuIcon>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: "grayscale(100%)" }}
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </MenuIcon>
        <span>Logout</span>
      </button>
    </>
  );
}
