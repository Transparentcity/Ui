"use client";

import { useAuth0 } from "@auth0/auth0-react";

export default function SignUpToCustomizeMetricsButton() {
  const { loginWithRedirect } = useAuth0();

  const handleClick = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", "resident");
    }
    loginWithRedirect({
      authorizationParams: { screen_hint: "signup" },
      appState: { returnTo: "/home?signup=resident" },
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
