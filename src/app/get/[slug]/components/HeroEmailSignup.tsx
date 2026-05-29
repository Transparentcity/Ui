"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useState } from "react";
import { useSignupEmail } from "@/app/c/[slug]/SignupEmailContext";
import {
  PasswordlessSendError,
  requiresHostedPasswordlessFlow,
  sendPasswordlessEmailLink,
  startPasswordlessEmailSignup,
} from "@/lib/passwordlessSignup";
import styles from "../get-landing.module.css";

type Props = {
  citySlug: string;
  cityName: string;
  cityId?: number | null;
};

type FormStatus = "idle" | "sending" | "sent" | "error";

export default function HeroEmailSignup({ citySlug, cityName, cityId }: Props) {
  const { loginWithRedirect } = useAuth0();
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
    const signupOptions = {
      email: targetEmail,
      sourceSurface: "city_get_landing",
      citySlug,
      cityName,
      cityId,
      returnAfterCheckEmail: buildReturnPath(),
    };
    try {
      if (requiresHostedPasswordlessFlow()) {
        await startPasswordlessEmailSignup(loginWithRedirect, signupOptions);
        return;
      }
      await sendPasswordlessEmailLink(signupOptions);
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

  const sendViaAuth0Page = async () => {
    const trimmed = (sentToEmail ?? email).trim();
    if (!trimmed.includes("@")) return;
    setStatus("sending");
    setErrorMessage(null);
    try {
      await startPasswordlessEmailSignup(loginWithRedirect, {
        email: trimmed,
        sourceSurface: "city_get_landing",
        citySlug,
        cityName,
        cityId,
        returnAfterCheckEmail: buildReturnPath(),
      });
    } catch (err) {
      console.error("[HeroEmailSignup] hosted passwordless failed:", err);
      setErrorMessage("Could not open the sign-in page. Please try again.");
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
            Open the link in this browser (Chrome, Safari, etc.) — not a
            different app or device. Didn’t get it? Check spam, or{" "}
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
        <div className={styles.heroSignupError} role="alert">
          <p>{errorMessage}</p>
          <button
            type="button"
            className={styles.heroSignupResendBtn}
            onClick={() => void sendViaAuth0Page()}
          >
            Send link via secure sign-in page
          </button>
        </div>
      )}
      <p className={styles.heroSignupNote}>
        We&rsquo;ll email you a magic link. No password, no credit card.
      </p>
    </form>
  );
}
