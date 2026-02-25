"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { usePathname } from "next/navigation";

export default function SignUpToCustomizeMetricsButton() {
  const { loginWithRedirect } = useAuth0();
  const pathname = usePathname();
  const returnTo = pathname ?? "/dashboard";

  const handleClick = () => {
    loginWithRedirect({
      authorizationParams: { screen_hint: "signup", prompt: "login" },
      appState: { returnTo },
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
