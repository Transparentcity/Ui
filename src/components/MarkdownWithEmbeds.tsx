"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo, useState } from "react";
import Link from "next/link";

interface MarkdownWithEmbedsProps {
  content: string;
}

/**
 * Matches visualization URL patterns: /a/{id}, /t/{id}, /m/{hash}
 * with optional ?embedded=true query param.
 */
const VIZ_URL_REGEX = /\/(a|t|m)\/([a-zA-Z0-9-]+)(?:\?embedded=true)?/;

/**
 * Matches shortcode patterns used in research reports and session output:
 * [anomaly:123], [chart:456], [map:abc123]
 * Session log content often contains these; we replace them with embeds so
 * charts/maps/anomalies render inline instead of as raw text.
 */
const SHORTCODE_REGEX = /\[(anomaly|chart|map):([a-zA-Z0-9-]+)\]/g;

function getEmbedHeight(type: string): string {
  switch (type) {
    case "a": return "400px";
    case "t": return "480px";
    case "m": return "500px";
    default: return "480px";
  }
}

function getEmbedLabel(type: string): string {
  switch (type) {
    case "a": return "Anomaly Chart";
    case "t": return "Time Series";
    case "m": return "Map";
    default: return "Visualization";
  }
}

function getEmbedIcon(type: string): string {
  switch (type) {
    case "a": return "📊";
    case "t": return "📈";
    case "m": return "🗺️";
    default: return "📊";
  }
}

function InlineEmbed({ type, id }: { type: string; id: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const embedUrl = `/${type}/${id}?embedded=true`;
  const viewUrl = `/${type}/${id}`;
  const height = getEmbedHeight(type);
  const label = getEmbedLabel(type);
  const icon = getEmbedIcon(type);

  return (
    <div style={{
      margin: "12px 0",
      borderRadius: "8px",
      overflow: "hidden",
      border: "1px solid var(--border-color, #e5e7eb)",
      background: "var(--bg-primary, #ffffff)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        background: "var(--bg-secondary, #f9fafb)",
        borderBottom: collapsed ? "none" : "1px solid var(--border-color, #e5e7eb)",
        fontSize: "13px",
      }}>
        <span>{icon} {label}</span>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              color: "var(--text-secondary, #6b7280)",
              padding: "2px 4px",
            }}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "▶" : "▼"}
          </button>
          <Link
            href={viewUrl}
            target="_blank"
            style={{
              fontSize: "12px",
              color: "var(--link-color, #3b82f6)",
              textDecoration: "none",
            }}
          >
            Open ↗
          </Link>
        </div>
      </div>
      {!collapsed && (
        <iframe
          src={embedUrl}
          width="100%"
          height={height}
          style={{ border: "none", display: "block" }}
          title={`${label} ${id}`}
          loading="lazy"
        />
      )}
    </div>
  );
}

type Segment =
  | { kind: "text"; content: string }
  | { kind: "embed"; vizType: string; vizId: string };

/**
 * MarkdownWithEmbeds renders markdown content and auto-detects visualization
 * URLs (/a/{id}, /t/{id}, /m/{hash}) in the text, replacing them with
 * inline iframe embeds. When no viz URLs are present, it renders plain
 * ReactMarkdown with zero overhead.
 */
/** Normalize [anomaly:ID], [chart:ID], [map:HASH] shortcodes to URL form so they are picked up by VIZ_URL_REGEX. */
function normalizeShortcodesToUrls(text: string): string {
  return text.replace(
    SHORTCODE_REGEX,
    (_, type: string, id: string) => {
      const prefix = type === "anomaly" ? "a" : type === "chart" ? "t" : "m";
      return `/${prefix}/${id}`;
    }
  );
}

export default function MarkdownWithEmbeds({ content }: MarkdownWithEmbedsProps) {
  const segments = useMemo((): Segment[] => {
    if (!content) return [];

    // So Session log and research-style output show charts: replace shortcodes with URLs first
    const normalized = normalizeShortcodesToUrls(content);
    const lines = normalized.split("\n");
    const result: Segment[] = [];
    let textBuffer: string[] = [];
    const embeddedIds = new Set<string>();

    for (const line of lines) {
      const match = line.match(VIZ_URL_REGEX);
      if (!match) {
        textBuffer.push(line);
        continue;
      }

      const [, vizType, vizId] = match;
      const key = `${vizType}/${vizId}`;

      if (embeddedIds.has(key)) {
        // Already embedded — skip short reference lines, keep content-rich ones
        const stripped = line
          .replace(/\/(a|t|m)\/[a-zA-Z0-9-]+(\?embedded=true)?/g, "")
          .replace(/[():\[\]*_#`]/g, "")
          .trim();
        if (stripped.length >= 60) {
          textBuffer.push(line);
        }
        continue;
      }

      // Determine if the line is primarily a viz-URL reference (short surrounding text)
      // vs. a content-rich paragraph that happens to mention a URL
      const stripped = line
        .replace(/\/(a|t|m)\/[a-zA-Z0-9-]+(\?embedded=true)?/g, "")
        .replace(/[():\[\]*_#`]/g, "")
        .trim();
      const isReferenceLine = stripped.length < 60;

      // Flush accumulated text before the embed
      if (textBuffer.length > 0) {
        const text = textBuffer.join("\n");
        if (text.trim()) result.push({ kind: "text", content: text });
        textBuffer = [];
      }

      if (!isReferenceLine) {
        // Content-rich line — keep the text, then add the embed
        result.push({ kind: "text", content: line });
      }

      result.push({ kind: "embed", vizType, vizId });
      embeddedIds.add(key);
    }

    // Flush remaining text
    if (textBuffer.length > 0) {
      const text = textBuffer.join("\n");
      if (text.trim()) result.push({ kind: "text", content: text });
    }

    return result;
  }, [content]);

  if (segments.length === 0) return null;

  // Fast path: no embeds detected — plain ReactMarkdown
  if (segments.every((s) => s.kind === "text")) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
  }

  return (
    <>
      {segments.map((segment, idx) => {
        if (segment.kind === "text") {
          return (
            <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]}>
              {segment.content}
            </ReactMarkdown>
          );
        }
        return (
          <InlineEmbed
            key={`${segment.vizType}-${segment.vizId}-${idx}`}
            type={segment.vizType}
            id={segment.vizId}
          />
        );
      })}
    </>
  );
}
