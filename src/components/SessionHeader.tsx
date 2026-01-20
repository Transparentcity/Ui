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

function getModelDisplayName(modelKey: string): string {
  const modelMap: Record<string, string> = {
    // Claude (latest + one older)
    "claude-haiku-4.5": "Claude Haiku 4.5",
    "claude-sonnet-4.5": "Claude Sonnet 4.5",
    "claude-opus-4.5": "Claude Opus 4.5",
    "claude-haiku-4": "Claude Haiku 4",
    "claude-sonnet-4": "Claude Sonnet 4",
    "claude-opus-4.1": "Claude Opus 4.1",

    // Gemini (latest + one older)
    "gemini-3-pro": "Gemini 3 Pro",
    "gemini-3-flash": "Gemini 3 Flash",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash": "Gemini 2.5 Flash",

    // Grok (latest + one older)
    "grok-4": "Grok 4",
    "grok-3": "Grok 3",

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
  const cost = stats?.estimated_cost_usd ?? 0;

  // Log stats for debugging
  if (stats && (stats.total_tokens_used > 0 || stats.llm_call_count > 0)) {
    console.log("📊 SessionHeader with real stats:", {
      tokens: stats.total_tokens_used,
      calls: stats.llm_call_count,
      time: stats.total_execution_time_ms,
      cost: stats.estimated_cost_usd,
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
        <span className={styles.statLabel}>Cost:</span>
        <span className={styles.statValue}>{formatCost(cost)}</span>
      </div>
    </div>
  );
}

