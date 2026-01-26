"use client";

import { useState, useEffect, useId } from "react";
import Link from "next/link";
import UserProfile from "./UserProfile";
import SessionList from "./SessionList";
import JobSessionList from "./JobSessionList";
import MyCities from "./MyCities";
import ResearchList from "./ResearchList";
import SidebarCitySearch from "./SidebarCitySearch";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  isOpen: boolean;
  isAdmin?: boolean;
  cityLeadCityIds?: number[];
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
  activeCityId?: number | null;
  onResearchClick?: (reportId: number) => void;
  currentResearchId?: number | null;
  onResearchDeleted?: (reportId: number) => void;
  onCitySelect?: (cityId: number) => void;
  onGPSLocation?: (location: { lat: number; lng: number } | null) => void;
  onMenuToggle?: () => void;
}

// Mobile breakpoint (matches CSS media query)
const MOBILE_BREAKPOINT = 768;

// Helper function to check if screen is narrow (mobile)
const isNarrowScreen = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= MOBILE_BREAKPOINT;
};

export default function Sidebar({
  isOpen,
  isAdmin = false,
  cityLeadCityIds = [],
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
  activeCityId,
  onResearchClick,
  currentResearchId,
  onResearchDeleted,
  onCitySelect,
  onGPSLocation,
  onMenuToggle,
}: SidebarProps) {
  const [recentChatsExpanded, setRecentChatsExpanded] = useState(true);
  const [researchExpanded, setResearchExpanded] = useState(false);
  const [jobSessionsExpanded, setJobSessionsExpanded] = useState(false);
  
  // Generate unique IDs for logo masks
  const baseId = useId();
  const logoMaskIdBl = `${baseId}-logo-mask-bl`;
  const logoMaskIdTr = `${baseId}-logo-mask-tr`;

  // Research and New Research Report: admin only
  const canAccessResearch = isAdmin;

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
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : styles.collapsed}`} id="sidebar">
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
              href="/dashboard"
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
                    transform="translate(23.5%, -23.5%)"
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
                    transform="translate(-23.5%, 23.5%)"
                  />
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
          {/* Top Navigation Items */}
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

          {canAccessResearch && (
            <button
              className={`${styles.navItem} ${styles.newChatBtn}`}
              id="new-research-report-btn"
              onClick={() =>
                handleActionWithClose(() => {
                  if (onViewChange) {
                    onViewChange("research-new");
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
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="12" y1="12" x2="12" y2="18"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
              </span>
              <span>New Research Report</span>
            </button>
          )}

          <button
            className={`${styles.navItem} ${styles.newChatBtn}`}
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
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </span>
            <span>Feed</span>
          </button>

          {/* City Search */}
          {onCitySelect && (
            <SidebarCitySearch
              onCitySelect={(cityId) => {
                onCitySelect(cityId);
                // Auto-close sidebar in narrow mode after city selection
                if (isNarrowScreen() && onClose) {
                  onClose();
                }
              }}
              onGPSLocation={onGPSLocation}
            />
          )}

          {/* Spacing */}
          <div className={styles.navSectionSpacer}></div>

          {/* My Cities Section */}
          <MyCities
            onCityClick={(cityId) => {
              if (onCityClick) {
                onCityClick(cityId);
              }
              if (onViewChange) {
                onViewChange("city");
              }
              // Auto-close sidebar in narrow mode after city selection
              if (isNarrowScreen() && onClose) {
                onClose();
              }
            }}
            activeCityId={activeCityId}
          />

          {/* Spacing */}
          <div className={styles.navSectionSpacer}></div>

          {/* Research Section - Admin only */}
          {canAccessResearch && (
            <>
              <div id="research-section">
                <div
                  className={`${styles.navSectionHeader} ${styles.navSectionCollapsible}`}
                  id="research-header"
                  onClick={() => setResearchExpanded(!researchExpanded)}
                >
                  <span>Research</span>
                  <span
                    id="research-chevron"
                    className={styles.navSectionChevron}
                  >
                    {researchExpanded ? "▼" : "▶"}
                  </span>
                </div>
                {researchExpanded && (
                  <div id="research-list">
                    <ResearchList
                      isAdmin={isAdmin}
                      onResearchClick={(reportId) => {
                        if (onResearchClick) {
                          onResearchClick(reportId);
                        }
                        if (onViewChange) {
                          onViewChange("research");
                        }
                        // Auto-close sidebar in narrow mode after research selection
                        if (isNarrowScreen() && onClose) {
                          onClose();
                        }
                      }}
                      currentResearchId={currentResearchId}
                      onResearchDeleted={onResearchDeleted}
                      onCreateNew={() => {
                        if (onViewChange) {
                          onViewChange("research-new");
                        }
                        // Auto-close sidebar in narrow mode after action
                        if (isNarrowScreen() && onClose) {
                          onClose();
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Spacing */}
              <div className={styles.navSectionSpacer}></div>
            </>
          )}

          {/* Recent Chats Section */}
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
                    // Auto-close sidebar in narrow mode after session selection
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

          {/* Job Sessions Section (Admin Only) */}
          {isAdmin && (
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
        />
      )}
    </>
  );
}

