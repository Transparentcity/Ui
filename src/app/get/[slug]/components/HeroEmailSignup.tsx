"use client";

import { useState } from "react";
import { useSignupEmail } from "@/app/c/[slug]/SignupEmailContext";
import {
  PasswordlessSendError,
  sendPasswordlessEmailLink,
} from "@/lib/passwordlessSignup";
import styles from "../get-landing.module.css";

type Props = {
  citySlug: string;
  cityName: string;
  cityId?: number | null;
};

type FormStatus = "idle" | "sending" | "sent" | "error";

export default function HeroEmailSignup({ citySlug, cityName, cityId }: Props) {
  const { email, setEmail } = useSignupEmail();
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);

  const buildReturnPath = () => {
    const params = new URLSearchParams({
      signup: "resident",
      follow_city_slug: citySlug,
      follow_city_name: cityName,
    });
    if (typeof cityId === "number") params.set("follow_city_id", String(cityId));
    return `/home?${params.toString()}`;
  };

  const sendLink = async (targetEmail: string) => {
    setStatus("sending");
    setErrorMessage(null);
    try {
      await sendPasswordlessEmailLink({
        email: targetEmail,
        sourceSurface: "city_get_landing",
        citySlug,
        cityName,
        cityId,
        returnAfterCheckEmail: buildReturnPath(),
      });
      setSentToEmail(targetEmail);
      setStatus("sent");
    } catch (err) {
      console.error("[HeroEmailSignup] passwordless send failed:", err);
      let message = "Something went wrong. Please try again.";
      if (err instanceof PasswordlessSendError) {
        message = err.detail ? `${err.message} (${err.detail})` : err.message;
      }
      setErrorMessage(message);
      setStatus("error");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed.includes("@")) return;
    await sendLink(trimmed);
  };

  if (status === "sent" && sentToEmail) {
    return (
      <div
        id="get-hero-signup"
        className={styles.heroSignupSuccess}
        role="status"
        aria-live="polite"
      >
        <span className={styles.heroSignupSuccessIcon} aria-hidden="true">
          ✉️
        </span>
        <div className={styles.heroSignupSuccessBody}>
          <p className={styles.heroSignupSuccessTitle}>
            Check your inbox
          </p>
          <p className={styles.heroSignupSuccessText}>
            We sent a one-time link to{" "}
            <strong className={styles.heroSignupSuccessEmail}>
              {sentToEmail}
            </strong>
            . Click it to finish signing up for the {cityName} weekly.
          </p>
          <p className={styles.heroSignupSuccessNote}>
            Didn’t get it? Check your spam folder, or{" "}
            <button
              type="button"
              className={styles.heroSignupResendBtn}
              onClick={() => sendLink(sentToEmail)}
            >
              resend the link
            </button>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      id="get-hero-signup"
      onSubmit={handleSubmit}
      className={styles.heroSignupForm}
    >
      <div className={styles.heroSignupRow}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className={styles.heroSignupInput}
          required
          autoComplete="email"
          aria-label="Email address"
          disabled={status === "sending"}
        />
        <button
          type="submit"
          className={styles.heroSignupButton}
          disabled={status === "sending" || !email}
        >
          {status === "sending" ? "Sending magic link…" : "Sign up free"}
        </button>
      </div>
      {status === "error" && errorMessage && (
        <p className={styles.heroSignupError} role="alert">
          {errorMessage}
        </p>
      )}
      <p className={styles.heroSignupNote}>
        We&rsquo;ll email you a magic link. No password, no credit card.
      </p>
    </form>
  );
}
