"use client";

import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Header from "@/components/Header";

const POST_LOGIN_RETURN_KEY = "auth_return_after_check_email";

export function getStoredReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(POST_LOGIN_RETURN_KEY);
  } catch {
    return null;
  }
}

export function clearStoredReturnPath(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(POST_LOGIN_RETURN_KEY);
  } catch {
    /* noop */
  }
}

export default function CheckEmailPage() {
  const { isAuthenticated, isLoading } = useAuth0();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const returnPath = getStoredReturnPath();
      clearStoredReturnPath();
      router.replace(returnPath && returnPath.startsWith("/") ? returnPath : "/");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <>
        <Header />
        <main id="main-content" style={{ padding: "2rem", textAlign: "center" }}>Loading…</main>
      </>
    );
  }

  if (isAuthenticated) {
    return (
      <>
        <Header />
        <main id="main-content" style={{ padding: "2rem", textAlign: "center" }}>Taking you back…</main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main style={{ padding: "2rem 1.5rem", maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1rem" }}>
          Check your email
        </h1>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          We sent you a one-time link. Click it to finish signing up and return to the site.
        </p>
        <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
          If you don’t see the email, check your spam folder.
        </p>
        <Link href="/" className="btn btn-outline" style={{ textDecoration: "none" }}>
          Back to home
        </Link>
      </main>
    </>
  );
}
