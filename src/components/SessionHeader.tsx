"use client";

import { useCallback, useRef, useState } from "react";
import { SessionStats } from "@/lib/apiClient";
import { formatDuration } from "@/lib/formatDuration";
import { getModelDisplayName } from "@/lib/modelDisplayName";
import { useDismissOnOutsideClick } from "@/lib/hooks/useDismissOnOutsideClick";
import Loader from "./Loader";
import styles from "./SessionHeader.module.css";

interface SessionHeaderProps {
  sessionId: string | null;
  /** Conversation title from the loaded session; falls back to "New conversation". */
  title?: string | null;
  /** True while the session is being fetched; the title stays blank instead of showing the fallback. */
  isLoading?: boolean;
  stats: SessionStats | null;
  model: string;
  /** Public /chat/{hash} path once the conversation has been shared. */
  publicUrl?: string | null;
  /** True while the share request is in flight. */
  isSharing?: boolean;
  copiedLink?: boolean;
  copiedConversation?: boolean;
  /** Transcript text offered for manual copy when the clipboard is blocked. */
  transcriptFallback?: string | null;
  /** Makes the session public (idempotent) and copies its link. */
  onCopyLink?: () => void;
  /** Copies every message as text. */
  onCopyConversation?: () => void;
}

function formatCost(costUsd: number): string {
  if (costUsd === 0) {
    return "$0.00";
  } else if (costUsd < 0.01) {
    return `$${costUsd.toFixed(4)}`;
  } else if (costUsd < 1) {
    return `$${costUsd.toFixed(3)}`;
  } else {
    return `$${costUsd.toFixed(2)}`;
  }
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  } else if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  } else {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }
}

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
    <path d="M16 6l-4-4-4 4" />
    <path d="M12 2v14" />
  </svg>
);

const DotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

/**
 * Thin header above a conversation: Seymour mark, title, share, and an
 * options menu that holds whole-conversation actions and the session's
 * model and usage stats.
 */
export default function SessionHeader({
  sessionId,
  title,
  isLoading = false,
  stats,
  model,
  publicUrl = null,
  isSharing = false,
  copiedLink = false,
  copiedConversation = false,
  transcriptFallback = null,
  onCopyLink,
  onCopyConversation,
}: SessionHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Clicks inside stay open so the clipboard-fallback textarea can be selected.
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismissOnOutsideClick(menuRef, menuOpen, closeMenu);

  const displayTitle = title?.trim() || (isLoading ? "" : "New conversation");
  // The live selection wins; stats can lag behind a mid-session model switch.
  const displayModel = getModelDisplayName(model || stats?.model_key || "");
  const tokens = stats?.total_tokens_used ?? 0;
  const calls = stats?.llm_call_count ?? 0;
  const time = stats?.total_execution_time_ms ?? 0;
  const cost = stats?.estimated_cost_usd ?? 0;
  const canShare = Boolean(sessionId) && !isSharing;
  const publicHref =
    publicUrl && typeof window !== "undefined"
      ? `${window.location.host}${publicUrl}`
      : publicUrl;

  return (
    <div className={styles.sessionHeader} data-testid="session-header">
      <span className={styles.mark} aria-hidden="true">
        <Loader size="sm" color="dark" className="loaderStatic" />
      </span>
      <h2 className={styles.title} title={displayTitle}>
        {displayTitle}
      </h2>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onCopyLink}
          disabled={!canShare}
          aria-label={copiedLink ? "Link copied" : "Copy link to this conversation"}
          title={copiedLink ? "Link copied" : "Copy link to this conversation"}
        >
          {copiedLink ? <CheckIcon /> : <ShareIcon />}
        </button>
        <div className={styles.menuWrapper} ref={menuRef}>
          <button
            type="button"
            className={`${styles.iconButton} ${menuOpen ? styles.iconButtonActive : ""}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Conversation options"
            title="Conversation options"
          >
            <DotsIcon />
          </button>
          {menuOpen && (
            <div className={styles.menu} role="menu" aria-label="Conversation options">
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={onCopyConversation}
              >
                {copiedConversation ? "Conversation copied" : "Copy whole conversation"}
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={onCopyLink}
                disabled={!canShare}
              >
                <span>{copiedLink ? "Link copied" : publicUrl ? "Copy link" : "Get link"}</span>
                {publicHref && <span className={styles.menuItemDetail}>{publicHref}</span>}
              </button>
              {transcriptFallback && (
                <div className={styles.fallback}>
                  Your browser blocked the clipboard. Select the text below and copy it.
                  <textarea
                    className={styles.fallbackText}
                    readOnly
                    value={transcriptFallback}
                    onFocus={(e) => e.currentTarget.select()}
                    rows={6}
                    aria-label="Conversation transcript"
                  />
                </div>
              )}
              <div className={styles.menuSeparator} role="separator" />
              <div className={styles.stats}>
                <div className={styles.statsModel}>{displayModel}</div>
                <div>
                  {formatTokens(tokens)} tokens · {calls} {calls === 1 ? "call" : "calls"} · {formatDuration(time)}
                </div>
                <div>Estimated cost {formatCost(cost)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
