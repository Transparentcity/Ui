"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import styles from "../get-landing.module.css";
import { focusGetLandingHeroSignup } from "@/lib/passwordlessSignup";

const DISMISS_KEY = "transparentcity.get_landing_bar_dismissed";

type Props = {
  citySlug: string;
  cityName: string;
  cityId?: number | null;
};

export default function GetLandingMobileCTA({ citySlug, cityName, cityId }: Props) {
  const { isLoading } = useAuth0();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  });

  if (isLoading || dismissed) return null;

  const handleClick = () => {
    focusGetLandingHeroSignup();
  };

  return (
    <>
      <div className={styles.mobileCTASpacer} />
      <div className={styles.mobileCTABar}>
        <div className={styles.mobileCTAInner}>
          <button
            type="button"
            className={styles.mobileCTADismiss}
            onClick={() => {
              try {
                sessionStorage.setItem(DISMISS_KEY, "1");
              } catch { /* ignore */ }
              setDismissed(true);
            }}
            aria-label="Dismiss"
          >
            ✕
          </button>
          <div className={styles.mobileCTAText}>
            <div className={styles.mobileCTATitle}>Get the free weekly</div>
            <div className={styles.mobileCTASubtitle}>
              {cityName}: free for the first month, then $5 a month
            </div>
          </div>
          <button
            type="button"
            className={styles.mobileCTAButton}
            onClick={handleClick}
          >
            Sign up
          </button>
        </div>
      </div>
    </>
  );
}
