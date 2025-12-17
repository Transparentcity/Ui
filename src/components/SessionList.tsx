"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";

interface Session {
  session_id: string;
  title: string;
  model_key?: string;
  message_count: number;
  last_message_at?: string;
  created_at: string;
  is_active: boolean;
}

interface SessionListProps {
  onSessionClick: (sessionId: string) => void;
  currentSessionId?: string | null;
  onSessionDeleted?: (sessionId: string) => void;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

export default function SessionList({
  onSessionClick,
  currentSessionId,
  onSessionDeleted,
}: SessionListProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getAccessTokenSilently();
      const response = await fetch(`${API_BASE}/api/chat/sessions?limit=20&offset=0`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load sessions");
      }

      const data = await response.json();
      setSessions(data);
    } catch (err) {
      console.error("Error loading sessions:", err);
      setError("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [getAccessTokenSilently]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Close if clicking outside any menu or menu button
      if (
        !target.closest(".session-menu") &&
        !target.closest(".session-menu-btn")
      ) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [openMenuId]);

  const handleSessionClick = (sessionId: string) => {
    if (sessionId === currentSessionId) {
      return; // Don't reload the same session
    }
    setOpenMenuId(null); // Close menu when clicking session
    onSessionClick(sessionId);
  };

  const toggleSessionMenu = (event: React.MouseEvent, sessionId: string) => {
    event.stopPropagation();
    setOpenMenuId(openMenuId === sessionId ? null : sessionId);
  };

  const deleteSession = async (event: React.MouseEvent, sessionId: string) => {
    event.stopPropagation();

    if (!confirm("Are you sure you want to delete this chat?")) {
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete session");
      }

      // Remove from local state
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      setOpenMenuId(null);

      // Notify parent component
      if (onSessionDeleted) {
        onSessionDeleted(sessionId);
      }
    } catch (err) {
      console.error("Error deleting session:", err);
      alert("Failed to delete chat. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="session-empty-state">
        <div style={{ textAlign: "center", padding: "12px", color: "var(--text-secondary)" }}>
          Loading sessions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="session-empty-state">
        <div style={{ textAlign: "center", padding: "12px", color: "var(--error)" }}>
          {error}
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="session-empty-state">
        <div style={{ padding: "12px 20px", color: "var(--text-secondary)", fontSize: "13px", textAlign: "center" }}>
          No previous chats
        </div>
      </div>
    );
  }

  return (
    <div ref={menuRef}>
      {sessions.map((session) => (
        <div
          key={session.session_id}
          className={`session-item ${
            session.session_id === currentSessionId ? "active" : ""
          }`}
        >
          <div
            className="session-content"
            data-session-id={session.session_id}
            onClick={() => handleSessionClick(session.session_id)}
          >
            <div className="session-title">
              {session.title || "New Chat"}
            </div>
          </div>
          <button
            className="session-menu-btn"
            onClick={(e) => toggleSessionMenu(e, session.session_id)}
            title="Options"
          >
            ⋮
          </button>
          <div
            className={`session-menu ${
              openMenuId === session.session_id ? "show" : ""
            }`}
            id={`menu-${session.session_id}`}
          >
            <div
              className="session-menu-item delete"
              onClick={(e) => deleteSession(e, session.session_id)}
            >
              🗑️ Delete
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

