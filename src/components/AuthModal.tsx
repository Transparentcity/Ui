"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { trackLogin } from "@/lib/analytics";
import { startSignup } from "@/lib/signup";
import styles from "./AuthModal.module.css";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export default function AuthModal({ isOpen, onClose, title }: AuthModalProps) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();
  const focusTrapRef = useFocusTrap(isOpen);

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

  const handleSignup = async () => {
    await startSignup(loginWithRedirect, "resident", {
      source_surface: "auth_modal",
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
      ref={focusTrapRef}
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
            onClick={() => void handleSignup()}
            disabled={isLoading}
          >
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
}
