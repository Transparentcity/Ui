"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import {
  getGiftMeta,
  type GiftMetaResponse,
} from "@/lib/apiClient";
import {
  giftTrustedLogin,
  sendPasswordlessCode,
  verifyPasswordlessCode,
} from "@/lib/auth0Passwordless";
import { getAuth0ApiAudience } from "@/lib/auth0ApiAudience";
import {
  giftMetaToOnboardingContext,
  persistGiftOnboardingContext,
} from "@/lib/giftOnboarding";
import BrandWordmark from "@/components/BrandWordmark";
import Loader from "@/components/Loader";
import styles from "./activate.module.css";

/* ─── inner page ─── */

type PageState =
  | "loading"
  | "activating"
  | "code_entry"
  | "verifying"
  | "activated"
  | "error";

function GiftActivateInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t");

  const { isAuthenticated, isLoading: authLoading } = useAuth0();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [meta, setMeta] = useState<GiftMetaResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [otp, setOtp] = useState("");
  const activationStarted = useRef(false);

  const isMigration = meta?.kind === "substack_migration";

  const goToGiftOnboarding = useCallback((giftMeta: GiftMetaResponse) => {
    if (!token) return;
    persistGiftOnboardingContext(giftMetaToOnboardingContext(token, giftMeta));
    window.location.href = "/home";
  }, [token]);

  const handleSendCode = useCallback(async (giftMeta: GiftMetaResponse) => {
    const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
    if (!clientId) {
      setErrorMsg("Auth is not configured. Please contact support.");
      setPageState("error");
      return;
    }

    setErrorMsg("");
    try {
      await sendPasswordlessCode({
        email: giftMeta.recipient_email,
        clientId,
      });
      setOtp("");
      setPageState("code_entry");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setPageState("code_entry");
    }
  }, []);

  const runTrustedActivation = useCallback(
    async (giftMeta: GiftMetaResponse) => {
      const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
      if (!clientId) {
        setErrorMsg("Auth is not configured. Please contact support.");
        setPageState("error");
        return;
      }

      setPageState("activating");
      setErrorMsg("");

      try {
        await giftTrustedLogin({
          token: token!,
          clientId,
          audience: getAuth0ApiAudience(),
        });
        goToGiftOnboarding(giftMeta);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not finish setup.";
        const needsOtp =
          message.toLowerCase().includes("otp") ||
          message.toLowerCase().includes("not configured") ||
          message.toLowerCase().includes("not available");
        if (needsOtp) {
          await handleSendCode(giftMeta);
          setErrorMsg(
            "Your welcome link is a bit older now — enter the 6-digit code we just emailed you."
          );
          return;
        }
        setErrorMsg(message);
        setPageState("error");
      }
    },
    [goToGiftOnboarding, handleSendCode, token]
  );

  // Already authenticated → home with gift onboarding context if present.
  useEffect(() => {
    if (authLoading || !meta) return;
    if (isAuthenticated) {
      goToGiftOnboarding(meta);
    }
  }, [authLoading, isAuthenticated, meta, goToGiftOnboarding]);

  // Fetch gift metadata and start activation automatically.
  useEffect(() => {
    if (!token) {
      setErrorMsg(
        "This activation link is missing a token. Please check the email and try again."
      );
      setPageState("error");
      return;
    }

    if (activationStarted.current) return;
    activationStarted.current = true;

    getGiftMeta(token)
      .then(async (data) => {
        setMeta(data);
        persistGiftOnboardingContext(giftMetaToOnboardingContext(token, data));
        if (data.already_activated) {
          setPageState("activated");
          return;
        }

        if (data.requires_otp) {
          await handleSendCode(data);
          return;
        }

        await runTrustedActivation(data);
      })
      .catch((err) => {
        const is404 = err?.status === 404;
        setErrorMsg(
          is404
            ? "This activation link is invalid or has already expired."
            : "Something went wrong loading your invitation. Please try the link again."
        );
        setPageState("error");
      });
  }, [token, handleSendCode, runTrustedActivation]);

  const handleVerifyCode = async () => {
    if (!meta || !token) return;
    const code = otp.trim();
    if (code.length < 6) {
      setErrorMsg("Enter the 6-digit code from your email.");
      return;
    }

    const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
    if (!clientId) {
      setErrorMsg("Auth is not configured. Please contact support.");
      return;
    }

    setPageState("verifying");
    setErrorMsg("");

    try {
      await verifyPasswordlessCode({
        email: meta.recipient_email,
        otp: code,
        clientId,
        audience: getAuth0ApiAudience(),
      });
      goToGiftOnboarding(meta);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "That code didn't work. Please try again."
      );
      setPageState("code_entry");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <BrandWordmark className={styles.brandHeader} />

        {pageState === "error" && <ErrorView message={errorMsg} />}
        {pageState === "activated" && (
          <AlreadyActivatedView isMigration={isMigration} />
        )}

        {(pageState === "loading" || pageState === "activating") && (
          <ActivatingView
            headline={
              pageState === "activating"
                ? isMigration
                  ? "Setting up your newsletter…"
                  : "Starting your trial…"
                : "Getting things ready…"
            }
            body={
              meta?.email_trusted_by_click
                ? "Your email is verified. Setting up your account."
                : meta
                ? "Preparing your sign-in."
                : undefined
            }
          />
        )}

        {(pageState === "code_entry" || pageState === "verifying") && meta && (
          <CodeEntryView
            email={meta.recipient_email}
            otp={otp}
            onOtpChange={setOtp}
            onSubmit={handleVerifyCode}
            onResend={() => handleSendCode(meta)}
            verifying={pageState === "verifying"}
            errorMsg={errorMsg}
            isMigration={isMigration}
          />
        )}
      </div>
    </div>
  );
}

