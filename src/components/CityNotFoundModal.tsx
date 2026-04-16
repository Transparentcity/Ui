"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  submitCityLeadInterest,
  updateUserPreferences,
  getUserPreferences,
} from "@/lib/apiClient";
import {
  buildUnsupportedHomePreferenceExtra,
  hasSupportedHomeCityId,
} from "@/lib/onboardingHomeLocation";
import { recordProductEvent } from "@/lib/productAnalytics";
import Loader from "./Loader";
import styles from "./CityNotFoundModal.module.css";

interface CityNotFoundModalProps {
  isOpen: boolean;
  cityName: string;
  state: string | null;
  country: string | null;
  /** First onboarding search hit an unsupported city — record intent + offer retry without exiting onboarding. */
  fromOnboarding?: boolean;
  onClose: () => void;
  onComplete: () => void;
  /** Re-open location search without marking onboarding complete (onboarding only). */
  onBackToSearch?: () => void;
}

export default function CityNotFoundModal({
  isOpen,
  cityName,
  state,
  country,
  fromOnboarding = false,
  onClose,
  onComplete,
  onBackToSearch,
}: CityNotFoundModalProps) {
  const { getAccessTokenSilently, user } = useAuth0();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loggedUnsupportedRef = useRef(false);

  useEffect(() => {
    if (!isOpen || !fromOnboarding) {
      loggedUnsupportedRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const latest = await getUserPreferences(token);
        if (cancelled) return;
        if (hasSupportedHomeCityId(latest.extra)) {
          return;
        }
        const merged = buildUnsupportedHomePreferenceExtra(
          latest.extra as Record<string, unknown> | undefined,
          cityName,
          state,
          country
        );
        await updateUserPreferences({ extra: merged }, token);
        if (!loggedUnsupportedRef.current) {
          loggedUnsupportedRef.current = true;
          recordProductEvent(
            "onboarding_unsupported_home_logged",
            { city_name: cityName, state, country },
            token
          );
        }
      } catch (err) {
        console.error("[CityNotFoundModal] persist unsupported home:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, fromOnboarding, cityName, state, country, getAccessTokenSilently]);

  if (!isOpen) return null;

  const cityDisplayName = state ? `${cityName}, ${state}` : cityName;

  const sendWelcomeEmail = () => {
    const email = user?.email;
    if (!email) return;
    fetch("/api/welcome-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
      .then((res) => {
        if (!res.ok) console.error("[CityNotFoundModal] welcome email returned", res.status);
      })
      .catch((err) => console.error("[CityNotFoundModal] welcome email failed:", err));
  };

  const handleBrowseFeed = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();

      await submitCityLeadInterest({ city_name: cityName, state, country }, token);

      if (fromOnboarding) {
        const latest = await getUserPreferences(token);
        const merged = buildUnsupportedHomePreferenceExtra(
          latest.extra as Record<string, unknown> | undefined,
          cityName,
          state,
          country
        );
        await updateUserPreferences(
          { has_completed_onboarding: true, extra: merged },
          token
        );
      } else {
        await updateUserPreferences({ has_completed_onboarding: true }, token);
      }

      sendWelcomeEmail();
      onComplete();
    } catch (err) {
      console.error("Error submitting interest:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleTryDifferentCity = () => {
    if (fromOnboarding && onBackToSearch) {
      onBackToSearch();
      return;
    }
    onClose();
  };

  const handleDismissOverlay = () => {
    if (fromOnboarding && onBackToSearch) {
      onBackToSearch();
      return;
    }
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={handleDismissOverlay}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.closeButton}
          onClick={handleTryDifferentCity}
          title={fromOnboarding ? "Try a different city" : "Close"}
          aria-label={fromOnboarding ? "Try a different city" : "Close"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className={styles.content}>
          <div className={styles.icon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>

          <h2 className={styles.title}>We don&apos;t have {cityDisplayName} yet</h2>
          <p className={styles.description}>
            We&apos;re adding new cities every week. We&apos;ll email you when we launch yours.
            In the meantime, browse stories from cities we already cover.
          </p>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button
              className={styles.primaryButton}
              onClick={handleBrowseFeed}
              disabled={loading}
            >
              {loading ? (
                <span className={styles.buttonLoader}>
                  <Loader size="sm" color="white" />
                </span>
              ) : (
                "Browse the feed"
              )}
            </button>
            {fromOnboarding && onBackToSearch && (
              <button
                type="button"
                className={styles.linkButton}
                onClick={handleTryDifferentCity}
                disabled={loading}
              >
                Try a different city
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
