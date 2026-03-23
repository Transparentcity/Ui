"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Loader from "./Loader";
import RenameDialog from "./RenameDialog";
import { updateSessionTitle } from "@/lib/apiClient";
import styles from "./SidebarLists.module.css";

interface Session {
  session_id: string;
  title: string;
  model_key?: string;
  message_count: number;
  last_message_at?: string;
  created_at: string;
  is_active: boolean;
  short_hash?: string;
  is_public?: boolean;
}

interface SessionListProps {
  onSessionClick: (sessionId: string) => void;
  currentSessionId?: string | null;
  isCurrentSessionJobSession?: boolean;
  onSessionDeleted?: (sessionId: string) => void;
}

import { API_BASE } from "@/lib/apiBase";

export default function SessionList({
  onSessionClick,
  currentSessionId,
  isCurrentSessionJobSession = false,
  onSessionDeleted,
}: SessionListProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const isLoadingSessionsRef = useRef(false);
  const sessionsLoadedRef = useRef(false);
  
  // Track optimistically updated titles that should be preserved during refresh
  const optimisticTitlesRef = useRef<Map<string, { title: string; timestamp: number }>>(new Map());

  const loadSessions = async (isInitialLoad: boolean = false) => {
    // Prevent duplicate simultaneous requests
    if (isLoadingSessionsRef.current) {
      return;
    }

    isLoadingSessionsRef.current = true;
    try {
      // Only show loading spinner on initial load, not refreshes
      if (isInitialLoad) {
        setLoading(true);
      }
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

      const data: Session[] = await response.json();
      
      // Merge with optimistic titles - preserve locally updated titles if they're newer
      // This prevents the "flash back to New Chat" issue during race conditions
      const now = Date.now();
      const OPTIMISTIC_TITLE_TTL = 10000; // Keep optimistic titles for 10 seconds
      
      // Clean up old optimistic titles
      for (const [sessionId, entry] of optimisticTitlesRef.current.entries()) {
        if (now - entry.timestamp > OPTIMISTIC_TITLE_TTL) {
          optimisticTitlesRef.current.delete(sessionId);
        }
      }
      
      // Merge: prefer optimistic title if the server returned a generic title
      const mergedData = data.map((session) => {
        const optimistic = optimisticTitlesRef.current.get(session.session_id);
        if (optimistic) {
          // If server has a real title (not "New Chat"), use it and clear the optimistic entry
          const serverHasRealTitle = session.title && 
            session.title !== "New Chat" && 
            session.title !== "New chat";
          
          if (serverHasRealTitle) {
            // Server caught up, remove from optimistic cache
            optimisticTitlesRef.current.delete(session.session_id);
            return session;
          }
          
          // Server still has placeholder, use our optimistic title
          return { ...session, title: optimistic.title };
        }
        return session;
      });
      
      setSessions(mergedData);
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
      loadSessions(true); // Initial load - show spinner
    }
    // Remove getAccessTokenSilently from deps to prevent re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  // Allow other parts of the UI (e.g. ChatView) to trigger a sessions refresh
  // when a new session is created or a title is updated.
  useEffect(() => {
    let refreshTimeout: NodeJS.Timeout | null = null;
    
    const invalidateHandler = () => {
      // Debounce rapid invalidate events (e.g., session creation + title update)
      // If we have pending optimistic titles, use a longer delay to avoid overwriting them
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      
      const hasPendingOptimisticTitles = optimisticTitlesRef.current.size > 0;
      const delay = hasPendingOptimisticTitles ? 2000 : 500;
      
      refreshTimeout = setTimeout(() => {
        loadSessions();
      }, delay);
    };

    // Handle optimistic title updates - update immediately when title is received
    const titleUpdateHandler = (event: Event) => {
      const customEvent = event as CustomEvent<{ session_id: string; title: string }>;
      const { session_id, title } = customEvent.detail;
      
      // Store in optimistic cache so it survives refreshes
      optimisticTitlesRef.current.set(session_id, {
        title,
        timestamp: Date.now(),
      });
      
      // Optimistically update the title in the list immediately
      setSessions((prev) =>
        prev.map((session) =>
          session.session_id === session_id
            ? { ...session, title }
            : session
        )
      );
      
      // Cancel any pending refresh to avoid overwriting too quickly
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      // Schedule a refresh with longer delay to confirm backend persistence
      refreshTimeout = setTimeout(() => {
        loadSessions();
      }, 3000); // Wait 3 seconds for backend to definitely have the title
    };

    if (typeof window !== "undefined") {
      window.addEventListener("chat:sessions:invalidate", invalidateHandler);
      window.addEventListener("chat:session:title-updated", titleUpdateHandler);
    }

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("chat:sessions:invalidate", invalidateHandler);
        window.removeEventListener("chat:session:title-updated", titleUpdateHandler);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If a session becomes active that we haven't loaded yet (common when a new
  // chat session is created), optimistically add it. Don't immediately refresh -
  // wait for the title_update event to avoid race conditions.
  // BUT: Don't add job sessions to recent chats - they belong in the job sessions list.
  useEffect(() => {
    if (!currentSessionId) return;
    
    // Skip optimistic add if this is a job session
    if (isCurrentSessionJobSession) {
      return;
    }

    const exists = sessions.some((s) => s.session_id === currentSessionId);
    if (exists) {
      // Session already exists in the list - no need to add placeholder
      return;
    }

    const now = new Date().toISOString();
    const placeholder: Session = {
      session_id: currentSessionId,
      title: "New Chat",
      message_count: 0,
      last_message_at: now,
      created_at: now,
      is_active: true,
    };

    // Optimistically add placeholder to show the new chat immediately
    // Don't call loadSessions() here - it will race with title generation
    // The title_update event will update the title when it arrives
    setSessions((prev) => [placeholder, ...prev]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId, isCurrentSessionJobSession]); // Intentionally exclude `sessions` to avoid loops

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

  const handleRename = (event: React.MouseEvent, session: Session) => {
    event.stopPropagation();
    setOpenMenuId(null);
    setRenamingSessionId(session.session_id);
  };

  const handleRenameSave = async (newTitle: string) => {
    if (!renamingSessionId) return;

    try {
      const token = await getAccessTokenSilently();
      await updateSessionTitle(renamingSessionId, newTitle, token);

      // Optimistically update the title in the list
      setSessions((prev) =>
        prev.map((session) =>
          session.session_id === renamingSessionId
            ? { ...session, title: newTitle }
            : session
        )
      );

      // Dispatch event for other components (like ChatView) to update
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("chat:session:title-updated", {
            detail: { session_id: renamingSessionId, title: newTitle },
          })
        );
      }

      // Refresh to confirm backend persistence
      setTimeout(() => {
        loadSessions();
      }, 500);
    } catch (err) {
      console.error("Error renaming session:", err);
      throw err; // Let RenameDialog handle the error display
    } finally {
      setRenamingSessionId(null);
    }
  };

  const handleCopyUrl = async (event: React.MouseEvent, session: Session) => {
    event.stopPropagation();
    setOpenMenuId(null);

    try {
      const token = await getAccessTokenSilently();
      
      // If session is not public, make it public first
      if (!session.is_public || !session.short_hash) {
        const toggleResponse = await fetch(`${API_BASE}/api/chat/sessions/${session.session_id}/toggle-public`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ is_public: true }),
        });

        if (!toggleResponse.ok) {
          throw new Error("Failed to make session public");
        }

        const toggleData = await toggleResponse.json();
        const url = toggleData.public_url 
          ? `${window.location.origin}${toggleData.public_url}`
          : `${window.location.origin}/chat/${session.short_hash}`;
        
        await navigator.clipboard.writeText(url);
        alert("Link copied to clipboard!");
        
        // Refresh session list to get updated public status
        loadSessions();
      } else {
        // Session is already public, just copy the URL
        const url = `${window.location.origin}/chat/${session.short_hash}`;
        await navigator.clipboard.writeText(url);
        alert("Link copied to clipboard!");
      }
    } catch (err) {
      console.error("Error copying URL:", err);
      alert("Failed to copy link. Please try again.");
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

  const renamingSession = renamingSessionId
    ? sessions.find((s) => s.session_id === renamingSessionId)
    : null;

  return (
    <>
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
                className={styles.menuItem}
                onClick={(e) => handleRename(e, session)}
              >
                ✏️ Rename
              </div>
              <div
                className={styles.menuItem}
                onClick={(e) => handleCopyUrl(e, session)}
              >
                📋 Copy URL
              </div>
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
      {renamingSession && (
        <RenameDialog
          isOpen={true}
          currentName={renamingSession.title || "New Chat"}
          onClose={() => setRenamingSessionId(null)}
          onSave={handleRenameSave}
          title="Rename Chat"
          maxLength={200}
        />
      )}
    </>
  );
}

