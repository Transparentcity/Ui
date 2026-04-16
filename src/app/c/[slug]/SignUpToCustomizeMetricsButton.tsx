"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { startSignup } from "@/lib/signup";

type Props = {
  cityId?: number;
  cityName?: string;
  citySlug?: string;
};

export default function SignUpToCustomizeMetricsButton({ cityId, cityName, citySlug }: Props) {
  const { loginWithRedirect } = useAuth0();

  const handleClick = () => {
    const returnToParams: Record<string, string> = {};
    if (cityId != null) returnToParams.follow_city_id = String(cityId);
    if (cityName) returnToParams.follow_city_name = cityName;
    if (citySlug) returnToParams.follow_city_slug = citySlug;
    void startSignup(loginWithRedirect, "resident", {
      source_surface: "customize_metrics_button",
      city_id: cityId ?? null,
      city_name: cityName ?? null,
      city_slug: citySlug ?? null,
      returnToParams,
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
