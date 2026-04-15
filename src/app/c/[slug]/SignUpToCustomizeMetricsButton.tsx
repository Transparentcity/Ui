"use client";

import { useAuth0 } from "@auth0/auth0-react";

type Props = {
  cityId?: number;
  cityName?: string;
  citySlug?: string;
};

export default function SignUpToCustomizeMetricsButton({ cityId, cityName, citySlug }: Props) {
  const { loginWithRedirect } = useAuth0();

  const handleClick = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", "resident");
      if (cityId != null) window.localStorage.setItem("transparentcity.follow_city_id", String(cityId));
      if (cityName) window.localStorage.setItem("transparentcity.follow_city_name", cityName);
      if (citySlug) window.localStorage.setItem("transparentcity.follow_city_slug", citySlug);
    }
    const params = new URLSearchParams({ signup: "resident" });
    if (cityId != null) params.set("follow_city_id", String(cityId));
    if (cityName) params.set("follow_city_name", cityName);
    if (citySlug) params.set("follow_city_slug", citySlug);
    loginWithRedirect({
      authorizationParams: { screen_hint: "signup" },
      appState: { returnTo: `/home?${params.toString()}` },
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 500,
        color: "var(--brand-primary, #ad35fa)",
        background: "transparent",
        border: "1px solid var(--brand-primary, #ad35fa)",
        borderRadius: 6,
        cursor: "pointer",
      }}
    >
      Sign up to customize metrics
    </button>
  );
}
