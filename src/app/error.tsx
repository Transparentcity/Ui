"use client";

import { useEffect } from "react";
import styles from "./home.module.css";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error("Application error:", error);
  }, [error]);

  // Check if this is an Auth0 state error (common with back button)
  const isAuth0Error =
    error.message?.includes("state") ||
    error.message?.includes("Invalid state") ||
    error.message?.includes("auth") ||
    error.message?.includes("Login required");

  const handleGoHome = () => {
    // Clear any stale Auth0 state from localStorage
    if (typeof window !== "undefined") {
      // Clear Auth0 transaction storage that can cause state mismatches
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("a0.spajs.txs") || key.startsWith("@@auth0spajs@@"))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
    window.location.href = "/";
  };

  const isStorageError = error.message?.includes("setItem") || error.message?.includes("Storage") || error.message?.includes("quota");

  const handleRetry = () => {
    if (typeof window !== "undefined") {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith("a0.spajs.txs") ||
            key.startsWith("@@auth0spajs@@") ||
            key.startsWith("waste:"))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
    reset();
  };

  return (
    <div className={styles.page}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "80vh",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            maxWidth: "500px",
            background: "var(--bg-secondary, #f8f9fa)",
            borderRadius: "12px",
            padding: "32px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              marginBottom: "16px",
            }}
          >
            {isAuth0Error ? "🔐" : "⚠️"}
          </div>

          <h1
            style={{
              fontSize: "24px",
              fontWeight: 600,
              color: "var(--text-primary, #1a1a1a)",
              marginBottom: "12px",
            }}
          >
            {isAuth0Error ? "Session Interrupted" : "Something went wrong"}
          </h1>

          <p
            style={{
              fontSize: "15px",
              color: "var(--text-secondary, #666)",
              marginBottom: "24px",
              lineHeight: 1.6,
            }}
          >
            {isAuth0Error
              ? "Your session was interrupted, possibly by navigating back during login. This is easily fixed."
              : "An unexpected error occurred. You can try again or return to the home page."}
          </p>

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleGoHome}
              style={{
                padding: "12px 24px",
                fontSize: "15px",
                fontWeight: 500,
                color: "#ffffff",
                background: "var(--brand-primary, #ad35fa)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--brand-primary-hover, #9333ea)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--brand-primary, #ad35fa)";
              }}
            >
              Go to Home
            </button>

            <button
              onClick={handleRetry}
              style={{
                padding: "12px 24px",
                fontSize: "15px",
                fontWeight: 500,
                color: "var(--text-primary, #1a1a1a)",
                background: "var(--bg-primary, #ffffff)",
                border: "1px solid var(--border-primary, #e0e0e0)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-tertiary, #f0f0f0)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-primary, #ffffff)";
              }}
            >
              Try Again
            </button>
          </div>

          {process.env.NODE_ENV === "development" && error.message && (
            <details
              style={{
                marginTop: "24px",
                textAlign: "left",
                fontSize: "12px",
                color: "var(--text-tertiary, #999)",
              }}
            >
              <summary style={{ cursor: "pointer", marginBottom: "8px" }}>
                Technical details
              </summary>
              <pre
                style={{
                  background: "var(--bg-tertiary, #f0f0f0)",
                  padding: "12px",
                  borderRadius: "6px",
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {error.message}
                {error.digest && `\n\nDigest: ${error.digest}`}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
