"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import UserProfile from "./UserProfile";
import SessionList from "./SessionList";
import JobSessionList from "./JobSessionList";
import MyCities from "./MyCities";
import ResearchList from "./ResearchList";
import SidebarCitySearch, { type SidebarCitySelectOptions } from "./SidebarCitySearch";
import styles from "./Sidebar.module.css";
import type { UserPlace } from "@/lib/apiClient";

interface SidebarProps {
  isOpen: boolean;
  isAdmin?: boolean;
  cityLeadCityIds?: number[];
  /** When true, show a small "g" in the logo braces (government mode). */
  governmentVerified?: boolean;
  /** When set and not a preview address, "g" is darker (approved); otherwise light grey. */
  governmentEmail?: string | null;
  onNewChat: () => void;
  onSearchCities?: () => void; // Optional for backward compatibility
  onOpenSettings?: () => void;
  onViewChange?: (view: string) => void;
  onSessionClick?: (sessionId: string) => void;
  onJobSessionClick?: (sessionId: string) => void;
  currentSessionId?: string | null;
  isCurrentSessionJobSession?: boolean;
  onSessionDeleted?: (sessionId: string) => void;
  onClose?: () => void;
  onCityClick?: (cityId: number) => void;
  onDistrictClick?: (cityId: number, district: number) => void;
  activeCityId?: number | null;
  /** Active district when viewing a city (for highlighting in My Places). */
  activeDistrict?: string | number | null;
  /** User's saved places (for My Places list). When set, shown under each city. */
  userPlaces?: Array<{ id: number; city_id: number; label: string }>;
  /** Currently selected place id (for active state in sidebar). */
  activePlaceId?: number | null;
  /** Called when user clicks a saved place in My Places: open city with this place selected. */
  onPlaceClick?: (cityId: number, placeId: number) => void;
  onResearchClick?: (reportId: number) => void;
  currentResearchId?: number | null;
  onResearchDeleted?: (reportId: number) => void;
  onCitySelect?: (cityId: number, opts?: SidebarCitySelectOptions) => void;
  onGPSLocation?: (location: { lat: number; lng: number } | null) => void;
  /** Called after user saves a personalized place from Search Cities (optional full place for navigation + metrics bootstrap). */
  onPlaceSaved?: (place?: UserPlace) => void;
  /** Called after a place is renamed (so parent can refetch places). */
  onPlaceRenamed?: (placeId: number, newLabel: string) => void;
  /** Called after a place is deleted (so parent can refetch and clear selection). */
  onPlaceDeleted?: (placeId: number) => void;
  /** Called after user removes a followed district from My Places (sidebar). */
  onDistrictRemoved?: (cityId: number, district: string) => void;
  onMenuToggle?: () => void;
  currentView?: string;
  /** Current sidebar width in pixels (for resizable sidebar). */
  sidebarWidth?: number;
  /** Called when the user drags the resize handle. */
  onWidthChange?: (width: number) => void;
  /** When false (default), hides New Chat, Recent Chats, and gov-only items for launch. */
  chatEnabled?: boolean;
  /** City name for the active city (used in Recent Questions). */
  activeCityName?: string | null;
  /** Called when user clicks a sample question in Recent Questions. */
  onQuestionClick?: (question: string) => void;
  /** Unread count for the Inbox nav item. Shows a purple dot when > 0. */
  inboxUnreadCount?: number;
}

// Mobile breakpoint (matches CSS media query)
const MOBILE_BREAKPOINT = 768;

// Helper function to check if screen is narrow (mobile)
const isNarrowScreen = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= MOBILE_BREAKPOINT;
};

const PREVIEW_GOV_EMAIL = "preview@government.user";

