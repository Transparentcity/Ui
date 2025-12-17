"use client";

import { useState } from "react";

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

  const toolId = toolCall.tool_id || `tool-${Date.now()}`;
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
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  return (
    <div
      id={toolId}
      className={`tool-call ${statusClass}`}
      data-tool-name={toolName}
    >
      <div
        className="tool-call-content"
        onClick={() => setShowDetails(!showDetails)}
        style={{ cursor: "pointer" }}
      >
        <div className="tool-call-name">🔧 {toolName}</div>
      </div>
      {showDetails && (
        <div className="tool-call-details show">
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

