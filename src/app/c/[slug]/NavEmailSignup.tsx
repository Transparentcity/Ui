"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { useSignupEmail } from "./SignupEmailContext";

type Props = {
  citySlug: string;
  cityName?: string;
};

export default function NavEmailSignup({ citySlug, cityName }: Props) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const router = useRouter();
  const { setEmail: setSharedEmail } = useSignupEmail();
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending">("idle");

  const handleChange = (val: string) => {
    setEmail(val);
    setSharedEmail(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setStatus("sending");
    const currentPath =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    if (typeof window !== "undefined" && currentPath !== "/check-email") {
      try {
        sessionStorage.setItem("auth_return_after_check_email", currentPath);
      } catch { /* ignore */ }
    }
    try {
      await loginWithRedirect({
        authorizationParams: {
          connection: "email",
          login_hint: email,
          scope: "openid profile email offline_access",
          redirect_uri: typeof window !== "undefined" ? window.location.origin : undefined,
        },
        appState: { returnTo: "/check-email" },
      });
    } catch {
      setStatus("idle");
    }
  };

  const handleLogin = async () => {
    await loginWithRedirect({
      authorizationParams: { screen_hint: "login", prompt: "login" },
      appState: { returnTo: "/dashboard" },
    });
  };

  if (isAuthenticated) {
    return (
      <button className="btn btn-primary nav-signup" onClick={() => router.push("/dashboard")} disabled={isLoading}>
        Dashboard
      </button>
    );
  }

  return (
    <div className="nav-email-signup">
      <button
        type="button"
        className="nav-email-signin-link"
        onClick={handleLogin}
        disabled={isLoading}
      >
        Sign in
      </button>
      <form onSubmit={handleSubmit} className={`nav-email-pill${focused ? " nav-email-pill--focused" : ""}`}>
        <input
          type="email"
          value={email}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={cityName ? `Get ${cityName}'s weekly briefing` : "Enter your email"}
          className="nav-email-input"
          required
          autoComplete="email"
          disabled={status === "sending"}
        />
        <button
          type="submit"
          className="nav-email-btn"
          disabled={status === "sending" || !email}
        >
          {status === "sending" ? "..." : "Sign up"}
        </button>
      </form>
    </div>
  );
}
