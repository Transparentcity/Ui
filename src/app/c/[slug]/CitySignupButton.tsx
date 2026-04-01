"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { trackSignupStart, trackSignupClick, trackLogin } from "@/lib/analytics";
import { useSignupEmail } from "./SignupEmailContext";

export default function CitySignupButton() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();
  const [signupMenuOpen, setSignupMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { email: prefillEmail } = useSignupEmail();

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
    trackSignupStart(intent);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", intent);
    }
    trackSignupClick(intent);
    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
        ...(prefillEmail && { login_hint: prefillEmail }),
      },
      appState: { returnTo: `/dashboard?signup=${intent}` },
    });
  };

  const handleLogin = async () => {
    // Track login attempt
    trackLogin();

    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "login",
        prompt: "login",
      },
      appState: { returnTo: "/dashboard" },
    });
  };

  if (isAuthenticated) {
    return (
      <button
        className="btn btn-primary nav-signup"
        onClick={() => router.push("/dashboard")}
        disabled={isLoading}
      >
        Dashboard
      </button>
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
              onClick={() => handleSignup("public-servant")}
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
    </div>
  );
}

