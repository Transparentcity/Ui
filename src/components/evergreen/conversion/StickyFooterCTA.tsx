"use client";

import { useState, useEffect, useRef } from "react";
import { buildCTAUrl, type CTAContext } from "@/lib/evergreen/ctaUtils";
import { trackEvent } from "@/lib/analytics";

interface StickyFooterCTAProps {
  buttonText: string;
  buttonUrl: string;
  context: CTAContext;
}

export default function StickyFooterCTA({
  buttonText,
  buttonUrl,
  context,
}: StickyFooterCTAProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if already dismissed this session
    if (sessionStorage.getItem("tc_sticky_dismissed")) {
      setDismissed(true);
      return;
    }

    const handleScroll = () => {
      const scrollPct =
        window.scrollY /
        (document.documentElement.scrollHeight - window.innerHeight);
      setVisible(scrollPct > 0.4);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (dismissed || !visible) return null;

  const url = buildCTAUrl(buttonUrl, context);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("tc_sticky_dismissed", "1");
    trackEvent("sticky_cta_dismissed", {
      city: context.citySlug,
      district: context.districtSlug,
    });
  };

  return (
    <>
      {/* Sentinel for scroll tracking */}
      <div ref={sentinelRef} />
      {/* Sticky bar: mobile only */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg p-3 flex items-center justify-between gap-3 md:hidden">
        <a
          href={url}
          className="flex-1 rounded-md bg-purple-600 px-4 py-2.5 text-sm font-medium text-white text-center hover:bg-purple-700 transition-colors"
        >
          {buttonText}
        </a>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-1"
          aria-label="Dismiss"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </button>
      </div>
    </>
  );
}
