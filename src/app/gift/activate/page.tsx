"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { getGiftMeta, type GiftMetaResponse } from "@/lib/apiClient";
import { sendPasswordlessMagicLink } from "@/lib/auth0Passwordless";
import { getAuth0ApiAudience } from "@/lib/auth0ApiAudience";
import styles from "./activate.module.css";

/* ─── inner page ─── */

type PageState = "loading" | "ready" | "sending" | "email_sent" | "activated" | "error";

function GiftActivateInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t");

  const { isAuthenticated, isLoading: authLoading } = useAuth0();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [meta, setMeta] = useState<GiftMetaResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // If already authenticated, send to the app.
  useEffect(() => {
    if (authLoading || !meta) return;
    if (isAuthenticated) {
      window.location.href = "/home";
    }
  }, [authLoading, isAuthenticated, meta]);

  // Fetch gift metadata.
  useEffect(() => {
    if (!token) {
      setErrorMsg("This activation link is missing a token. Please check the email and try again.");
      setPageState("error");
      return;
    }
    getGiftMeta(token)
      .then((data) => {
        if (data.already_activated) {
          setMeta(data);
          setPageState("activated");
        } else {
          setMeta(data);
          setPageState("ready");
        }
      })
      .catch((err) => {
        const is404 = err?.status === 404;
        setErrorMsg(
          is404
            ? "This activation link is invalid or has already expired."
            : "Something went wrong loading your trial. Please try the link again."
        );
        setPageState("error");
      });
  }, [token]);

  const handleActivate = async () => {
    if (!meta) return;
    setPageState("sending");
    setErrorMsg("");

    const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
    if (!clientId) {
      setErrorMsg("Auth is not configured. Please contact support.");
      setPageState("ready");
      return;
    }

    try {
      await sendPasswordlessMagicLink({
        email: meta.recipient_email,
        clientId,
        audience: getAuth0ApiAudience(),
        appState: { returnTo: "/home" },
      });
      setPageState("email_sent");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setPageState("ready");
    }
  };

  const city = meta?.city_name || meta?.place_label || "your city";
  const fromName = meta?.gifter_display || "Someone";
  const trialEnds = meta?.trial_ends_at ?? null;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.wordmark} aria-label="transparent.city">
          <span className={styles.wordmarkPlain}>transparent</span>
          <span className={styles.wordmarkAccent}>.city</span>
        </span>

        {pageState === "error" && <ErrorView message={errorMsg} />}
        {pageState === "activated" && <AlreadyActivatedView />}

        {pageState === "loading" && (
          <div className={styles.center}>
            <div className={styles.spinner} aria-label="Loading…" />
          </div>
        )}

        {pageState === "email_sent" && meta && (
          <EmailSentView email={meta.recipient_email} />
        )}

        {(pageState === "ready" || pageState === "sending") && meta && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h1 className={styles.headline}>
              {fromName} gifted you a free trial
            </h1>
            <p className={styles.body}>
              <strong>Seymour</strong> is transparent.city&rsquo;s AI analyst.
              Every week he reads public records for <strong>{city}</strong>{" "}
              — permits, crime, 311, economic data — and sends you a
              plain-English briefing about what&rsquo;s actually happening in
              your neighborhood.
            </p>

            {trialEnds && <TrialBadge trialEndsAt={trialEnds} />}

            <div className={styles.divider} />

            <div className={styles.locationRow}>
              <span className={styles.locationIcon} aria-hidden="true">📍</span>
              <div>
                <span className={styles.locationLabel}>Your city</span>
                <span className={styles.locationName}>{city}</span>
              </div>
            </div>

            <div className={styles.emailRow}>
              <div>
                <span className={styles.emailLabel}>Sign-in link will go to</span>
                <span className={styles.emailAddress}>{meta.recipient_email}</span>
              </div>
            </div>

            {errorMsg && (
              <p className={styles.errorText} role="alert" style={{ fontSize: 13 }}>
                {errorMsg}
              </p>
            )}

            <div className={styles.ctaArea}>
              <button
                className={styles.primaryBtn}
                onClick={handleActivate}
                disabled={pageState === "sending"}
              >
                {pageState === "sending" ? (
                  <>
                    <div
                      className={styles.spinner}
                      style={{
                        width: 16,
                        height: 16,
                        borderWidth: 2,
                        borderTopColor: "#fff",
                        borderColor: "rgba(255,255,255,0.3)",
                      }}
                    />
                    Sending link…
                  </>
                ) : (
                  "Send me my sign-in link →"
                )}
              </button>
              <p className={styles.ctaHint}>
                We&rsquo;ll email a magic sign-in link to{" "}
                <strong>{meta.recipient_email}</strong>. No password needed.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── sub-views ─── */

function EmailSentView({ email }: { email: string }) {
  return (
    <div className={styles.center}>
      <div className={styles.iconWrap} aria-hidden="true">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      </div>
      <h1 className={styles.headline}>Check your inbox</h1>
      <p className={styles.body}>
        We sent a sign-in link to <strong>{email}</strong>. Click it to create
        your account and start receiving Seymour&rsquo;s briefings.
      </p>
      <p className={styles.note}>
        Didn&rsquo;t get it? Check your spam folder, or{" "}
        <button
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "inherit",
            textDecoration: "underline",
            cursor: "pointer",
            fontSize: "inherit",
          }}
          onClick={() => window.location.reload()}
        >
          try again
        </button>
        .
      </p>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className={styles.center}>
      <p className={styles.errorText}>{message}</p>
      <Link href="/" className={styles.secondaryLink}>
        Go to transparent.city
      </Link>
    </div>
  );
}

function AlreadyActivatedView() {
  return (
    <div className={styles.center}>
      <div className={styles.iconWrap} aria-hidden="true">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 className={styles.headline}>Your trial is already active</h1>
      <p className={styles.body}>
        You&rsquo;ve already activated this gift. Sign in to access your
        dashboard.
      </p>
      <Link href="/home" className={styles.primaryBtn}>
        Go to my dashboard &rarr;
      </Link>
    </div>
  );
}

function TrialBadge({ trialEndsAt }: { trialEndsAt: string }) {
  try {
    const ends = new Date(trialEndsAt);
    const formatted = ends.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return (
      <div className={styles.trialBadge}>
        4-week free trial &middot; active until <strong>{formatted}</strong>
      </div>
    );
  } catch {
    return null;
  }
}

/* ─── exported page ─── */

export default function GiftActivatePage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <div className={styles.card}>
            <div className={styles.center}>
              <div className={styles.spinner} />
            </div>
          </div>
        </div>
      }
    >
      <GiftActivateInner />
    </Suspense>
  );
}
