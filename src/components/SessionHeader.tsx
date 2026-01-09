"use client";

import { useEffect } from "react";
import { SessionStats } from "@/lib/apiClient";
import styles from "./SessionHeader.module.css";

interface SessionHeaderProps {
  sessionId: string | null;
  stats: SessionStats | null;
  model: string;
}

function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
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

function getModelDisplayName(modelKey: string): string {
  const modelMap: Record<string, string> = {
    "claude-3-5-sonnet": "Claude 3.5 Sonnet",
    "claude-3-opus": "Claude 3 Opus",
    "claude-3-sonnet": "Claude 3 Sonnet",
    "claude-3-haiku": "Claude 3 Haiku",
    "gpt-4o": "GPT-4o",
    "gpt-4-turbo": "GPT-4 Turbo",
    "gpt-4": "GPT-4",
    "gpt-3.5-turbo": "GPT-3.5 Turbo",
  };
  return modelMap[modelKey] || modelKey;
}

export default function SessionHeader({
  sessionId,
  stats,
  model,
}: SessionHeaderProps) {
  // Always render if we have a sessionId, even if stats are null
  // This prevents the header from disappearing during streaming
  if (!sessionId) {
    console.log("🔍 SessionHeader returning null - no sessionId");
    return null;
  }

  // Use stats if available, otherwise show 0s (for old sessions or during loading)
  // This ensures the header is always visible when there's a session
  const displayModel = getModelDisplayName(model);
  const tokens = stats?.total_tokens_used ?? 0;
  const calls = stats?.llm_call_count ?? 0;
  const time = stats?.total_execution_time_ms ?? 0;

  // Log stats for debugging
  if (stats && (stats.total_tokens_used > 0 || stats.llm_call_count > 0)) {
    console.log("📊 SessionHeader with real stats:", {
      tokens: stats.total_tokens_used,
      calls: stats.llm_call_count,
      time: stats.total_execution_time_ms,
    });
  }

  return (
    <div 
      className={styles.sessionHeader} 
      data-testid="session-header"
    >
      <div className={styles.statItem}>
        <span className={styles.statLabel}>Model:</span>
        <span className={styles.statValue}>{displayModel}</span>
      </div>
      <div className={styles.statItem}>
        <span className={styles.statLabel}>Tokens:</span>
        <span className={styles.statValue}>{formatTokens(tokens)}</span>
      </div>
      <div className={styles.statItem}>
        <span className={styles.statLabel}>Calls:</span>
        <span className={styles.statValue}>{calls}</span>
      </div>
      <div className={styles.statItem}>
        <span className={styles.statLabel}>Time:</span>
        <span className={styles.statValue}>{formatTime(time)}</span>
      </div>
    </div>
  );
}

