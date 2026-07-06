"use client";

import { forwardRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { API_BASE_FOR_ASSETS } from "@/lib/apiBase";
import { clearPersistedWasteCache } from "@/lib/wasteQueryPersister";

import styles from "./ContextMenu.module.css";

interface ContextMenuProps {
  isOpen: boolean;
  isAdmin?: boolean;
  cityLeadCityIds?: number[];
  onClose: () => void;
  onViewChange?: (view: string) => void;
}

interface AdminMenuItem {
  icon: React.ReactElement;
  label: string;
  view: string;
}

const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(
  ({ isOpen, isAdmin = false, cityLeadCityIds = [], onClose, onViewChange }, ref) => {
    const { logout, getAccessTokenSilently } = useAuth0();
    const router = useRouter();

    // Check if user can access API docs (admin or city lead)
    const canAccessApiDocs = isAdmin || cityLeadCityIds.length > 0;

    const handleLogout = async () => {
      try {
        // Clear all local storage and session data
        localStorage.clear();
        sessionStorage.clear();
        // The persisted waste cache lives in IndexedDB, which the clears
        // above don't touch; without this the next account on the same
        // browser profile would restore this user's waste findings.
        await clearPersistedWasteCache();

        // Logout from Auth0
        await logout({
          logoutParams: {
            returnTo: window.location.origin + "/?logged_out=true",
          },
        });
      } catch (error) {
        console.error("Logout error:", error);
        // Force redirect even if logout fails
        window.location.href = "/?logged_out=true";
      }
    };

    const handleAdminView = (view: string) => {
      if (onViewChange) {
        onViewChange(view);
      }
      onClose();
    };

    const handleApiDocsClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      try {
        const token = await getAccessTokenSilently();
        const docsUrl = `${API_BASE_FOR_ASSETS}/admin/docs?token=${encodeURIComponent(token)}`;
        window.open(docsUrl, "_blank", "noopener,noreferrer");
      } catch (error) {
        console.error("Failed to get access token for API docs:", error);
        // Fallback: try without token (will fail if auth required)
        window.open(`${API_BASE_FOR_ASSETS}/admin/docs`, "_blank", "noopener,noreferrer");
      }
    };

    const adminMenuItems: AdminMenuItem[] = [
      {
        icon: (
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
            <path d="M3 3v18h18" />
            <path d="M18 9l-5 5-4-4-3 3" />
          </svg>
        ),
        label: "Dashboard",
        view: "system-stats",
      },
      {
        icon: (
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
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
        ),
        label: "Seymour\u2019s Inbox",
        view: "feed-stories-admin",
      },
      {
        icon: (
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
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        ),
        label: "City Data",
        view: "city-data",
      },
      {
        icon: (
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
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
        ),
        label: "Metrics",
        view: "metrics-admin",
      },
      {
        icon: (
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
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
          </svg>
        ),
        label: "Datasets",
        view: "datasets-admin",
      },
      {
        icon: (
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
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        ),
        label: "Users",
        view: "user-management",
      },
      {
        icon: (
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
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        ),
        label: "Official claims",
        view: "claims-admin",
      },
      {
        icon: (
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        ),
        label: "Job Logs",
        view: "job-logs",
      },
      {
        icon: (
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
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
            <line x1="2" y1="20" x2="8" y2="14" />
            <line x1="22" y1="20" x2="16" y2="14" />
          </svg>
        ),
        label: "Newsletters",
        view: "newsletter-admin",
      },
      {
        icon: (
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
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            <path d="M18 14h-8" />
            <path d="M15 18h-5" />
            <path d="M10 6h8v4h-8V6Z" />
          </svg>
        ),
        label: "Feed",
        view: "feed-admin",
      },
    ];

    return (
      <div
        ref={ref}
        className={`${styles.menu} ${isOpen ? styles.open : ""}` }
        id="context-menu"
        role="menu"
        aria-label="User menu"
      >
        {/* Sitemap - at top for easy access */}
        <Link href="/sitemap" className={styles.item} id="sitemap-menu-item" role="menuitem">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "20px",
              height: "20px",
            }}
          >
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
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
          </span>
          <span>Sitemap</span>
        </Link>

        {/* API Documentation - Only visible to admins or city leads */}
        {canAccessApiDocs && (
          <a
            href={`${API_BASE_FOR_ASSETS}/admin/docs`}
            className={styles.item}
            id="api-docs-menu-item"
            role="menuitem"
            onClick={handleApiDocsClick}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "20px",
                height: "20px",
              }}
            >
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
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                <line x1="8" y1="7" x2="16" y2="7"></line>
                <line x1="8" y1="11" x2="16" y2="11"></line>
                <line x1="8" y1="15" x2="12" y2="15"></line>
              </svg>
            </span>
            <span>API Documentation</span>
          </a>
        )}

        {isAdmin && (
          <>
            <div className={styles.divider}>Administration</div>
            {adminMenuItems.map((item) => (
              <button
                key={item.view}
                type="button"
                className={styles.item}
                data-view={item.view}
                role="menuitem"
                onClick={() => handleAdminView(item.view)}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "20px",
                    height: "20px",
                  }}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </>
        )}

        <button type="button" className={styles.item} id="logout-btn" role="menuitem" onClick={handleLogout}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "20px",
              height: "20px",
            }}
          >
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </span>
          <span>Logout</span>
        </button>
      </div>
    );
  }
);

ContextMenu.displayName = "ContextMenu";

export default ContextMenu;

