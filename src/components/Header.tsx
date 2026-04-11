"use client";

import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./Header.module.css";

export default function Header() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();
  const signupMenuRef = useRef<HTMLDivElement | null>(null);
  const [signupMenuOpen, setSignupMenuOpen] = useState(false);

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
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", intent);
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
            <div className={styles.logoCorners}>
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
                  transform="translate(23.5%, -23.5%)"
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
                  transform="translate(-23.5%, 23.5%)"
                />
              </svg>
            </div>
            <span className={styles.brandText}>
              <span className={styles.logoTransparent}>transparent</span>
              <span className={styles.logoCity}>.city</span>
            </span>
          </Link>

          <nav className={styles.navRight} aria-label="Top navigation">
            <button
              className={styles.buttonSignIn}
              onClick={handleLogin}
              disabled={isLoading}
            >
              {isAuthenticated ? "Dashboard" : "Sign in"}
            </button>

            {isAuthenticated ? (
              <button
                className={styles.buttonSignUp}
                onClick={() => router.push("/home")}
                disabled={isLoading}
              >
                Go to dashboard
              </button>
            ) : (
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
                      onClick={() => handleSignup("public-servant")}
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
    </header>
  );
}
