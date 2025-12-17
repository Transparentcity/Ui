"use client";

import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";

export default function ProPage() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  const handlePublicServantSignup = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("transparentcity.signup_intent", "public-servant");
    }

    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
        prompt: "login",
      },
      appState: { returnTo: "/dashboard?signup=public-servant" },
    });
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "80px 24px",
        background: "#ffffff",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 650,
            color: "rgba(17, 24, 39, 0.72)",
            border: "1px solid rgba(17, 24, 39, 0.10)",
            borderRadius: 999,
            padding: "8px 12px",
            display: "inline-flex",
          }}
        >
          Pro
        </div>
        <h1 style={{ marginTop: 14, fontSize: 44, letterSpacing: "-0.04em" }}>
          Tools for public servants.
        </h1>
        <p
          style={{
            marginTop: 12,
            fontSize: 16,
            lineHeight: 1.65,
            color: "rgba(17, 24, 39, 0.72)",
            maxWidth: 720,
          }}
        >
          Pro is for city staff and public officials who need operational clarity:
          briefings, context, and a shared factual baseline for decisions and public
          communication.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          <button
            onClick={handlePublicServantSignup}
            disabled={isLoading || isAuthenticated}
            style={{
              border: "1px solid rgba(173, 53, 250, 0.35)",
              background: "linear-gradient(135deg, #ad35fa 0%, #8b5cf6 100%)",
              color: "#ffffff",
              borderRadius: 12,
              padding: "10px 14px",
              fontWeight: 700,
              cursor: isLoading || isAuthenticated ? "not-allowed" : "pointer",
              opacity: isLoading || isAuthenticated ? 0.6 : 1,
            }}
          >
            {isAuthenticated ? "Go to dashboard" : "Sign up as a public servant"}
          </button>
          <Link
            href="/"
            style={{
              border: "1px solid rgba(17, 24, 39, 0.14)",
              background: "#ffffff",
              color: "rgba(17, 24, 39, 0.92)",
              borderRadius: 12,
              padding: "10px 14px",
              fontWeight: 650,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}


