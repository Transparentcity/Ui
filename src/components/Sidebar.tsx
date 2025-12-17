"use client";

import { useState } from "react";
import UserProfile from "./UserProfile";
import SessionList from "./SessionList";
import JobSessionList from "./JobSessionList";
import MyCities from "./MyCities";
import CityTypeahead from "./CityTypeahead";

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

  return (
    <>
      <aside className={`sidebar ${isOpen ? "open" : "collapsed"}`} id="sidebar">
        <div className="nav-items" id="nav-items">
          {/* Top Navigation Items */}
          <button className="nav-item new-chat-btn" id="new-chat-btn" onClick={onNewChat}>
            <span className="nav-icon">
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

          <div className="nav-item-search-wrapper">
            <CityTypeahead
              onCitySelect={(cityId) => {
                if (onCityClick) {
                  onCityClick(cityId);
                }
                if (onViewChange) {
                  onViewChange("city");
                }
              }}
              placeholder="Search cities..."
              className="sidebar-city-typeahead"
              activeCityId={activeCityId}
            />
          </div>

          {/* Spacing */}
          <div className="nav-section-spacer"></div>

          {/* My Cities Section */}
          <MyCities
            onCityClick={(cityId) => {
              if (onCityClick) {
                onCityClick(cityId);
              }
              if (onViewChange) {
                onViewChange("city");
              }
            }}
            activeCityId={activeCityId}
          />

          {/* Spacing */}
          <div className="nav-section-spacer"></div>

          {/* Recent Chats Section */}
          <div id="recent-chats-section">
            <div
              className="nav-section-header nav-section-collapsible"
              id="recent-chats-header"
              onClick={() => setRecentChatsExpanded(!recentChatsExpanded)}
            >
              <span>Recent Chats</span>
              <span
                id="recent-chats-chevron"
                className="nav-section-chevron"
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
              style={{
                display: "block",
                borderTop: "1px solid var(--border-primary)",
                marginTop: "8px",
              }}
            >
              <div
                id="job-sessions-header"
                className="nav-section-header nav-section-collapsible"
                onClick={() => setJobSessionsExpanded(!jobSessionsExpanded)}
              >
                <span>Job Sessions</span>
                <span
                  id="job-sessions-chevron"
                  className="nav-section-chevron"
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
        <div className="sidebar-footer">
          <div className="sidebar-footer-content">
            <UserProfile isAdmin={isAdmin} onViewChange={onViewChange} />
            <button
              className="settings-icon-btn"
              id="settings-icon-btn"
              title="Settings"
              onClick={() => onOpenSettings?.()}
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
          className="sidebar-overlay"
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

