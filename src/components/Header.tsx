"use client";

import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import GovernmentSignupMessage from "@/components/GovernmentSignupMessage";
import authStyles from "@/components/AuthModal.module.css";
import styles from "./Header.module.css";
import { startSignup } from "@/lib/signup";

export default function Header() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();
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

  const handleSignup = async () => {
    await startSignup(loginWithRedirect, "resident", {
      source_surface: "nav_header",
    });
  };

  const handlePublicServantSignup = async () => {
    setShowGovMessage(false);
    await startSignup(loginWithRedirect, "public-servant", {
      source_surface: "nav_header",
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
              <button
                className={styles.buttonSignUp}
                onClick={() => void handleSignup()}
                disabled={isLoading}
              >
                Sign up
              </button>
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
              onContinue={() => void handlePublicServantSignup()}
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
