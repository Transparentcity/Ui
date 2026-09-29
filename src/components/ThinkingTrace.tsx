"use client";

import { useEffect, useState } from "react";

import styles from "./ThinkingTrace.module.css";

interface ThinkingTraceProps {
  content: string;
  isStreaming?: boolean;
}

export default function ThinkingTrace({
  content,
  isStreaming = false,
}: ThinkingTraceProps) {
  const [open, setOpen] = useState(isStreaming);

  useEffect(() => {
    setOpen(isStreaming);
  }, [isStreaming]);

  const text = content.trim();
  if (!text) return null;

  return (
    <div className={styles.trace}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.chevron} aria-hidden="true">
          {open ? "▼" : "▶"}
        </span>
        <span
          className={`${styles.label} ${isStreaming ? styles.streamingLabel : ""}`}
        >
          {isStreaming ? "Thinking" : "Thought"}
        </span>
      </button>
      {open && <pre className={styles.body}>{text}</pre>}
    </div>
  );
}
