"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useSignupEmail } from "@/app/c/[slug]/SignupEmailContext";
import { startPasswordlessEmailSignup } from "@/lib/passwordlessSignup";
import styles from "../get-landing.module.css";

type Props = {
  citySlug: string;
  cityName: string;
  cityId?: number | null;
};

export default function HeroEmailSignup({ citySlug, cityName, cityId }: Props) {
  const { loginWithRedirect } = useAuth0();
  const { email, setEmail } = useSignupEmail();
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");

  const buildReturnPath = () => {
    const params = new URLSearchParams({
      signup: "resident",
      follow_city_slug: citySlug,
      follow_city_name: cityName,
    });
    if (typeof cityId === "number") params.set("follow_city_id", String(cityId));
    return `/home?${params.toString()}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setStatus("sending");

    try {
      await startPasswordlessEmailSignup(loginWithRedirect, {
        email,
        sourceSurface: "city_get_landing",
        citySlug,
        cityName,
        cityId,
        returnAfterCheckEmail: buildReturnPath(),
      });
    } catch (err) {
      console.error("[HeroEmailSignup] passwordless signup failed:", err);
      setStatus("error");
    }
  };

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
      {status === "error" && (
        <p className={styles.heroSignupError}>
          Something went wrong. Please try again.
        </p>
      )}
      <p className={styles.heroSignupNote}>
        We&rsquo;ll email you a magic link. No password, no credit card.
      </p>
    </form>
  );
}
