"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  trackSignupStart,
  trackSignupClick,
  trackLogin,
  getFunnelSessionId,
  recordFunnelEventBackend,
  type SignupEventContext,
} from "@/lib/analytics";
import styles from "./AuthModal.module.css";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export default function AuthModal({ isOpen, onClose, title }: AuthModalProps) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();

  // Redirect authenticated users
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      onClose();
      router.push("/home");
    }
  }, [isAuthenticated, isLoading, onClose, router]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleSignup = async (intent: "resident" | "public-servant") => {
    const ctx: SignupEventContext = {
      source_surface: "auth_modal",
      signup_intent: intent,
      landing_path:
        typeof window !== "undefined" ? window.location.pathname : null,
      funnel_session_id: getFunnelSessionId(),
    };
    trackSignupStart(intent, ctx);
    recordFunnelEventBackend("signup_start", ctx);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", intent);
    }
    trackSignupClick(intent, ctx);

    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
        prompt: "login",
      },
      appState: { returnTo: `/home?signup=${intent}` },
    });
  };

  const handleLogin = async () => {
    trackLogin();
    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "login",
        prompt: "login",
      },
      appState: { returnTo: "/home" },
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="auth-modal-title" className={styles.title}>
            {title ?? "Create your free account"}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className={styles.subtitle}>
          Create a free account to access civic data insights, maps, and research.
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonOutline}`}
            onClick={handleLogin}
            disabled={isLoading}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={() => handleSignup("resident")}
            disabled={isLoading}
          >
            Sign up
          </button>
        </div>

        <div className={styles.signupOptions}>
          <p className={styles.signupLabel}>I&apos;m a...</p>
          <button
            type="button"
            className={styles.signupItem}
            onClick={() => handleSignup("resident")}
            disabled={isLoading}
          >
            <div className={styles.signupItemTitle}>Resident</div>
            <div className={styles.signupItemDesc}>
              Follow a city, read research, and get the map view.
            </div>
          </button>
          <button
            type="button"
            className={styles.signupItem}
            onClick={() => handleSignup("public-servant")}
            disabled={isLoading}
          >
            <div className={styles.signupItemTitle}>Public servant</div>
            <div className={styles.signupItemDesc}>
              Tools for staff: briefs, context, and operational clarity.
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
