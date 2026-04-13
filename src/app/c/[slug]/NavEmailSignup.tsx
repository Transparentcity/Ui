"use client";

import { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { useSignupEmail } from "./SignupEmailContext";

type Props = {
  citySlug: string;
  cityName?: string;
  cityId?: number | null;
  /** When true, hides the authenticated home link (used on the feed page itself). */
  isHome?: boolean;
};

export default function NavEmailSignup({ citySlug, cityName, cityId, isHome }: Props) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const { setEmail: setSharedEmail } = useSignupEmail();
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

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
    if (typeof window !== "undefined" && citySlug) {
      window.localStorage.setItem("transparentcity.follow_city_slug", citySlug);
      if (cityName) window.localStorage.setItem("transparentcity.follow_city_name", cityName);
      if (typeof cityId === "number") window.localStorage.setItem("transparentcity.follow_city_id", String(cityId));
    }
    const params = new URLSearchParams();
    if (citySlug) params.set("follow_city_slug", citySlug);
    if (cityName) params.set("follow_city_name", cityName);
    if (typeof cityId === "number") params.set("follow_city_id", String(cityId));
    const returnTo = params.toString() ? `/home?${params.toString()}` : "/home";
    try {
      await loginWithRedirect({
        authorizationParams: {
          screen_hint: "login",
          prompt: "login",
          ...(email && email.includes("@") ? { login_hint: email } : {}),
        },
        appState: { returnTo },
      });
    } catch (err) {
      console.error("[NavEmailSignup] Auth0 login redirect failed:", err);
      setStatus("error");
    }
  };

  if (isAuthenticated) {
    if (isHome) return null;
    return (
      <Link href="/home" className="nav-home-link">
        &larr; {cityName || "Home"}
      </Link>
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
              ? isMobile ? "Free Weekly" : `${cityName}'s Free Weekly`
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
