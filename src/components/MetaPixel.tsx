"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  initializeMetaPixel,
  trackMetaPageView,
  META_PIXEL_ID,
} from "@/lib/metaPixel";

/**
 * Inner component that uses useSearchParams (requires a Suspense boundary).
 */
function MetaPixelInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const didInitialView = useRef(false);

  // Inject the pixel base code + fire the initial PageView once on mount.
  useEffect(() => {
    initializeMetaPixel();
  }, []);

  // Fire a PageView on every client-side route change. The very first
  // PageView is emitted by initializeMetaPixel(); skip it here to avoid a
  // duplicate, then track subsequent SPA navigations.
  useEffect(() => {
    if (!pathname) return;
    if (!didInitialView.current) {
      didInitialView.current = true;
      return;
    }
    trackMetaPageView();
  }, [pathname, searchParams]);

  return (
    <noscript>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}

/**
 * Meta (Facebook) Pixel loader. Initializes the pixel and tracks page views.
 * Mounted once in the root layout, mirroring <GoogleAnalytics />.
 */
export default function MetaPixel() {
  return (
    <Suspense fallback={null}>
      <MetaPixelInner />
    </Suspense>
  );
}
