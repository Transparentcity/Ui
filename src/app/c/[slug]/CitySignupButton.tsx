"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  trackSignupStart,
  trackSignupClick,
  trackLogin,
  getFunnelSessionId,
  recordFunnelEventBackend,
  type SignupEventContext,
} from "@/lib/analytics";
import { useSignupEmail } from "./SignupEmailContext";
import GovernmentSignupMessage from "@/components/GovernmentSignupMessage";
import authStyles from "@/components/AuthModal.module.css";

type Props = {
  citySlug?: string;
  cityName?: string;
  cityId?: number | null;
};

export default function CitySignupButton({ citySlug, cityName, cityId }: Props = {}) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const [signupMenuOpen, setSignupMenuOpen] = useState(false);
  const [showGovMessage, setShowGovMessage] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { email: prefillEmail } = useSignupEmail();

  // Close gov message modal on Escape
  useEffect(() => {
    if (!showGovMessage) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowGovMessage(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showGovMessage]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setSignupMenuOpen(false);
      }
    };

    if (signupMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [signupMenuOpen]);

  const handleSignup = async (intent: "resident" | "public-servant") => {
    setSignupMenuOpen(false);
    const ctx: SignupEventContext = {
      city_slug: citySlug ?? null,
      city_name: cityName ?? null,
      city_id: typeof cityId === "number" ? cityId : null,
      source_surface: "city_header",
      signup_intent: intent,
      landing_path:
        typeof window !== "undefined" ? window.location.pathname : null,
      funnel_session_id: getFunnelSessionId(),
    };
    trackSignupStart(intent, ctx);
    recordFunnelEventBackend("signup_start", ctx);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", intent);
      if (citySlug) {
        window.localStorage.setItem("transparentcity.follow_city_slug", citySlug);
      }
      if (cityName) {
        window.localStorage.setItem("transparentcity.follow_city_name", cityName);
      }
      if (typeof cityId === "number") {
        window.localStorage.setItem("transparentcity.follow_city_id", String(cityId));
      }
    }
    trackSignupClick(intent, ctx);
    const params = new URLSearchParams({ signup: intent });
    if (citySlug) params.set("follow_city_slug", citySlug);
    if (cityName) params.set("follow_city_name", cityName);
    if (typeof cityId === "number") params.set("follow_city_id", String(cityId));
    const returnTo = `/home?${params.toString()}`;
    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
        ...(prefillEmail && { login_hint: prefillEmail }),
      },
      appState: { returnTo },
    });
  };

  const handleLogin = async () => {
    trackLogin();

    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "login",
        prompt: "login",
        ...(prefillEmail && prefillEmail.includes("@") ? { login_hint: prefillEmail } : {}),
      },
      appState: { returnTo: "/home" },
    });
  };

  if (isAuthenticated) {
    const href = citySlug ? `/c/${citySlug}` : "/";
    return (
      <Link href={href} className="nav-home-link">
        &larr; {cityName || "Home"}
      </Link>
    );
  }

  return (
    <div className="nav-signup-wrapper">
      <button
        className="btn btn-outline"
        onClick={handleLogin}
        disabled={isLoading}
      >
        Sign in
      </button>
      <div className="nav-signup-menu" ref={menuRef}>
        <button
          className="btn btn-primary nav-signup"
          onClick={() => setSignupMenuOpen((v) => !v)}
          disabled={isLoading}
          aria-haspopup="menu"
          aria-expanded={signupMenuOpen}
        >
          Sign up
        </button>
        {signupMenuOpen && (
          <div className="nav-signup-dropdown" role="menu" aria-label="Sign up options">
            <button
              className="nav-signup-item"
              role="menuitem"
              onClick={() => handleSignup("resident")}
              disabled={isLoading}
            >
              <div className="nav-signup-item-title">I&apos;m a citizen</div>
              <div className="nav-signup-item-desc">
                Follow a city, read research, and get the map view.
              </div>
            </button>
            <button
              className="nav-signup-item"
              role="menuitem"
              onClick={() => {
                setSignupMenuOpen(false);
                setShowGovMessage(true);
              }}
              disabled={isLoading}
            >
              <div className="nav-signup-item-title">I&apos;m city staff</div>
              <div className="nav-signup-item-desc">
                Briefs, context, and operational clarity.
              </div>
            </button>
          </div>
        )}
      </div>

      {showGovMessage && (
        <div
          className={authStyles.overlay}
          onClick={() => setShowGovMessage(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={authStyles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={authStyles.header}>
              <span />
              <button
                type="button"
                className={authStyles.closeBtn}
                onClick={() => setShowGovMessage(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <GovernmentSignupMessage
              onContinue={() => {
                setShowGovMessage(false);
                handleSignup("public-servant");
              }}
              onBack={() => setShowGovMessage(false)}
              disabled={isLoading}
            />
          </div>
        </div>
      )}
    </div>
  );
}

