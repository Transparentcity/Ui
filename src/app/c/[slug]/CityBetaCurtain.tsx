"use client";

import { FormEvent, useState } from "react";
import { requestBetaAccess } from "@/lib/publicApiClient";

type CityBetaCurtainProps = {
  cityId: number;
  cityName: string;
  cityEmoji?: string | null;
};

export default function CityBetaCurtain({
  cityId,
  cityName,
  cityEmoji,
}: CityBetaCurtainProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestBetaAccess(cityId, email.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="city-coming-soon">
      <div className="city-coming-soon-emoji">{cityEmoji || "🔒"}</div>
      <h2 className="city-coming-soon-title">
        {cityName} is in private beta
      </h2>
      <p className="city-coming-soon-desc">
        Data is coming to {cityName}. Join the beta and we&rsquo;ll send an
        invite when a spot opens.
      </p>
      {submitted ? (
        <p className="city-coming-soon-desc">
          Thanks — you&rsquo;ll hear from us when a spot opens.
        </p>
      ) : (
        <form className="city-coming-soon-signup" onSubmit={onSubmit}>
          <input
            type="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder="you@example.com"
            aria-label="Email for beta access"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-primary, #ccc)",
              minWidth: 240,
            }}
          />
          <button type="submit" disabled={busy} className="city-signup-cta">
            {busy ? "Sending…" : "Request beta access"}
          </button>
          {error ? (
            <p className="city-coming-soon-desc" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
