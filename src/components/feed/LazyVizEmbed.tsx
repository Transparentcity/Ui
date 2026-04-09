"use client";

import { useRef, useState, useEffect } from "react";
import styles from "./feed.module.css";

interface LazyVizEmbedProps {
  src: string;
  title: string;
  className?: string;
  /** Extra CSS class for the outer wrapper */
  wrapperClassName?: string;
  /** Viewport margin for IntersectionObserver (default "200px") */
  rootMargin?: string;
}

/**
 * Lazy-mounted iframe embed for feed card visualizations.
 *
 * Defers iframe creation until the element is within `rootMargin` of the
 * viewport, then fades in once the iframe fires its load event. Shows a
 * pulsing skeleton placeholder until then.
 */
export default function LazyVizEmbed({
  src,
  title,
  className,
  wrapperClassName,
  rootMargin = "200px",
}: LazyVizEmbedProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [shouldMount, setShouldMount] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldMount(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div
      ref={sentinelRef}
      className={`${styles.vizEmbedWrap} ${wrapperClassName ?? ""}`}
    >
      {!shouldMount && <div className={styles.vizSkeleton} />}
      {shouldMount && (
        <>
          {!loaded && <div className={styles.vizSkeleton} />}
          <iframe
            src={src}
            title={title}
            className={`${styles.vizIframeThumb} ${loaded ? styles.vizIframeLoaded : styles.vizIframeLoading} ${className ?? ""}`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        </>
      )}
    </div>
  );
}
