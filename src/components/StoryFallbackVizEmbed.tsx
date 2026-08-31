"use client";

import { useRef } from "react";
import SafeImage from "@/components/SafeImage";
import { useDeferredVisualizationIframes } from "@/lib/useDeferredVisualizationIframes";

type Props = {
  imageUrl: string;
  imageAlt?: string | null;
  imageCaption?: string | null;
  showImageCaption?: boolean;
  iframeSrc: string;
  iframeTitle?: string;
  iframeHeight?: string;
};

/**
 * Primary visualization when a story has no `article_html`: show the saved
 * preview image with an optional interactive embed behind a disclosure.
 */
export function StoryFallbackVizEmbed({
  imageUrl,
  imageAlt,
  imageCaption,
  showImageCaption = true,
  iframeSrc,
  iframeTitle = "Visualization",
  iframeHeight = "420px",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDeferredVisualizationIframes(ref, [iframeSrc]);

  const altText = (imageAlt ?? "").trim() || iframeTitle;

  return (
    <div ref={ref} className="story-article-body story-fallback-viz">
      <div className="visualization-embed visualization-static-embed viz-has-deferred-interactive">
        <div className="viz-static-stack">
          <SafeImage
            src={imageUrl}
            alt={altText}
            className="visualization-static-image"
            style={{
              width: "100%",
              height: iframeHeight,
              objectFit: "cover",
              display: "block",
              background: "var(--bg-secondary)",
            }}
          />
          {showImageCaption && (imageCaption ?? "").trim() ? (
            <div className="visualization-static-caption">{imageCaption!.trim()}</div>
          ) : null}
        </div>
        <details className="viz-deferred-interactive">
          <summary className="viz-deferred-interactive-summary">
            Load interactive version
          </summary>
          <div className="viz-deferred-interactive-frame-wrap">
            <iframe
              data-deferred-src={iframeSrc}
              title={iframeTitle}
              width="100%"
              height={iframeHeight}
              style={{
                border: "none",
                borderRadius: 8,
                background: "var(--bg-secondary)",
                display: "block",
              }}
            />
          </div>
        </details>
      </div>
    </div>
  );
}
