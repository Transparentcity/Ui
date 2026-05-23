"use client";

import { useState, type CSSProperties } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { startPasswordlessEmailSignup } from "@/lib/passwordlessSignup";

type Variant = "light" | "dark";

type Props = {
  citySlug: string;
  cityName: string;
  cityId?: number | null;
  shortCode: string;
  variant?: Variant;
  ctaLabel: string;
  successLabel: string;
};

export default function EmailSignupForm({
  citySlug,
  cityName,
  cityId,
  shortCode,
  variant = "light",
  ctaLabel,
  successLabel,
}: Props) {
  const { loginWithRedirect } = useAuth0();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setStatus("sending");

    const returnParams = new URLSearchParams({
      signup: "resident",
      follow_city_slug: citySlug,
      follow_city_name: cityName,
    });
    if (typeof cityId === "number") returnParams.set("follow_city_id", String(cityId));

    try {
      await startPasswordlessEmailSignup(loginWithRedirect, {
        email,
        sourceSurface: `cincy_landing_${shortCode}`,
        citySlug,
        cityName,
        cityId,
        returnAfterCheckEmail: `/home?${returnParams.toString()}`,
      });
      setStatus("sent");
    } catch (err) {
      console.error("[CincyLanding] signup failed:", err);
      setStatus("error");
    }
  };

  const formStyle: CSSProperties =
    variant === "dark"
      ? {
          display: "flex",
          gap: 8,
          padding: 6,
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
          maxWidth: 520,
          margin: "0 auto",
          alignItems: "stretch",
        }
      : {
          display: "flex",
          gap: 8,
          padding: 6,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          boxShadow: "0 8px 28px rgba(0,0,0,0.05)",
          maxWidth: 520,
          alignItems: "stretch",
        };

  if (status === "sent") {
    return variant === "dark" ? (
      <div
        style={{
          padding: "16px 20px",
          borderRadius: 14,
          background: "rgba(16,185,129,0.14)",
          border: "1px solid rgba(16,185,129,0.35)",
          maxWidth: 520,
          margin: "0 auto",
          fontFamily: "var(--font-ui)",
          fontSize: 15,
          color: "#6ee7b7",
          fontWeight: 600,
        }}
      >
        {successLabel}
      </div>
    ) : (
      <div
        style={{
          padding: "14px 18px",
          borderRadius: 14,
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.25)",
          maxWidth: 520,
          fontFamily: "var(--font-ui)",
          fontSize: 14.5,
          color: "#047857",
          fontWeight: 600,
        }}
      >
        {successLabel}
      </div>
    );
  }

  return (
    <form className="signupForm" onSubmit={handleSubmit} style={formStyle}>
      <input
        type="email"
        required
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === "sending"}
        autoComplete="email"
        aria-label="Email address"
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 0,
          padding: "12px 14px",
          fontFamily: "var(--font-body)",
          fontSize: 15.5,
          color: "#111827",
          background: "transparent",
        }}
      />
      <button
        type="submit"
        disabled={status === "sending" || !email}
        style={{
          background: "linear-gradient(135deg,#ad35fa,#8b5cf6)",
          color: "#fff",
          border: 0,
          borderRadius: 10,
          padding: "12px 22px",
          fontFamily: "var(--font-ui)",
          fontSize: 14.5,
          fontWeight: 700,
          cursor: status === "sending" ? "wait" : "pointer",
          whiteSpace: "nowrap",
          boxShadow:
            variant === "dark"
              ? "0 4px 12px rgba(173,53,250,0.4)"
              : "0 4px 12px rgba(173,53,250,0.3)",
          opacity: status === "sending" ? 0.7 : 1,
        }}
      >
        {status === "sending" ? "Sending…" : ctaLabel}
      </button>
    </form>
  );
}
