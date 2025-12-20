"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Loader from "./Loader";
import styles from "./SidebarLists.module.css";

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

import { API_BASE } from "@/lib/apiBase";

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
  const rootRef = useRef<HTMLDivElement>(null);

  const isLoadingSessionsRef = useRef(false);
  const sessionsLoadedRef = useRef(false);

  const loadSessions = async () => {
    // Prevent duplicate simultaneous requests
    if (isLoadingSessionsRef.current) {
      return;
    }

    isLoadingSessionsRef.current = true;
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
      sessionsLoadedRef.current = true;
    } catch (err) {
      console.error("Error loading sessions:", err);
      setError("Failed to load sessions");
    } finally {
      setLoading(false);
      isLoadingSessionsRef.current = false;
    }
  };

  useEffect(() => {
    // Only load once on mount
    if (!sessionsLoadedRef.current) {
      loadSessions();
    }
    // Remove getAccessTokenSilently from deps to prevent re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  // Allow other parts of the UI (e.g. ChatView) to trigger a sessions refresh
  // when a new session is created or a title is updated.
  useEffect(() => {
    const handler = () => {
      loadSessions();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("chat:sessions:invalidate", handler);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("chat:sessions:invalidate", handler);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If a session becomes active that we haven't loaded yet (common when a new
  // chat session is created), optimistically add it and then refresh the list.
  useEffect(() => {
    if (!currentSessionId) return;

    const exists = sessions.some((s) => s.session_id === currentSessionId);
    if (exists) return;

    const now = new Date().toISOString();
    const placeholder: Session = {
      session_id: currentSessionId,
      title: "New Chat",
      message_count: 0,
      last_message_at: now,
      created_at: now,
      is_active: true,
    };

    setSessions((prev) => [placeholder, ...prev]);
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]); // Intentionally exclude `sessions` to avoid loops

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
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
      <div className={styles.emptyState} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", padding: "12px" }}>
        <Loader size="sm" color="dark" />
        <span style={{ color: "var(--text-secondary)" }}>Loading sessions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.emptyState}>
        <div style={{ textAlign: "center", padding: "12px", color: "var(--error)" }}>
          {error}
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div style={{ padding: "12px 20px", color: "var(--text-secondary)", fontSize: "13px", textAlign: "center" }}>
          No previous chats
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      {sessions.map((session) => (
        <div
          key={session.session_id}
          className={`${styles.item} ${session.session_id === currentSessionId ? styles.itemActive : ""}` }
        >
          <div
            className={styles.content}
            data-session-id={session.session_id}
            onClick={() => handleSessionClick(session.session_id)}
          >
            <div className={styles.title}>
              {session.title || "New Chat"}
            </div>
          </div>
          <button
            className={styles.menuBtn}
            onClick={(e) => toggleSessionMenu(e, session.session_id)}
            title="Options"
          >
            ⋮
          </button>
          <div
            className={`${styles.menu} ${openMenuId === session.session_id ? styles.menuShow : ""}` }
            id={`menu-${session.session_id}`}
          >
            <div
              className={`${styles.menuItem} ${styles.menuItemDelete}` }
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