/* ─── sub-views ─── */

function ActivatingView({
  headline,
  body,
}: {
  headline: string;
  body?: string;
}) {
  return (
    <div className={styles.center} style={{ gap: 14 }}>
      <Loader size="lg" color="purple" />
      <h1 className={styles.headline} style={{ fontSize: 20 }}>
        {headline}
      </h1>
      {body && <p className={styles.body}>{body}</p>}
    </div>
  );
}

function CodeEntryView({
  email,
  otp,
  onOtpChange,
  onSubmit,
  onResend,
  verifying,
  errorMsg,
  isMigration,
}: {
  email: string;
  otp: string;
  onOtpChange: (value: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  verifying: boolean;
  errorMsg: string;
  isMigration?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
      <h1 className={styles.headline}>Enter your code</h1>
      <p className={styles.body}>
        We emailed a 6-digit code to <strong>{email}</strong>. Enter it below to{" "}
        {isMigration ? "finish setting up your newsletter" : "start your trial"}.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <input
          className={styles.codeInput}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otp}
          onChange={(e) => onOtpChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••••"
          aria-label="6-digit sign-in code"
          autoFocus
          disabled={verifying}
        />

        {errorMsg && (
          <p className={styles.errorText} role="alert" style={{ fontSize: 13 }}>
            {errorMsg}
          </p>
        )}

        <button
          className={styles.primaryBtn}
          type="submit"
          disabled={verifying || otp.length < 6}
        >
          {verifying ? (
            <>
              <Loader size="sm" color="white" />
              Verifying…
            </>
          ) : isMigration ? (
            "Verify & continue →"
          ) : (
            "Verify & start my trial →"
          )}
        </button>
      </form>

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
          onClick={onResend}
          disabled={verifying}
        >
          resend the code
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

function AlreadyActivatedView({ isMigration }: { isMigration?: boolean }) {
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
      <h1 className={styles.headline}>
        {isMigration ? "You're already set up" : "Your trial is already active"}
      </h1>
      <p className={styles.body}>
        {isMigration
          ? "Your subscription is already active. Sign in to access your dashboard."
          : "You've already activated this gift. Sign in to access your dashboard."}
      </p>
      <Link href="/home" className={styles.primaryBtn}>
        Go to my dashboard &rarr;
      </Link>
    </div>
  );
}

/* ─── exported page ─── */

export default function GiftActivatePage() {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <div className={styles.card}>
            <div className={styles.center}>
              <Loader size="lg" color="purple" />
            </div>
          </div>
        </div>
      }
    >
      <GiftActivateInner />
    </Suspense>
  );
}
