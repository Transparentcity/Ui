"use client";

import { useAuth0 } from "@auth0/auth0-react";

interface CitySignupCTAProps {
  citySlug?: string;
  cityName?: string;
  cityId?: number | null;
  /** Button label (default: "Get the Free Weekly") */
  label?: string;
}

/**
 * Simple signup CTA button using standard Auth0 Universal Login.
 * Mirrors the main landing page flow (screen_hint: "signup").
 */
export default function CitySignupCTA({
  citySlug,
  cityName,
  cityId,
  label = "Get the Free Weekly",
}: CitySignupCTAProps) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  if (isAuthenticated) return null;

  const handleSignup = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", "resident");
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
    const params = new URLSearchParams({ signup: "resident" });
    if (citySlug) params.set("follow_city_slug", citySlug);
    if (cityName) params.set("follow_city_name", cityName);
    if (typeof cityId === "number") params.set("follow_city_id", String(cityId));
    const returnTo = `/home?${params.toString()}`;

    await loginWithRedirect({
      authorizationParams: { screen_hint: "signup" },
      appState: { returnTo },
    });
  };

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={handleSignup}
      disabled={isLoading}
    >
      {label}
    </button>
  );
}
