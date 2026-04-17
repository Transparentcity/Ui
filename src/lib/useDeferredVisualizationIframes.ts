"use client";

import type { RefObject } from "react";
import { useEffect } from "react";

function resolveDeferredIframeSrc(base: string): string {
  if (typeof document === "undefined") return base;
  const theme =
    document.documentElement.getAttribute("data-theme") === "dark" ||
    document.documentElement.classList.contains("dark")
      ? "dark"
      : null;
  if (!theme || base.includes("theme=")) {
    return base;
  }
  return base.includes("?") ? `${base}&theme=${theme}` : `${base}?theme=${theme}`;
}

/**
 * When static visualization HTML includes `<details class="viz-deferred-interactive">`
 * with iframes using `data-deferred-src`, assign `src` on first open so embeds do not
 * load until the reader opts in.
 */
export function useDeferredVisualizationIframes(
  rootRef: RefObject<HTMLElement | null>,
  deps: unknown[],
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cleanups: (() => void)[] = [];
    root
      .querySelectorAll("details.viz-deferred-interactive")
      .forEach((el) => {
        const details = el as HTMLDetailsElement;
        const onToggle = () => {
          if (!details.open) return;
          details.querySelectorAll("iframe[data-deferred-src]").forEach((node) => {
            const iframe = node as HTMLIFrameElement;
            const ds = iframe.dataset.deferredSrc;
            if (!ds || iframe.getAttribute("src")) return;
            iframe.src = resolveDeferredIframeSrc(ds);
          });
        };
        details.addEventListener("toggle", onToggle);
        cleanups.push(() => details.removeEventListener("toggle", onToggle));
      });

    return () => cleanups.forEach((fn) => fn());
  }, [rootRef, ...deps]);
}
