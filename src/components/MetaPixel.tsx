"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackMetaPageView } from "@/lib/metaPixel";

/**
 * Inner component that uses useSearchParams (requires a Suspense boundary).
 */
function MetaPixelInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const didInitialView = useRef(false);

  // The Meta Pixel base code and the initial PageView are emitted from the
  // root layout <head> (see src/app/layout.tsx). This effect only tracks
  // client-side (SPA) route changes so navigations after the first paint are
  // counted as PageViews. Skip the first run to avoid double-counting the
  // initial load already reported by the base snippet.
  useEffect(() => {
    if (!pathname) return;
    if (!didInitialView.current) {
      didInitialView.current = true;
      return;
    }
    trackMetaPageView();
  }, [pathname, searchParams]);

  return null;
}

/**
 * Meta (Facebook) Pixel SPA page-view tracker. Mounted once in the root
 * layout, mirroring <GoogleAnalytics />. The base pixel code lives in the
 * layout <head>; this component keeps PageViews in sync across App Router
 * navigation.
 */
export default function MetaPixel() {
  return (
    <Suspense fallback={null}>
      <MetaPixelInner />
    </Suspense>
  );
}
