"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { startSignup } from "@/lib/signup";
import styles from "../get-landing.module.css";

type Props = {
  citySlug: string;
  cityName: string;
  cityId?: number | null;
};

export default function HeroEmailSignup({ citySlug, cityName, cityId }: Props) {
  const { loginWithRedirect } = useAuth0();
  const [sending, setSending] = useState(false);

  const buildReturnPath = () => {
    const params = new URLSearchParams({
      signup: "resident",
      follow_city_slug: citySlug,
      follow_city_name: cityName,
    });
    if (typeof cityId === "number") params.set("follow_city_id", String(cityId));
    return `/home?${params.toString()}`;
  };

  const handleSignUp = async () => {
    setSending(true);
    try {
      await startSignup(loginWithRedirect, "resident", {
        source_surface: "city_get_landing",
        city_slug: citySlug,
        city_name: cityName,
        city_id: typeof cityId === "number" ? cityId : null,
        returnTo: buildReturnPath(),
      });
    } catch (err) {
      console.error("[HeroEmailSignup] Auth0 signup redirect failed:", err);
      setSending(false);
    }
  };

  return (
    <div id="get-hero-signup" className={styles.heroSignupForm}>
      <button
        type="button"
        className={styles.heroSignupButton}
        onClick={() => void handleSignUp()}
        disabled={sending}
      >
        {sending ? "Redirecting…" : "Sign up free"}
      </button>
      <p className={styles.heroSignupNote}>
        Free for the first month. No credit card required.
      </p>
    </div>
  );
}
