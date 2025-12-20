"use client";

import { useId, useState } from "react";

import styles from "./ToolCall.module.css";

interface ToolCallProps {
  toolCall: {
    tool_id?: string;
    tool_name?: string;
    toolName?: string;
    arguments?: any;
    args?: any;
    input?: any;
    parameters?: any;
    response?: any;
    result?: any;
    output?: any;
    success?: boolean;
  };
}

export default function ToolCall({ toolCall }: ToolCallProps) {
  const [showDetails, setShowDetails] = useState(false);
  const fallbackId = useId();

  const toolId = toolCall.tool_id || `tool-${fallbackId}`;
  const toolName = toolCall.tool_name || toolCall.toolName || "Tool Call";
  const success = toolCall.success !== false;
  const statusClass = success ? "completed" : "error";
  const statusText = success ? "✅ Success" : "❌ Failed";

  const args =
    toolCall.arguments ||
    toolCall.args ||
    toolCall.input ||
    toolCall.parameters;
  const response =
    toolCall.response || toolCall.result || toolCall.output;

  const formatJSON = (data: any): string => {
    if (data === null || data === undefined) return "";
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const escapeHtml = (text: string): string => {
    // Safe for SSR - only escape on client
    if (typeof document === "undefined") {
      // Simple server-side escaping
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  return (
    <div
      id={toolId}
      className={`${styles.toolCall} ${success ? styles.completed : styles.error}` }
      data-tool-name={toolName}
    >
      <div
        className={styles.toolCallContent}
        onClick={() => setShowDetails(!showDetails)}
        style={{ cursor: "pointer" }}
      >
        <div className={styles.toolCallName}>🔧 {toolName}</div>
      </div>
      {showDetails && (
        <div className={styles.toolCallDetails}>
          <h4>Tool Call Details</h4>
          <div>
            <strong>Function:</strong> {toolName}
          </div>
          <div>
            <strong>Status:</strong> {success ? "Success" : "Failed"}
          </div>
          {args !== null && args !== undefined && args !== "" && (
            <div style={{ marginTop: "8px" }}>
              <strong>Arguments:</strong>
              <pre
                style={{
                  background: "var(--bg-secondary)",
                  padding: "8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  marginTop: "4px",
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  maxHeight: "400px",
                  overflow: "auto",
                }}
              >
                {formatJSON(args)}
              </pre>
            </div>
          )}
          {response && (
            <div style={{ marginTop: "8px" }}>
              <strong>Response:</strong>
              <pre
                style={{
                  background: "var(--bg-secondary)",
                  padding: "8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  marginTop: "4px",
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  maxHeight: "400px",
                  overflow: "auto",
                }}
              >
                {formatJSON(response)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

