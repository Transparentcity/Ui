"use client";

import styles from "./AuthModal.module.css";

interface GovernmentSignupMessageProps {
  onContinue: () => void;
  onBack: () => void;
  disabled?: boolean;
}

/**
 * Interstitial shown before Auth0 signup when a user selects "Public servant".
 */
export default function GovernmentSignupMessage({
  onContinue,
  onBack,
  disabled,
}: GovernmentSignupMessageProps) {
  return (
    <div>
      <h2 className={styles.title} style={{ padding: "24px 24px 0" }}>
        Your district data, every week — free
      </h2>
      <p className={styles.subtitle}>
        Transparent City writes a weekly report for your office built around your
        district&apos;s own numbers: what improved, what needs attention, how you compare
        to the rest of the city. Framed around your priorities and political promises.
      </p>
      <p className={styles.subtitle} style={{ marginTop: 0 }}>
        Your staff also get free research tools to draft talking points, track
        service commitments, and understand what&apos;s happening on the streets, at
        the MTA, and in the planning pipeline.
      </p>
      <p
        className={styles.subtitle}
        style={{ marginTop: 0, fontSize: 13, opacity: 0.7 }}
      >
        Free for your whole office. Premium options (custom research, deeper
        insights) available — just ask. Use your government email when signing up
        so we can verify automatically.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonOutline}`}
          onClick={onBack}
          disabled={disabled}
        >
          Back
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={onContinue}
          disabled={disabled}
        >
          Continue to sign up
        </button>
      </div>
    </div>
  );
}
