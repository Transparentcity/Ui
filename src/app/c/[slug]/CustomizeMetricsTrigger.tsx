"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { startSignup } from "@/lib/signup";
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
    const returnToParams: Record<string, string> = {
      follow_city_id: String(cityId),
      follow_city_name: cityName,
    };
    if (citySlug) returnToParams.follow_city_slug = citySlug;
    void startSignup(loginWithRedirect, "resident", {
      source_surface: "customize_metrics",
      city_id: cityId,
      city_name: cityName,
      city_slug: citySlug ?? null,
      returnToParams,
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
