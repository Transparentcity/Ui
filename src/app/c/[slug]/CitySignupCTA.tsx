"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { startSignup } from "@/lib/signup";

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
    const returnToParams: Record<string, string> = {};
    if (citySlug) returnToParams.follow_city_slug = citySlug;
    if (cityName) returnToParams.follow_city_name = cityName;
    if (typeof cityId === "number") returnToParams.follow_city_id = String(cityId);

    await startSignup(loginWithRedirect, "resident", {
      source_surface: "city_signup_cta",
      city_slug: citySlug ?? null,
      city_name: cityName ?? null,
      city_id: typeof cityId === "number" ? cityId : null,
      returnToParams,
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
