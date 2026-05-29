"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useSignupEmail } from "@/app/c/[slug]/SignupEmailContext";
import { startSignup } from "@/lib/signup";
import styles from "../get-landing.module.css";

type Props = {
  citySlug: string;
  cityName: string;
  cityId?: number | null;
  sourceSurface?: string;
  overrideReturnPath?: string;
};

export default function GetLandingNavSignup({
  citySlug,
  cityName,
  cityId,
  sourceSurface = "city_get_landing_nav",
  overrideReturnPath,
}: Props) {
  const { isLoading, loginWithRedirect } = useAuth0();
  const { email: sharedEmail } = useSignupEmail();
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");

  const handleSignUp = async () => {
    const trimmed = sharedEmail.trim();
    setStatus("sending");
    try {
      await startSignup(loginWithRedirect, "resident", {
        source_surface: sourceSurface,
        city_slug: citySlug,
        city_name: cityName,
        city_id: typeof cityId === "number" ? cityId : null,
        returnTo: overrideReturnPath,
        loginHint: trimmed.includes("@") ? trimmed : undefined,
      });
    } catch (err) {
      console.error("[GetLandingNavSignup] Auth0 signup redirect failed:", err);
      setStatus("error");
    }
  };

  const handleSignIn = async () => {
    setStatus("sending");
    if (typeof window !== "undefined") {
      const path =
        overrideReturnPath ??
        window.location.pathname + window.location.search;
      if (path !== "/check-email") {
        try {
          sessionStorage.setItem("auth_return_after_check_email", path);
        } catch {
          /* ignore */
        }
      }
      if (citySlug) {
        window.localStorage.setItem("transparentcity.follow_city_slug", citySlug);
      }
      if (cityName) {
        window.localStorage.setItem("transparentcity.follow_city_name", cityName);
      }
      if (typeof cityId === "number") {
        window.localStorage.setItem("transparentcity.follow_city_id", String(cityId));
      }
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
          ...(sharedEmail.trim().includes("@")
            ? { login_hint: sharedEmail.trim() }
            : {}),
        },
        appState: { returnTo },
      });
    } catch (err) {
      console.error("[GetLandingNavSignup] sign-in redirect failed:", err);
      setStatus("error");
    }
  };

  return (
    <div className={styles.getNavSignup}>
      {status === "error" && (
        <span className={styles.getNavSignupError} role="alert">
          Something went wrong. Try again.
        </span>
      )}
      <button
        type="button"
        className="nav-email-signin-btn"
        onClick={handleSignIn}
        disabled={isLoading || status === "sending"}
      >
        Sign in
      </button>
      <button
        type="button"
        className={`btn btn-primary ${styles.getNavSignupBtn}`}
        onClick={handleSignUp}
        disabled={isLoading || status === "sending"}
      >
        {status === "sending" ? "Sending…" : "Sign up"}
      </button>
    </div>
  );
}
