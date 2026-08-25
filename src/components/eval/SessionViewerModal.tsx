"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { getSession, SessionDetail } from "@/lib/apiClient";
import Loader from "@/components/Loader";
import styles from "./SessionViewerModal.module.css";

interface Props {
  sessionId: string;
  label?: string;
  onClose: () => void;
}

type Tab = "messages" | "tools";

function RoleTag({ role }: { role: string }) {
  const colors: Record<string, string> = {
    system: "#7c5fbd",
    user: "#1a7fbf",
    assistant: "#167a5c",
  };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 4,
        background: colors[role] ?? "#555",
        color: "#fff",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      {role}
    </span>
  );
}

function MessageBlock({ msg, index }: { msg: any; index: number }) {
  const role: string =
    typeof msg === "object" && msg ? (msg.role ?? "unknown") : "unknown";
  const content: string =
    typeof msg === "object" && msg
      ? typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content, null, 2)
      : String(msg);

  const isLong = content.length > 1200;
  const [expanded, setExpanded] = useState(role !== "system");

  return (
    <div className={styles.messageBlock} data-role={role}>
      <div className={styles.messageHeader}>
        <RoleTag role={role} />
        <span className={styles.messageIndex}>#{index + 1}</span>
        {isLong && (
          <button
            className={styles.toggleBtn}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Collapse" : `Expand (${content.length.toLocaleString()} chars)`}
          </button>
        )}
      </div>
      {expanded && (
        <pre className={styles.messageContent}>{content}</pre>
      )}
      {!expanded && !isLong && (
        <pre className={styles.messageContent}>{content}</pre>
      )}
      {!expanded && isLong && (
        <pre className={styles.messageContent}>
          {content.slice(0, 300)}
          <span className={styles.ellipsis}>… ({content.length.toLocaleString()} chars — click Expand)</span>
        </pre>
      )}
    </div>
  );
}

function ToolCallBlock({ tc, index }: { tc: any; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const name = tc.tool_name || tc.name || "?";
  const args = tc.arguments || tc.input || {};
  const result = tc.result;
  const success = tc.success !== false;
  const execMs = tc.execution_time_ms ?? (
    tc.end_time && tc.start_time
      ? Math.round((tc.end_time - tc.start_time) * 1000)
      : null
  );

  return (
    <div className={`${styles.toolBlock} ${success ? "" : styles.toolBlockFailed}`}>
      <div className={styles.toolHeader}>
        <span className={styles.toolName}>{name}</span>
        {!success && <span className={styles.toolFailed}>FAILED</span>}
        {execMs !== null && <span className={styles.toolMs}>{execMs}ms</span>}
        <button className={styles.toggleBtn} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide" : "Show"}
        </button>
      </div>
      {expanded && (
        <div className={styles.toolBody}>
          <div className={styles.toolSection}>
            <span className={styles.toolSectionLabel}>Args</span>
            <pre className={styles.toolPre}>
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          <div className={styles.toolSection}>
            <span className={styles.toolSectionLabel}>Result</span>
            <pre className={styles.toolPre}>
              {typeof result === "string"
                ? result.slice(0, 4000)
                : JSON.stringify(result, null, 2)?.slice(0, 4000)}
              {String(result ?? "").length > 4000 && (
                <span className={styles.ellipsis}>… (truncated)</span>
              )}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SessionViewerModal({ sessionId, label = "Session", onClose }: Props) {
  const { getAccessTokenSilently } = useAuth0();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("messages");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();
      const data = await getSession(sessionId, token);
      setSession(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId, getAccessTokenSilently]);

  useEffect(() => {
    void load();
  }, [load]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const messages: any[] = session?.messages ?? [];
  const toolCalls: any[] = session?.tool_calls ?? [];
  const hasTools = toolCalls.length > 0;

  const costStr = session?.estimated_cost_usd != null
    ? `$${session.estimated_cost_usd.toFixed(4)}`
    : null;
  const promptTok = session?.total_prompt_tokens;
  const completionTok = session?.total_completion_tokens;

  const modal = (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerLabel}>{label}</span>
            {session?.title && (
              <span className={styles.headerTitle}>{session.title}</span>
            )}
            {session?.model_key && (
              <span className={styles.headerMeta}>{session.model_key}</span>
            )}
            {costStr && (
              <span className={styles.headerMeta}>{costStr}</span>
            )}
            {promptTok != null && (
              <span className={styles.headerMeta}>
                {promptTok.toLocaleString()} in / {completionTok?.toLocaleString() ?? "?"} out
              </span>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close session viewer">
            ✕
          </button>
        </div>

        {/* Tabs (only show if session has tool calls) */}
        {hasTools && !loading && !error && (
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${tab === "messages" ? styles.tabActive : ""}`}
              onClick={() => setTab("messages")}
            >
              Messages ({messages.length})
            </button>
            <button
              className={`${styles.tab} ${tab === "tools" ? styles.tabActive : ""}`}
              onClick={() => setTab("tools")}
            >
              Tool Calls ({toolCalls.length})
            </button>
          </div>
        )}

        {/* Body */}
        <div className={styles.body}>
          {loading && (
            <div className={styles.centered}>
              <Loader size="md" color="dark" />
              <p className={styles.loadingText}>Loading session…</p>
            </div>
          )}
          {error && (
            <div className={styles.centered}>
              <p className={styles.errorText}>{error}</p>
              <button className={styles.retryBtn} onClick={() => void load()}>Retry</button>
            </div>
          )}
          {!loading && !error && session && (
            <>
              {tab === "messages" && (
                <div className={styles.messages}>
                  {messages.length === 0 ? (
                    <p className={styles.emptyText}>No messages stored for this session.</p>
                  ) : (
                    messages.map((msg, i) => (
                      <MessageBlock key={i} msg={msg} index={i} />
                    ))
                  )}
                </div>
              )}
              {tab === "tools" && (
                <div className={styles.tools}>
                  {toolCalls.length === 0 ? (
                    <p className={styles.emptyText}>No tool calls stored.</p>
                  ) : (
                    toolCalls.map((tc, i) => (
                      <ToolCallBlock key={i} tc={tc} index={i} />
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
