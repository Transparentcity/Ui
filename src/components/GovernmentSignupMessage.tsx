"use client";

import styles from "./AuthModal.module.css";

interface GovernmentSignupMessageProps {
  onContinue: () => void;
  onBack: () => void;
  disabled?: boolean;
}

/**
 * Interstitial shown before Auth0 signup when a user selects "Public servant".
 * Tells them to use their government email and that they get free resources.
 */
export default function GovernmentSignupMessage({
  onContinue,
  onBack,
  disabled,
}: GovernmentSignupMessageProps) {
  return (
    <div>
      <h2 className={styles.title} style={{ padding: "24px 24px 0" }}>
        Free resources for government staff
      </h2>
      <p className={styles.subtitle}>
        Government accounts receive free additional resources to support your
        work. Use your government email address when creating your account.
      </p>
      <p
        className={styles.subtitle}
        style={{ marginTop: 0, fontSize: 13, opacity: 0.75 }}
      >
        If you can&apos;t use your government email, use another address and
        we&apos;ll be in touch to confirm.
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
