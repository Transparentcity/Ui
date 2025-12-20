"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { listJobSessions, deleteSession } from "@/lib/apiClient";
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

interface JobSessionListProps {
  onSessionClick: (sessionId: string) => void;
  currentSessionId?: string | null;
  onSessionDeleted?: (sessionId: string) => void;
}

export default function JobSessionList({
  onSessionClick,
  currentSessionId,
  onSessionDeleted,
}: JobSessionListProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getAccessTokenSilently();
      const data = await listJobSessions(50, 0, token);
      setSessions(data);
    } catch (err) {
      console.error("Error loading job sessions:", err);
      setError("Failed to load job sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [getAccessTokenSilently]);

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

  const deleteSessionHandler = async (
    event: React.MouseEvent,
    sessionId: string
  ) => {
    event.stopPropagation();

    if (!confirm("Are you sure you want to delete this job session?")) {
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      await deleteSession(sessionId, token);

      // Remove from local state
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      setOpenMenuId(null);

      // Notify parent component
      if (onSessionDeleted) {
        onSessionDeleted(sessionId);
      }
    } catch (err) {
      console.error("Error deleting job session:", err);
      alert("Failed to delete job session. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className={styles.emptyState} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", padding: "12px" }}>
        <Loader size="sm" color="dark" />
        <span style={{ color: "var(--text-secondary)" }}>Loading job sessions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.emptyState}>
        <div
          style={{
            textAlign: "center",
            padding: "12px",
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div
          style={{
            padding: "12px 20px",
            color: "var(--text-secondary)",
            fontSize: "13px",
            textAlign: "center",
          }}
        >
          No job sessions
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
              {session.title || "Job Session"}
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
              onClick={(e) => deleteSessionHandler(e, session.session_id)}
            >
              🗑️ Delete
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

