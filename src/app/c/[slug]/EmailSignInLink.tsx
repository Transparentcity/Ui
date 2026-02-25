"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";

type EmailSignInLinkProps = {
  /** e.g. "To get updates for San Francisco." When set, used as the form label. */
  label?: string;
};

/**
 * Single email input that sends the user through Auth0 passwordless (one-time link).
 * Redirects with connection: "email" and login_hint; user gets an email and clicks
 * the link to sign in. Requires: Auth0 Dashboard > Authentication > Passwordless >
 * Email enabled, and the application allowed to use that connection.
 */
export default function EmailSignInLink({ label }: EmailSignInLinkProps) {
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setStatus("sending");
    const currentPath =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    const returnTo = "/check-email";
    if (typeof window !== "undefined" && currentPath && currentPath !== "/check-email") {
      try {
        sessionStorage.setItem("auth_return_after_check_email", currentPath);
      } catch {
        /* ignore */
      }
    }

    try {
      const redirectUri =
        typeof window !== "undefined" ? `${window.location.origin}` : undefined;
      await loginWithRedirect({
        authorizationParams: {
          connection: "email",
          login_hint: email,
          scope: "openid profile email offline_access",
          ...(redirectUri ? { redirect_uri: redirectUri } : {}),
        },
        appState: { returnTo },
      });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      if (typeof window !== "undefined" && err instanceof Error) {
        console.error("[EmailSignInLink] Auth0 redirect failed:", err.message);
      }
    }
  };

  if (isAuthenticated) return null;

  return (
    <form onSubmit={handleSubmit} className="newsletter-signup" style={{ marginTop: 16 }}>
      <div className="newsletter-signup-content">
        <label htmlFor="email-signin-email" className="newsletter-label">
          {label ?? "Enter your email to sign up"}
        </label>
        <div className="newsletter-input-group">
          <input
            id="email-signin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="newsletter-input"
            required
            disabled={status === "sending"}
            autoComplete="email"
          />
          <button
            type="submit"
            className="btn btn-primary newsletter-button"
            disabled={status === "sending" || !email}
          >
            {status === "sending" ? "Sending…" : "Sign up"}
          </button>
        </div>
        {status === "sent" && (
          <p className="newsletter-success">
            Check your email and click the one-time link to finish signing up.
          </p>
        )}
        {status === "error" && (
          <p className="newsletter-error">
            Something went wrong. Please try again.
          </p>
        )}
      </div>
    </form>
  );
}
