"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  submitCityLeadInterest,
  updateUserPreferences,
} from "@/lib/apiClient";
import Loader from "./Loader";
import styles from "./CityNotFoundModal.module.css";

interface CityNotFoundModalProps {
  isOpen: boolean;
  cityName: string;
  state: string | null;
  country: string | null;
  onClose: () => void;
  onComplete: () => void;
}

export default function CityNotFoundModal({
  isOpen,
  cityName,
  state,
  country,
  onClose,
  onComplete,
}: CityNotFoundModalProps) {
  const { getAccessTokenSilently, user } = useAuth0();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const cityDisplayName = state ? `${cityName}, ${state}` : cityName;

  /** Fire-and-forget: send welcome email with story previews */
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

      // Register interest so we can notify them later
      await submitCityLeadInterest(
        { city_name: cityName, state, country },
        token
      );

      // Mark onboarding complete so WelcomeModal doesn't reappear
      await updateUserPreferences({ has_completed_onboarding: true }, token);

      sendWelcomeEmail();
      onComplete();
    } catch (err) {
      console.error("Error submitting interest:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    try {
      const token = await getAccessTokenSilently();
      await updateUserPreferences({ has_completed_onboarding: true }, token);
    } catch (err) {
      console.error("Error completing onboarding:", err);
    }
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={handleClose} title="Close" aria-label="Close">
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
            In the meantime, browse stories from all our cities, or help us prioritize yours.
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
            <a
              href="/add-your-city"
              className={styles.secondaryButton}
            >
              Help us add your city&apos;s data
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
