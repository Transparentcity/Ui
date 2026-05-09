"use client";

import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import GovernmentSignupMessage from "@/components/GovernmentSignupMessage";
import authStyles from "@/components/AuthModal.module.css";
import styles from "./Header.module.css";
import {
  trackSignupStart,
  trackSignupClick,
  getFunnelSessionId,
  recordFunnelEventBackend,
  type SignupEventContext,
} from "@/lib/analytics";

export default function Header() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();
  const signupMenuRef = useRef<HTMLDivElement | null>(null);
  const [signupMenuOpen, setSignupMenuOpen] = useState(false);
  const [showGovMessage, setShowGovMessage] = useState(false);

  // Close gov message modal on Escape
  useEffect(() => {
    if (!showGovMessage) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowGovMessage(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showGovMessage]);

  // Auto-open the gov interstitial when arriving with ?signup=public-servant
  // (deep links from email/CRM, QA C37, etc).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") === "public-servant") {
      setShowGovMessage(true);
    }
  }, []);

  useEffect(() => {
    if (!signupMenuOpen) return;
    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && signupMenuRef.current && !signupMenuRef.current.contains(target)) {
        setSignupMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [signupMenuOpen]);

  const handleLogin = async () => {
    if (isAuthenticated) {
      router.push("/home");
      return;
    }
    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "login",
        prompt: "login",
      },
      appState: { returnTo: "/home" },
    });
  };

  const handleSignup = async (intent: "resident" | "public-servant") => {
    setSignupMenuOpen(false);

    const ctx: SignupEventContext = {
      source_surface: "nav_header",
      signup_intent: intent,
      landing_path: typeof window !== "undefined" ? window.location.pathname : null,
      funnel_session_id: getFunnelSessionId(),
    };
    trackSignupStart(intent, ctx);
    trackSignupClick(intent, ctx);
    recordFunnelEventBackend("signup_start", ctx);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", intent);
      window.localStorage.setItem("transparentcity.signup_surface", "nav_header");
    }

    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
      },
      appState: { returnTo: `/home?signup=${intent}` },
    });
  };

  // Generate unique IDs for logo masks to avoid conflicts
  const baseId = useId();
  const logoMaskIdBl = `${baseId}-logo-mask-bl`;
  const logoMaskIdTr = `${baseId}-logo-mask-tr`;

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.headerInner}>
          <Link
            href="/"
            className={styles.brand}
            aria-label="Transparent.city home"
          >
            <div className={styles.logoCorners} aria-hidden="true">
              <svg
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
                style={{ overflow: "visible" }}
              >
                <defs>
                  <mask
                    id={logoMaskIdBl}
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
                    <rect
                      x="8.333"
                      y="8.333"
                      width="83.333"
                      height="83.333"
                      rx="3"
                      ry="3"
                      fill="black"
                    />
                    <rect
                      x="16.666"
                      y="-33.333"
                      width="66.666"
                      height="166.666"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                    <rect
                      x="50"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                  </mask>
                  <mask
                    id={logoMaskIdTr}
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <rect
                      x="-400"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="white"
                    />
                    <rect
                      x="8.333"
                      y="8.333"
                      width="83.333"
                      height="83.333"
                      rx="3"
                      ry="3"
                      fill="black"
                    />
                    <rect
                      x="16.666"
                      y="-33.333"
                      width="66.666"
                      height="166.666"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                    <rect
                      x="-1150"
                      y="-400"
                      width="1200"
                      height="1200"
                      fill="black"
                      transform="rotate(-45 50 50)"
                    />
                  </mask>
                </defs>
                <rect
                  className={styles.brace}
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask={`url(#${logoMaskIdBl})`}
                />
                <rect
                  className={styles.brace}
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  rx="3"
                  ry="3"
                  mask={`url(#${logoMaskIdTr})`}
                />
              </svg>
            </div>
            <span className={styles.brandText}>
              <span className={styles.logoTransparent}>transparent</span>
              <span className={styles.logoCity}>.city</span>
            </span>
          </Link>

          <nav className={styles.navRight} aria-label="Top navigation">
            {isAuthenticated ? (
              <button
                className={styles.buttonSignIn}
                onClick={() => router.push("/home")}
                disabled={isLoading}
              >
                <svg className={styles.homeIcon} width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M16 10H4M4 10L8 6M4 10L8 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Home
              </button>
            ) : (
              <button
                className={styles.buttonSignIn}
                onClick={handleLogin}
                disabled={isLoading}
              >
                Sign in
              </button>
            )}

            {!isAuthenticated && (
              <div className={styles.menuWrap} ref={signupMenuRef}>
                <button
                  className={styles.buttonSignUp}
                  onClick={() => setSignupMenuOpen((v) => !v)}
                  disabled={isLoading}
                  aria-haspopup="menu"
                  aria-expanded={signupMenuOpen}
                >
                  Sign up
                </button>
                {signupMenuOpen && (
                  <div className={styles.menu} role="menu" aria-label="Sign up options">
                    <button
                      className={styles.menuItem}
                      role="menuitem"
                      onClick={() => handleSignup("resident")}
                      disabled={isLoading}
                    >
                      <span className={styles.menuItemTitle}>Sign up as citizen</span>
                    </button>
                    <button
                      className={styles.menuItem}
                      role="menuitem"
                      onClick={() => {
                        setSignupMenuOpen(false);
                        setShowGovMessage(true);
                      }}
                      disabled={isLoading}
                    >
                      <span className={styles.menuItemTitle}>I&apos;m city staff</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>
      </div>

      {showGovMessage && typeof document !== "undefined" && createPortal(
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
        </div>,
        document.body,
      )}
    </header>
  );
}
