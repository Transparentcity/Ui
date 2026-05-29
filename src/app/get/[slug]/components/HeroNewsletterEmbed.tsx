"use client";

import { KeyboardEvent, useEffect, useRef } from "react";
import { focusGetLandingHeroSignup } from "@/lib/passwordlessSignup";
import styles from "../get-landing.module.css";

type Props = {
  slug: string;
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

export default function HeroNewsletterEmbed({
  slug,
  shortHash,
  district = 0,
  editionDate,
  featuredPendingId,
  captionLabel,
}: Props) {
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
    if (!overlay) return;

    const getContentWindow = (): Window | null =>
      iframeRef.current?.contentWindow ?? null;

    const handleWheel = (event: WheelEvent) => {
      const win = getContentWindow();
      if (!win) return;
      event.preventDefault();
      win.scrollBy({
        top: event.deltaY,
        left: event.deltaX,
        behavior: "auto",
      });
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

      win.scrollBy({ top: dy, left: dx, behavior: "auto" });
    };

    overlay.addEventListener("wheel", handleWheel, { passive: false });
    overlay.addEventListener("touchstart", handleTouchStart, { passive: true });
    overlay.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      overlay.removeEventListener("wheel", handleWheel);
      overlay.removeEventListener("touchstart", handleTouchStart);
      overlay.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      focusGetLandingHeroSignup();
    }
  };

  return (
    <div className={styles.newsletterFrameWrapper}>
      <div
        className={styles.newsletterFrame}
        role="button"
        tabIndex={0}
        aria-label="Sign up to get this weekly briefing"
        onClick={focusGetLandingHeroSignup}
        onKeyDown={handleKeyDown}
      >
        <iframe
          ref={iframeRef}
          src={embedSrc}
          title={`Sample weekly briefing — ${label}`}
          loading="lazy"
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
