"use client";

import { useAuth0 } from "@auth0/auth0-react";
import styles from "./MobileCitySignupBar.module.css";

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

  if (isLoading || isAuthenticated) return null;

  const handleClick = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", "resident");
      window.localStorage.setItem("transparentcity.follow_city_slug", citySlug);
      window.localStorage.setItem("transparentcity.follow_city_name", cityName);
      if (typeof cityId === "number") {
        window.localStorage.setItem("transparentcity.follow_city_id", String(cityId));
      }
    }
    const returnTo = `/home?signup=resident&follow_city_slug=${encodeURIComponent(citySlug)}&follow_city_name=${encodeURIComponent(cityName)}${typeof cityId === "number" ? `&follow_city_id=${cityId}` : ""}`;
    await loginWithRedirect({
      authorizationParams: { screen_hint: "signup" },
      appState: { returnTo },
    });
  };

  return (
    <>
      <div className={styles.spacer} />
      <div className={styles.bar}>
        <div className={styles.barInner}>
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
