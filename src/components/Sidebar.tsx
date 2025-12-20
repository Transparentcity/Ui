"use client";

import { useState, useEffect } from "react";
import UserProfile from "./UserProfile";
import SessionList from "./SessionList";
import JobSessionList from "./JobSessionList";
import MyCities from "./MyCities";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  isOpen: boolean;
  isAdmin?: boolean;
  onNewChat: () => void;
  onSearchCities?: () => void; // Optional for backward compatibility
  onOpenSettings?: () => void;
  onViewChange?: (view: string) => void;
  onSessionClick?: (sessionId: string) => void;
  currentSessionId?: string | null;
  onSessionDeleted?: (sessionId: string) => void;
  onClose?: () => void;
  onCityClick?: (cityId: number) => void;
  activeCityId?: number | null;
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
  onNewChat,
  onSearchCities,
  onOpenSettings,
  onViewChange,
  onSessionClick,
  currentSessionId,
  onSessionDeleted,
  onClose,
  onCityClick,
  activeCityId,
}: SidebarProps) {
  const [recentChatsExpanded, setRecentChatsExpanded] = useState(true);
  const [jobSessionsExpanded, setJobSessionsExpanded] = useState(false);

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

