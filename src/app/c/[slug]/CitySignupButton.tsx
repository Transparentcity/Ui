"use client";

import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { trackLogin } from "@/lib/analytics";
import { startSignup } from "@/lib/signup";
import { useSignupEmail } from "./SignupEmailContext";

type Props = {
  citySlug?: string;
  cityName?: string;
  cityId?: number | null;
};

export default function CitySignupButton({ citySlug, cityName, cityId }: Props = {}) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const { email: prefillEmail } = useSignupEmail();

  const handleSignup = async () => {
    const returnToParams: Record<string, string> = {};
    if (citySlug) returnToParams.follow_city_slug = citySlug;
    if (cityName) returnToParams.follow_city_name = cityName;
    if (typeof cityId === "number") returnToParams.follow_city_id = String(cityId);

    await startSignup(loginWithRedirect, "resident", {
      source_surface: "city_header",
      city_slug: citySlug ?? null,
      city_name: cityName ?? null,
      city_id: typeof cityId === "number" ? cityId : null,
      returnToParams: Object.keys(returnToParams).length > 0 ? returnToParams : undefined,
      loginHint: prefillEmail || undefined,
    });
  };

  const handleLogin = async () => {
    trackLogin();

    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "login",
        prompt: "login",
        ...(prefillEmail && prefillEmail.includes("@") ? { login_hint: prefillEmail } : {}),
      },
      appState: { returnTo: "/home" },
    });
  };

  if (isAuthenticated) {
    const href = citySlug ? `/c/${citySlug}` : "/";
    return (
      <Link href={href} className="nav-home-link">
        &larr; {cityName || "Home"}
      </Link>
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
      <button
        className="btn btn-primary nav-signup"
        onClick={() => void handleSignup()}
        disabled={isLoading}
      >
        Sign up
      </button>
    </div>
  );
}
