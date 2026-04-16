"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import styles from "./MobileCitySignupBar.module.css";
import { startSignup } from "@/lib/signup";

const DISMISS_KEY = "transparentcity.signup_bar_dismissed";

interface MobileCitySignupBarProps {
  cityName: string;
  citySlug: string;
  cityId?: number | null;
}

export default function MobileCitySignupBar({
  cityName,
  citySlug,
  cityId,
}: MobileCitySignupBarProps) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  });

  if (isLoading || isAuthenticated || dismissed) return null;

  const handleClick = async () => {
    const returnToParams: Record<string, string> = {
      follow_city_slug: citySlug,
      follow_city_name: cityName,
    };
    if (typeof cityId === "number") returnToParams.follow_city_id = String(cityId);

    await startSignup(loginWithRedirect, "resident", {
      source_surface: "mobile_city_bar",
      city_slug: citySlug,
      city_name: cityName,
      city_id: typeof cityId === "number" ? cityId : null,
      returnToParams,
    });
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <>
      <div className={styles.spacer} />
      <div className={styles.bar}>
        <div className={styles.barInner}>
          <button
            type="button"
            className={styles.dismissButton}
            onClick={handleDismiss}
            aria-label="Dismiss signup bar"
          >
            ✕
          </button>
          <div className={styles.barText}>
            <div className={styles.barTitle}>Get the Free Weekly</div>
            <div className={styles.barSubtitle}>
              Weekly data stories for {cityName}
            </div>
          </div>
          <button
            type="button"
            className={styles.barButton}
            onClick={handleClick}
          >
            Sign up
          </button>
        </div>
      </div>
    </>
  );
}
