"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import styles from "./MobileCitySignupBar.module.css";

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
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", "resident");
      window.localStorage.setItem("transparentcity.follow_city_slug", citySlug);
      window.localStorage.setItem("transparentcity.follow_city_name", cityName);
      if (typeof cityId === "number") {
        window.localStorage.setItem("transparentcity.follow_city_id", String(cityId));
      }
    }
    const params = new URLSearchParams({
      signup: "resident",
      follow_city_slug: citySlug,
      follow_city_name: cityName,
    });
    if (typeof cityId === "number") {
      params.set("follow_city_id", String(cityId));
    }
    const returnTo = `/home?${params.toString()}`;
    await loginWithRedirect({
      authorizationParams: { screen_hint: "signup" },
      appState: { returnTo },
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
