"use client";

import { KeyboardEvent, useEffect, useRef } from "react";
import styles from "../get-landing.module.css";
import { useGetLandingSignup } from "./useGetLandingSignup";

type Props = {
  slug: string;
  cityName: string;
  cityId?: number | null;
  returnTo: string;
  /** Public edition short hash (city newsletter archive). */
  shortHash?: string;
  district?: number;
  editionDate?: string;
  /** Allowlisted pending newsletter id (personalized marketing sample). */
  featuredPendingId?: number;
  captionLabel?: string;
};

/**
 * Threshold (px) before a touch is treated as a scroll rather than a tap.
 * Below this, the overlay's bubble-up click handler still fires and opens
 * the signup flow; above it we forward the gesture to the iframe and
 * suppress the synthetic click.
 */
const TOUCH_SCROLL_THRESHOLD = 6;

/** Scroll the iframe's embed container (not window — see embed page CSS). */
function scrollIframeContent(win: Window, deltaX: number, deltaY: number): void {
  const container =
    win.document.querySelector<HTMLElement>(".embed-article") ??
    win.document.scrollingElement ??
    win.document.documentElement;
  container.scrollTop += deltaY;
  container.scrollLeft += deltaX;
}

function wheelDeltaY(event: WheelEvent, viewportHeight: number): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * viewportHeight;
  }
  return event.deltaY;
}

export default function HeroNewsletterEmbed({
  slug,
  cityName,
  cityId,
  returnTo,
  shortHash,
  district = 0,
  editionDate,
  featuredPendingId,
  captionLabel,
}: Props) {
  const { triggerSignup } = useGetLandingSignup({
    citySlug: slug,
    cityName,
    cityId,
    returnTo,
    sourceSurface: "city_get_landing_hero_newsletter",
  });
  const embedSrc = featuredPendingId
    ? `/get/${slug}/featured/${featuredPendingId}/embed`
    : `/c/${slug}/newsletter/${shortHash}/embed`;

  const dateStr = editionDate
    ? new Date(editionDate).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  const label =
    captionLabel ??
    (district > 0 ? `District ${district} · ${dateStr}` : `Citywide · ${dateStr}`);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Forward wheel + touch gestures on the click-catching overlay through to
  // the same-origin iframe so the newsletter sample is scrollable while
  // taps/clicks still open the signup flow via the overlay's bubble-up
  // onClick handler.
  useEffect(() => {
    const overlay = overlayRef.current;
    const iframe = iframeRef.current;
    if (!overlay || !iframe) return;

    const getContentWindow = (): Window | null =>
      iframe.contentWindow ?? null;

    const handleWheel = (event: WheelEvent) => {
      const win = getContentWindow();
      if (!win) return;
      event.preventDefault();
      event.stopPropagation();
      const dy = wheelDeltaY(event, win.innerHeight);
      let dx = event.deltaX;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        dx *= 16;
      } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        dx *= win.innerWidth;
      }
      scrollIframeContent(win, dx, dy);
    };

    let touchStartY = 0;
    let touchStartX = 0;
    let lastTouchY = 0;
    let lastTouchX = 0;
    let scrolling = false;

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      touchStartY = touch.clientY;
      touchStartX = touch.clientX;
      lastTouchY = touch.clientY;
      lastTouchX = touch.clientX;
      scrolling = false;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const win = getContentWindow();
      const touch = event.touches[0];
      if (!win || !touch) return;

      const totalDy = Math.abs(touch.clientY - touchStartY);
      const totalDx = Math.abs(touch.clientX - touchStartX);

      if (!scrolling && Math.max(totalDy, totalDx) < TOUCH_SCROLL_THRESHOLD) {
        return;
      }

      scrolling = true;
      event.preventDefault();

      const dy = lastTouchY - touch.clientY;
      const dx = lastTouchX - touch.clientX;
      lastTouchY = touch.clientY;
      lastTouchX = touch.clientX;

      scrollIframeContent(win, dx, dy);
    };

    const bind = () => {
      overlay.addEventListener("wheel", handleWheel, { passive: false });
      overlay.addEventListener("touchstart", handleTouchStart, { passive: true });
      overlay.addEventListener("touchmove", handleTouchMove, { passive: false });
    };

    const unbind = () => {
      overlay.removeEventListener("wheel", handleWheel);
      overlay.removeEventListener("touchstart", handleTouchStart);
      overlay.removeEventListener("touchmove", handleTouchMove);
    };

    bind();

    return () => {
      unbind();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void triggerSignup();
    }
  };

  return (
    <div className={styles.newsletterFrameWrapper}>
      <div
        className={styles.newsletterFrame}
        role="button"
        tabIndex={0}
        aria-label="Sign up to get this weekly briefing"
        onClick={() => void triggerSignup()}
        onKeyDown={handleKeyDown}
      >
        <iframe
          ref={iframeRef}
          src={embedSrc}
          title={`Sample weekly briefing: ${label}`}
          loading="eager"
          className={styles.newsletterIframe}
          scrolling="yes"
          tabIndex={-1}
          aria-hidden="true"
        />
        {/* Click/scroll catcher. JS forwards wheel + touchmove scroll
            gestures to the iframe's contentWindow while taps bubble up to
            the frame's onClick (which opens the signup flow). */}
        <div
          ref={overlayRef}
          className={styles.newsletterFrameOverlay}
          aria-hidden="true"
        />
      </div>
      <div className={styles.newsletterFrameCaption}>
        <span className={styles.newsletterFrameLabel}>Sample issue: {label}</span>
      </div>
    </div>
  );
}
