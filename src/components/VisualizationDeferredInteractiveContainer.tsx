"use client";

import { useRef } from "react";
import { useDeferredVisualizationIframes } from "@/lib/useDeferredVisualizationIframes";

type Props = {
  html: string;
  className?: string;
};

/**
 * Renders HTML from {@link processVisualizationShortcodes} and wires deferred
 * interactive iframes (see `viz-deferred-interactive` in visualization shortcodes).
 */
export function VisualizationDeferredInteractiveContainer({
  html,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDeferredVisualizationIframes(ref, [html]);

  return (
    <div
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