export default function Sidebar({
  isOpen,
  isAdmin = false,
  cityLeadCityIds = [],
  governmentVerified = false,
  governmentEmail = null,
  onNewChat,
  onSearchCities,
  onOpenSettings,
  onViewChange,
  onSessionClick,
  onJobSessionClick,
  currentSessionId,
  isCurrentSessionJobSession = false,
  onSessionDeleted,
  onClose,
  onCityClick,
  onDistrictClick,
  activeCityId,
  activeDistrict,
  userPlaces = [],
  activePlaceId,
  onPlaceClick,
  onResearchClick,
  currentResearchId,
  onResearchDeleted,
  onCitySelect,
  onGPSLocation,
  onPlaceSaved,
  onPlaceRenamed,
  onPlaceDeleted,
  onDistrictRemoved,
  onMenuToggle,
  currentView,
  sidebarWidth,
  onWidthChange,
  chatEnabled = false,
  activeCityName,
  onQuestionClick,
  inboxUnreadCount = 0,
}: SidebarProps) {
  const governmentApproved =
    governmentVerified &&
    !!governmentEmail &&
    governmentEmail.toLowerCase() !== PREVIEW_GOV_EMAIL;
  const [recentChatsExpanded, setRecentChatsExpanded] = useState(false);
  const [researchExpanded, setResearchExpanded] = useState(false);
  const [jobSessionsExpanded, setJobSessionsExpanded] = useState(false);

  // Auto-expand Job Sessions section when viewing a job session
  useEffect(() => {
    if (isCurrentSessionJobSession) {
      setJobSessionsExpanded(true);
    }
  }, [isCurrentSessionJobSession]);

  useEffect(() => {
    if (currentView === "research" || currentView === "research-new") {
      setResearchExpanded(true);
    }
  }, [currentView]);
  
  // Generate unique IDs for logo masks
  const baseId = useId();
  const logoMaskIdBl = `${baseId}-logo-mask-bl`;
  const logoMaskIdTr = `${baseId}-logo-mask-tr`;

  const pathname = usePathname();

  // --- Resizable sidebar drag logic ---
  const isResizing = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onWidthChange) return;
      e.preventDefault();
      isResizing.current = true;
      setIsDragging(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.documentElement.classList.add("sidebar-resizing");

      const onMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        // Clamp between 200 and 600px
        const newWidth = Math.min(600, Math.max(200, ev.clientX));
        onWidthChange(newWidth);
      };

      const onMouseUp = () => {
        isResizing.current = false;
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.documentElement.classList.remove("sidebar-resizing");
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [onWidthChange]
  );

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (!isOpen || !isNarrowScreen()) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Research reports in nav: government-verified users or platform admins
  const canAccessResearch = governmentVerified || isAdmin;

  // Helper to close sidebar in narrow mode after action
  const handleActionWithClose = (action: () => void) => {
    action();
    // Auto-close sidebar in narrow mode after selection
    if (isNarrowScreen() && onClose) {
      onClose();
    }
  };

  return (
    <>
      <aside
        className={`${styles.sidebar} ${isOpen ? styles.open : styles.collapsed}`}
        id="sidebar"
        aria-label="Sidebar navigation"
        style={{
          ...(sidebarWidth && isOpen ? { width: sidebarWidth } : {}),
          ...(isDragging ? { transition: "none" } : {}),
        }}
      >
        {/* Resize handle on right edge */}
        {isOpen && onWidthChange && (
          <div
            className={styles.resizeHandle}
            onMouseDown={handleResizeMouseDown}
          />
        )}
        {/* Integrated Header with Logo and Hamburger */}
        <div className={styles.sidebarHeader}>
          <button 
            className={styles.menuToggle} 
            onClick={onMenuToggle || onClose}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          {isOpen && (
            <Link
              href="/home"
              className={styles.sidebarLogo}
              aria-label="Transparent.city home"
            >
              <div className={styles.logoCorners}>
                <svg
                  viewBox="0 0 100 100"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ overflow: "visible" }}
                >
                  <defs>
                    <mask
                      id={logoMaskIdBl}
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      maskUnits="userSpaceOnUse"
                      maskContentUnits="userSpaceOnUse"
                    >
                      <rect
                        x="-400"
                        y="-400"
                        width="1200"
                        height="1200"
                        fill="white"
                      />
                      <rect
                        x="8.333"
                        y="8.333"
                        width="83.333"
                        height="83.333"
                        rx="3"
                        ry="3"
                        fill="black"
                      />
                      <rect
                        x="16.666"
                        y="-33.333"
                        width="66.666"
                        height="166.666"
                        fill="black"
                        transform="rotate(-45 50 50)"
                      />
                      <rect
                        x="50"
                        y="-400"
                        width="1200"
                        height="1200"
                        fill="black"
                        transform="rotate(-45 50 50)"
                      />
                    </mask>
                    <mask
                      id={logoMaskIdTr}
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      maskUnits="userSpaceOnUse"
                      maskContentUnits="userSpaceOnUse"
                    >
                      <rect
                        x="-400"
                        y="-400"
                        width="1200"
                        height="1200"
                        fill="white"
                      />
                      <rect
                        x="8.333"
                        y="8.333"
                        width="83.333"
                        height="83.333"
                        rx="3"
                        ry="3"
                        fill="black"
                      />
                      <rect
                        x="16.666"
                        y="-33.333"
                        width="66.666"
                        height="166.666"
                        fill="black"
                        transform="rotate(-45 50 50)"
                      />
                      <rect
                        x="-1150"
                        y="-400"
                        width="1200"
                        height="1200"
                        fill="black"
                        transform="rotate(-45 50 50)"
                      />
                    </mask>
                  </defs>
                  <rect
                    className={styles.brace}
                    x="0"
                    y="0"
                    width="100"
                    height="100"
                    rx="3"
                    ry="3"
                    mask={`url(#${logoMaskIdBl})`}
                  />
                  <rect
                    className={styles.brace}
                    x="0"
                    y="0"
                    width="100"
                    height="100"
                    rx="3"
                    ry="3"
                    mask={`url(#${logoMaskIdTr})`}
                  />
                  {governmentVerified && (
                    <text
                      x="50"
                      y="50"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className={
                        governmentApproved
                          ? styles.logoGovGApproved
                          : styles.logoGovG
                      }
                      style={{ fontSize: 28, fontFamily: "inherit", fontWeight: 600 }}
                    >
                      g
                    </text>
                  )}
                </svg>
              </div>
              <span className={styles.logoText}>
                <span className={styles.logoTransparent}>transparent</span>
                <span className={styles.logoCity}>.city</span>
              </span>
            </Link>
          )}
        </div>
        
        <div className={styles.navItems} id="nav-items">
          {/* Feed - always at top */}
          <button
            className={`${styles.navItem} ${styles.newChatBtn} ${currentView === "feed" ? styles.navItemActive : ""}`}
            id="feed-btn"
            onClick={() =>
              handleActionWithClose(() => {
                if (onViewChange) {
                  onViewChange("feed");
                }
              })
            }
          >
            <span className={styles.navIcon}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"></path>
                <path d="M18 14h-8"></path>
                <path d="M15 18h-5"></path>
                <path d="M10 6h8v4h-8V6Z"></path>
              </svg>
            </span>
            <span>Feed</span>
          </button>

          {/* Inbox */}
          <button
            className={`${styles.navItem} ${styles.newChatBtn} ${currentView === "inbox" ? styles.navItemActive : ""}`}
            id="inbox-btn"
            aria-label={inboxUnreadCount > 0 ? `Inbox, ${inboxUnreadCount} unread` : "Inbox"}
            aria-current={currentView === "inbox" ? "page" : undefined}
            onClick={() =>
              handleActionWithClose(() => {
                if (onViewChange) {
                  onViewChange("inbox");
                }
              })
            }
          >
            <span className={styles.navInboxIconWrapper}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
              {inboxUnreadCount > 0 && (
                <span className={styles.navInboxUnreadDot} aria-hidden="true" />
              )}
            </span>
            <span>Inbox</span>
          </button>

          {/* Chat-enabled items (admin mode) */}
          {chatEnabled && (
            <button
              className={`${styles.navItem} ${styles.newChatBtn}`}
              id="new-chat-btn"
              onClick={() => handleActionWithClose(onNewChat)}
            >
              <span className={styles.navIcon}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </span>
              <span>New Chat</span>
            </button>
          )}

          {/* City Search */}
          {onCitySelect && (
            <SidebarCitySearch
              onCitySelect={(cityId, opts) => {
                onCitySelect(cityId, opts);
                if (isNarrowScreen() && onClose) {
                  onClose();
                }
              }}
              onGPSLocation={onGPSLocation}
              onPlaceSaved={onPlaceSaved}
            />
          )}

          {/* My Places Section - collapsed by default for normal users */}
          <MyCities
            defaultExpanded
            onCityClick={(cityId) => {
              if (onCityClick) {
                onCityClick(cityId);
              }
              if (onViewChange) {
                onViewChange("city");
              }
              if (isNarrowScreen() && onClose) {
                onClose();
              }
            }}
            onDistrictClick={(cityId, district) => {
              if (onDistrictClick) {
                onDistrictClick(cityId, Number(district));
              }
              if (onViewChange) {
                onViewChange("city");
              }
              if (isNarrowScreen() && onClose) {
                onClose();
              }
            }}
            userPlaces={userPlaces}
            activePlaceId={activePlaceId}
            onPlaceClick={(cityId, placeId) => {
              if (onPlaceClick) {
                onPlaceClick(cityId, placeId);
              }
              if (onViewChange) {
                onViewChange("city");
              }
              if (isNarrowScreen() && onClose) {
                onClose();
              }
            }}
            onPlaceRenamed={onPlaceRenamed}
            onPlaceDeleted={onPlaceDeleted}
            onDistrictRemoved={onDistrictRemoved}
            activeCityId={activeCityId}
            activeDistrict={activeDistrict != null ? String(activeDistrict) : undefined}
          />

          {/* Research reports — government-verified or admin */}
          {canAccessResearch && onResearchClick && (
            <>
              <div className={styles.navSectionSpacer} />
              <div id="research-reports-section">
                <div
                  id="research-reports-header"
                  className={`${styles.navSectionHeader} ${styles.navSectionCollapsible}`}
                  onClick={() => setResearchExpanded(!researchExpanded)}
                >
                  <span>Research reports</span>
                  <span
                    id="research-reports-chevron"
                    className={styles.navSectionChevron}
                  >
                    {researchExpanded ? "▼" : "▶"}
                  </span>
                </div>
                {researchExpanded && (
                  <div id="research-report-list">
                    <ResearchList
                      isAdmin={isAdmin}
                      onResearchClick={(reportId) => {
                        onResearchClick(reportId);
                        if (isNarrowScreen() && onClose) {
                          onClose();
                        }
                      }}
                      currentResearchId={currentResearchId}
                      onResearchDeleted={onResearchDeleted}
                      onCreateNew={
                        chatEnabled && isAdmin && onViewChange
                          ? () =>
                              handleActionWithClose(() =>
                                onViewChange("research-new")
                              )
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Recent Chats Section - only when chat enabled */}
          {chatEnabled && (
            <div id="recent-chats-section">
              <div
                className={`${styles.navSectionHeader} ${styles.navSectionCollapsible}` }
                id="recent-chats-header"
                onClick={() => setRecentChatsExpanded(!recentChatsExpanded)}
              >
                <span>Recent Chats</span>
                <span
                  id="recent-chats-chevron"
                  className={styles.navSectionChevron}
                >
                  {recentChatsExpanded ? "▼" : "▶"}
                </span>
              </div>
              {recentChatsExpanded && (
                <div id="session-list">
                  <SessionList
                    onSessionClick={(sessionId) => {
                      if (onSessionClick) {
                        onSessionClick(sessionId);
                      }
                      if (onViewChange) {
                        onViewChange("chat");
                      }
                      if (isNarrowScreen() && onClose) {
                        onClose();
                      }
                    }}
                    currentSessionId={currentSessionId}
                    isCurrentSessionJobSession={isCurrentSessionJobSession}
                    onSessionDeleted={onSessionDeleted}
                  />
                </div>
              )}
            </div>
          )}

          {/* Job Sessions Section (Admin Only, chat mode) */}
          {chatEnabled && isAdmin && (
            <>
              <div className={styles.navSectionSpacer} />
              <div
                id="job-sessions-section"
                className={styles.jobSessionsSection}
              >
              <div
                id="job-sessions-header"
                className={`${styles.navSectionHeader} ${styles.navSectionCollapsible}` }
                onClick={() => setJobSessionsExpanded(!jobSessionsExpanded)}
              >
                <span>Job Sessions</span>
                <span
                  id="job-sessions-chevron"
                  className={styles.navSectionChevron}
                >
                  {jobSessionsExpanded ? "▼" : "▶"}
                </span>
              </div>
              {jobSessionsExpanded && (
                <div id="job-session-list" style={{ display: "block" }}>
                  <JobSessionList
                    onSessionClick={(sessionId) => {
                      if (onJobSessionClick) {
                        onJobSessionClick(sessionId);
                      } else if (onSessionClick) {
                        // Fallback to regular handler if job handler not provided
                        onSessionClick(sessionId);
                      }
                      if (onViewChange) {
                        onViewChange("chat");
                      }
                      // Auto-close sidebar in narrow mode after session selection
                      if (isNarrowScreen() && onClose) {
                        onClose();
                      }
                    }}
                    currentSessionId={currentSessionId}
                    onSessionDeleted={onSessionDeleted}
                  />
                </div>
              )}
              </div>
            </>
          )}

        </div>

        {/* Sidebar Footer */}
        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarFooterContent}>
            <UserProfile 
              isAdmin={isAdmin}
              cityLeadCityIds={cityLeadCityIds}
              onViewChange={(view) => {
                if (onViewChange) {
                  onViewChange(view);
                }
                // Auto-close sidebar in narrow mode after view change
                if (isNarrowScreen() && onClose) {
                  onClose();
                }
              }} 
            />
            <button
              className={styles.settingsIconBtn}
              id="settings-icon-btn"
              title="Settings"
              onClick={() => {
                if (onOpenSettings) {
                  handleActionWithClose(onOpenSettings);
                }
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: "grayscale(100%)" }}
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
        </div>
      </aside>
      {/* Sidebar Overlay (Mobile) */}
      {isOpen && (
        <div
          className={styles.overlay}
          id="sidebar-overlay"
          onClick={() => {
            if (onClose) {
              onClose();
            }
          }}
          onTouchMove={(e) => e.preventDefault()}
        />
      )}
    </>
  );
}

