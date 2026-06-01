"use client";

/**
 * First-party product analytics: daily active pings and JWT attribution.
 * Must render inside Auth0Provider (see providers.tsx).
 */

import { useAuth0 } from "@auth0/auth0-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { getMyPermissions } from "@/lib/api/user";
import {
  registerProductAnalyticsTokenGetter,
  recordProductEvent,
  shouldFireDaily,
} from "@/lib/productAnalytics";

function TrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, user, getAccessTokenSilently } = useAuth0();

  const dbUserIdRef = useRef<number | null>(null);

  useEffect(() => {
    registerProductAnalyticsTokenGetter(async () => {
      if (!isAuthenticated) return undefined;
      try {
        return await getAccessTokenSilently();
      } catch {
        return undefined;
      }
    });
  }, [getAccessTokenSilently, isAuthenticated]);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      dbUserIdRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const permissions = await getMyPermissions(token);
        if (cancelled) return;

        const dbUserId = permissions.user_id;
        if (!dbUserId) return;

        dbUserIdRef.current = dbUserId;

        const path =
          typeof window !== "undefined" ? window.location.pathname : "/";

        if (shouldFireDaily(`tc_fp_user_active_${dbUserId}`)) {
          recordProductEvent("user_active", { path }, token);
        }
      } catch {
        /* Auth not ready — skip active ping */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, user, getAccessTokenSilently]);

  useEffect(() => {
    if (!pathname) return;

    const fullPath = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;

    if (!isAuthenticated) {
      if (shouldFireDaily("tc_fp_visitor_active")) {
        recordProductEvent("visitor_active", { path: fullPath });
      }
      return;
    }

    const dbUserId = dbUserIdRef.current;
    if (!dbUserId) return;

    if (shouldFireDaily(`tc_fp_user_active_${dbUserId}`)) {
      void (async () => {
        try {
          const token = await getAccessTokenSilently();
          recordProductEvent("user_active", { path: fullPath }, token);
        } catch {
          recordProductEvent("user_active", { path: fullPath });
        }
      })();
    }
  }, [pathname, searchParams, isAuthenticated, getAccessTokenSilently]);

  return null;
}

export default function ProductAnalyticsTracker() {
  return (
    <Suspense fallback={null}>
      <TrackerInner />
    </Suspense>
  );
}
