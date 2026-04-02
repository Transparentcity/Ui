"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { useSignupEmail } from "./SignupEmailContext";

type Props = {
  citySlug: string;
  cityName?: string;
};

export default function NavEmailSignup({ citySlug, cityName }: Props) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();
  const { setEmail: setSharedEmail } = useSignupEmail();
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");

  const handleChange = (val: string) => {
    setEmail(val);
    setSharedEmail(val);
    if (status === "error") setStatus("idle");
  };

  const storeReturnPath = () => {
    if (typeof window === "undefined") return;
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== "/check-email") {
      try {
        sessionStorage.setItem("auth_return_after_check_email", currentPath);
      } catch { /* ignore */ }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setStatus("sending");
    storeReturnPath();
    try {
      await loginWithRedirect({
        authorizationParams: {
          connection: "email",
          login_hint: email,
          scope: "openid profile email offline_access",
          redirect_uri: typeof window !== "undefined" ? window.location.origin : undefined,
        },
        appState: { returnTo: "/check-email" },
      });
    } catch (err) {
      console.error("[NavEmailSignup] Auth0 redirect failed:", err);
      setStatus("error");
    }
  };

  const handleLogin = async () => {
    setStatus("sending");
    storeReturnPath();
    try {
      await loginWithRedirect({
        authorizationParams: {
          screen_hint: "login",
          prompt: "login",
          ...(email && email.includes("@") ? { login_hint: email } : {}),
        },
        appState: { returnTo: "/dashboard" },
      });
    } catch (err) {
      console.error("[NavEmailSignup] Auth0 login redirect failed:", err);
      setStatus("error");
    }
  };

  if (isAuthenticated) {
    return (
      <button className="btn btn-primary nav-signup" onClick={() => router.push("/dashboard")} disabled={isLoading}>
        Dashboard
      </button>
    );
  }

  return (
    <div className="nav-email-signup">
      <form
        onSubmit={handleSubmit}
        className={`nav-email-pill${focused ? " nav-email-pill--focused" : ""}${status === "error" ? " nav-email-pill--error" : ""}`}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            cityName
              ? `Get ${cityName}'s weekly briefing`
              : "Enter your email"
          }
          className="nav-email-input"
          required
          autoComplete="email"
          aria-label="Email address for signup"
          disabled={status === "sending"}
        />
        <button
          type="submit"
          className="nav-email-btn"
          disabled={status === "sending" || !email}
        >
          {status === "sending" ? "..." : "Sign up"}
        </button>
      </form>
      {status === "error" && (
        <span className="nav-email-error" role="alert">
          Something went wrong. Try again.
        </span>
      )}
      <button
        type="button"
        className="nav-email-signin-btn"
        onClick={handleLogin}
        disabled={isLoading || status === "sending"}
      >
        Sign in
      </button>
    </div>
  );
}
