"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { VisualizationDeferredInteractiveContainer } from "./VisualizationDeferredInteractiveContainer";
import {
  processVisualizationShortcodes,
  EmbedConfig,
} from "../lib/visualizationShortcodes";

interface ReportContentProps {
  /** The HTML or markdown content to render */
  content: string;
  /** Optional CSS class name for the container */
  className?: string;
  /** Optional configuration for visualization embeds */
  embedConfig?: EmbedConfig;
  /** If true, forces markdown rendering even if content looks like HTML */
  forceMarkdown?: boolean;
}

/**
 * ReportContent component for rendering research report HTML with embedded visualizations.
 * 
 * Features:
 * - Automatically detects HTML vs Markdown content
 * - Processes visualization shortcodes and replaces them with iframe embeds:
 *   - [chart:123] → embedded time series chart
 *   - [map:abc123] → embedded map
 *   - [anomaly:456] → embedded anomaly visualization
 * - Falls back to markdown rendering for legacy content
 */
export function ReportContent({
  content,
  className = "",
  embedConfig,
  forceMarkdown = false,
}: ReportContentProps) {
  // Process the content and detect type
  const { processedContent, isHtml } = useMemo(() => {
    if (!content) {
      return { processedContent: "", isHtml: false };
    }

    // First, process visualization shortcodes in the raw content
    const withEmbeds = processVisualizationShortcodes(content, embedConfig);

    // Detect if content is HTML
    const trimmedContent = withEmbeds.trim();
    const clearlyHtml =
      !forceMarkdown &&
      (/^<[a-z][a-z0-9]*\b/i.test(trimmedContent) ||
        trimmedContent.includes("<h1>") ||
        trimmedContent.includes("<h2>") ||
        trimmedContent.includes("<p>") ||
        trimmedContent.includes("<div>") ||
        trimmedContent.includes("<iframe"));

    return {
      processedContent: withEmbeds,
      isHtml: clearlyHtml,
    };
  }, [content, embedConfig, forceMarkdown]);

  if (!content) {
    return <p className={className}>No report content available.</p>;
  }

  if (isHtml) {
    // Render HTML directly with embedded visualizations
    return (
      <VisualizationDeferredInteractiveContainer
        className={className}
        html={processedContent}
      />
    );
  }

  // Render as markdown (fallback for legacy content)
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

export default ReportContent;
