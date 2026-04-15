"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import UserMetricOrderDialog, {
  type UserMetricOrderDialogMetric,
} from "@/components/UserMetricOrderDialog";

type Props = {
  cityId: number;
  cityName: string;
  citySlug?: string;
  metrics: UserMetricOrderDialogMetric[];
};

export default function CustomizeMetricsTrigger({
  cityId,
  cityName,
  citySlug,
  metrics,
}: Props) {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, loginWithRedirect } = useAuth0();

  const handleSignUpToCustomize = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", "resident");
      window.localStorage.setItem("transparentcity.follow_city_id", String(cityId));
      window.localStorage.setItem("transparentcity.follow_city_name", cityName);
      if (citySlug) window.localStorage.setItem("transparentcity.follow_city_slug", citySlug);
    }
    const params = new URLSearchParams({ signup: "resident", follow_city_id: String(cityId), follow_city_name: cityName });
    if (citySlug) params.set("follow_city_slug", citySlug);
    loginWithRedirect({
      authorizationParams: { screen_hint: "signup", prompt: "login" },
      appState: { returnTo: `/home?${params.toString()}` },
    });
  };

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={handleSignUpToCustomize}
        className="hero-category-link"
        style={{ marginTop: 8 }}
      >
        Sign up to customize metrics
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hero-category-link"
        style={{ marginTop: 8 }}
      >
        Customize metrics
      </button>
      <UserMetricOrderDialog
        cityId={cityId}
        cityName={cityName}
        metrics={metrics}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
