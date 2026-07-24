"use client";

/**
 * Newsletter email landing hook + signup banner.
 *
 * Mounts on story pages and other destinations that newsletter email links
 * point to.  Activates when `nl` (click token) or `utm_source=newsletter` is
 * present in the URL.
 *
 * Behaviour:
 *   - Checks Auth0 for a logged-in session (silent `getAccessTokenSilently`).
 *   - If the user IS logged in: sends a lightweight beacon to associate the
 *     click with their user_id for ranking signals (best-effort, non-blocking).
 *   - If the user is NOT logged in: shows a non-blocking slide-in banner
 *     "Get your own weekly brief" with a city-aware signup CTA.
 *
 * The banner is dismissible and not shown again for 7 days (localStorage).
 * It renders nothing when `nl` / `utm_source=newsletter` is absent.
 */

import { useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { startSignup, SIGNUP_AUTHORIZATION_PARAMS } from "@/lib/signup";
import { API_BASE } from "@/lib/apiBase";

const DISMISSED_KEY = "tc_nl_banner_dismissed_until";
const DISMISS_DAYS = 7;

interface NewsletterEmailLandingBannerProps {
  citySlug?: string | null;
  cityName?: string | null;
}

function isNewsletterLanding(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.has("nl") ||
    params.get("utm_source") === "newsletter"
  );
}

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  const val = localStorage.getItem(DISMISSED_KEY);
  if (!val) return false;
  return Date.now() < parseInt(val, 10);
}

function dismiss(): void {
  if (typeof window === "undefined") return;
  const until = Date.now() + DISMISS_DAYS * 24 * 3600 * 1000;
  localStorage.setItem(DISMISSED_KEY, String(until));
}

async function sendAuthenticatedClickBeacon(token: string): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const nl = params.get("nl") || "";
  if (!nl) return;
  try {
    await fetch(`${API_BASE}/api/public/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event_name: "newsletter_click_authenticated",
        path: window.location.pathname,
        properties: { nl },
      }),
      keepalive: true,
    });
  } catch {
    // non-fatal
  }
}

export default function NewsletterEmailLandingBanner({
  citySlug,
  cityName,
}: NewsletterEmailLandingBannerProps) {
  const { isAuthenticated, isLoading, getAccessTokenSilently, loginWithRedirect } =
    useAuth0();
  const [showBanner, setShowBanner] = useState(false);
  const [visible, setVisible] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (isLoading || handled.current) return;
    if (!isNewsletterLanding()) return;
    handled.current = true;

    if (isAuthenticated) {
      // User is logged in: send an authenticated beacon (non-blocking)
      getAccessTokenSilently()
        .then((token) => sendAuthenticatedClickBeacon(token))
        .catch(() => {});
      return;
    }

    // Not logged in: show signup banner (if not recently dismissed)
    if (!isDismissed()) {
      setShowBanner(true);
      // Slight delay so the page renders before the banner slides in
      setTimeout(() => setVisible(true), 600);
    }
  }, [isLoading, isAuthenticated, getAccessTokenSilently]);

  if (!showBanner) return null;

  const handleSignup = async () => {
    dismiss();
    await startSignup(loginWithRedirect, "resident", {
      source_surface: "newsletter_email_banner",
      city_slug: citySlug,
      city_name: cityName,
    });
  };

  const handleDismiss = () => {
    dismiss();
    setVisible(false);
    setTimeout(() => setShowBanner(false), 350);
  };

  return (
    <div
      role="complementary"
      aria-label="Newsletter signup"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: `translateX(-50%) translateY(${visible ? "0" : "120px"})`,
        transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        zIndex: 9000,
        width: "min(460px, calc(100vw - 32px))",
        background: "#fff",
        borderRadius: 16,
        boxShadow: "0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        border: "1.5px solid #e5e7eb",
      }}
    >
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute",
          top: 12,
          right: 14,
          border: 0,
          background: "transparent",
          cursor: "pointer",
          color: "#9ca3af",
          fontSize: 18,
          lineHeight: 1,
          padding: 2,
        }}
      >
        ×
      </button>

      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>
          Get your own weekly brief
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
          {cityName
            ? `${cityName}'s public data, explained — crime trends, housing, city services, and more.`
            : "Your city's public data, explained in plain language every week."}
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={handleSignup}
          style={{
            flex: "1 1 auto",
            padding: "10px 16px",
            background: "#ad35fa",
            color: "#fff",
            border: 0,
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Get the free weekly
        </button>
        <button
          onClick={handleDismiss}
          style={{
            flex: "0 0 auto",
            padding: "10px 14px",
            background: "#f3f4f6",
            color: "#374151",
            border: 0,
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
