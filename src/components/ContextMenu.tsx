"use client";

import { forwardRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

interface ContextMenuProps {
  isOpen: boolean;
  isAdmin?: boolean;
  onClose: () => void;
  onViewChange?: (view: string) => void;
}

interface AdminMenuItem {
  icon: JSX.Element;
  label: string;
  view: string;
}

const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(
  ({ isOpen, isAdmin = false, onClose, onViewChange }, ref) => {
    const { logout, getAccessTokenSilently } = useAuth0();
    const router = useRouter();

    const handleLogout = async () => {
      try {
        // Clear all local storage and session data
        localStorage.clear();
        sessionStorage.clear();

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
        const docsUrl = `${API_BASE}/admin/docs?token=${encodeURIComponent(token)}`;
        window.open(docsUrl, "_blank", "noopener,noreferrer");
      } catch (error) {
        console.error("Failed to get access token for API docs:", error);
        // Fallback: try without token (will fail if auth required)
        window.open(`${API_BASE}/admin/docs`, "_blank", "noopener,noreferrer");
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
    ];

    return (
      <div
        ref={ref}
        className={`context-menu ${isOpen ? "show" : ""}`}
        id="context-menu"
      >
        <a
          href={`${API_BASE}/admin/docs`}
          className="context-menu-item"
          id="api-docs-menu-item"
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

        {isAdmin && (
          <>
            <div className="context-menu-divider">Administration</div>
            {adminMenuItems.map((item) => (
              <div
                key={item.view}
                className="context-menu-item"
                data-view={item.view}
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
              </div>
            ))}
          </>
        )}

        <div className="context-menu-item" id="logout-btn" onClick={handleLogout}>
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
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </span>
          <span>Logout</span>
        </div>
      </div>
    );
  }
);

ContextMenu.displayName = "ContextMenu";

export default ContextMenu;

