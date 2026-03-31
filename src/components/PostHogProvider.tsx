"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

function PostHogInit() {
  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === "undefined") return;

    if (!posthog.__loaded) {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        // Capture page views manually via Next.js router for accuracy.
        capture_pageview: false,
        // Persist user identity across sessions.
        persistence: "localStorage",
      });
    }
  }, []);

  return null;
}

interface PostHogProviderProps {
  children: React.ReactNode;
}

/**
 * Initializes PostHog and wraps the app in its React context.
 * Place in the root layout wrapping {children}.
 * Requires NEXT_PUBLIC_POSTHOG_KEY env var to be set; silently no-ops if absent.
 */
export default function PostHogProvider({ children }: PostHogProviderProps) {
  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <PostHogInit />
      {children}
    </PHProvider>
  );
}
