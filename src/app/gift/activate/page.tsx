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

/* ─── helpers ─── */

/**
 * Validate that `next` is a same-origin relative path (or absolute same-host
 * URL). Returns the safe path or "" when it cannot be trusted.
 */
function safeParsedNext(raw: string | null): string {
  if (!raw) return "";
  // Allow only relative paths (no protocol) or fully qualified same-origin.
  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
    const url = new URL(raw);
    if (typeof window !== "undefined" && url.origin === window.location.origin) {
      return url.pathname + url.search + url.hash;
    }
  } catch {
    // Not a valid URL — treat as invalid
  }
  return "";
}

/* ─── inner page ─── */

type PageState =
  | "loading"
  | "activating"
  | "newsletter_confirm"
  | "code_entry"
  | "verifying"
  | "activated"
  | "error";

function GiftActivateInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t");
  const nextDest = safeParsedNext(searchParams.get("next"));

  const { isAuthenticated, isLoading: authLoading } = useAuth0();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [meta, setMeta] = useState<GiftMetaResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [otp, setOtp] = useState("");
  const activationStarted = useRef(false);

  const isMigration = meta?.kind === "substack_migration";
  const isGovernment = meta?.kind === "government";
  // Newsletter-link clicks (have a next dest but are not an explicit CTA) show
  // a confirm step explaining account activation before sending the OTP code.
  const isNewsletterClick = !!nextDest;

  const goAfterActivation = useCallback((giftMeta: GiftMetaResponse) => {
    if (!token) return;
    // Always route a freshly claimed account through /home so onboarding runs.
    // `nextDest` (the link the recipient actually clicked) rides along in the
    // onboarding context and /home hands off to it once onboarding finishes —
    // otherwise a gated content click would skip onboarding entirely.
    persistGiftOnboardingContext(
      giftMetaToOnboardingContext(token, giftMeta, nextDest)
    );
    window.location.href = "/home";
  }, [token, nextDest]);

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
        goAfterActivation(giftMeta);
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
    [goAfterActivation, handleSendCode, token]
  );

  // Already authenticated → home with gift onboarding context if present.
  useEffect(() => {
    if (authLoading || !meta) return;
    if (isAuthenticated) {
      goAfterActivation(meta);
    }
  }, [authLoading, isAuthenticated, meta, goAfterActivation]);

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
        persistGiftOnboardingContext(
          giftMetaToOnboardingContext(token, data, nextDest)
        );
        if (data.already_activated) {
          setPageState("activated");
          return;
        }

        // Newsletter-link clicks show a confirm step first so the user
        // understands they're about to claim their account before we
        // automatically send an OTP code.
        if (isNewsletterClick) {
          setPageState("newsletter_confirm");
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
  }, [token, nextDest, isNewsletterClick, handleSendCode, runTrustedActivation]);

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
      goAfterActivation(meta);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "That code didn't work. Please try again."
      );
      setPageState("code_entry");
    }
  };

  const handleNewsletterConfirmClaim = async () => {
    if (!meta) return;
    if (meta.requires_otp) {
      await handleSendCode(meta);
    } else {
      await runTrustedActivation(meta);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <BrandWordmark className={styles.brandHeader} />

        {pageState === "error" && <ErrorView message={errorMsg} />}
        {pageState === "activated" && (
          <AlreadyActivatedView isMigration={isMigration} isGovernment={isGovernment} nextDest={nextDest} />
        )}

        {(pageState === "loading" || pageState === "activating") && (
          <ActivatingView
            headline={
              pageState === "activating"
                ? isGovernment || isMigration
                  ? "Setting up your account…"
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

        {pageState === "newsletter_confirm" && meta && (
          <NewsletterConfirmView
            meta={meta}
            isGovernment={isGovernment}
            onClaim={handleNewsletterConfirmClaim}
            nextDest={nextDest}
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
            isGovernment={isGovernment}
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

/**
 * Shown when a newsletter link for an unclaimed account goes through /e/c.
 * Explains free government account (or newsletter subscription for others)
 * before we send the OTP code.
 */
function NewsletterConfirmView({
  meta,
  isGovernment,
  onClaim,
  nextDest,
}: {
  meta: GiftMetaResponse;
  isGovernment: boolean;
  onClaim: () => void;
  nextDest: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleClaim = async () => {
    setLoading(true);
    await onClaim();
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className={styles.iconWrap} aria-hidden="true">
        {isGovernment ? (
          /* Building / government icon */
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="22" x2="21" y2="22" />
            <line x1="6" y1="18" x2="6" y2="11" />
            <line x1="10" y1="18" x2="10" y2="11" />
            <line x1="14" y1="18" x2="14" y2="11" />
            <line x1="18" y1="18" x2="18" y2="11" />
            <polygon points="12 2 20 7 4 7" />
          </svg>
        ) : (
          /* Newsletter / envelope icon */
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        )}
      </div>

      <h1 className={styles.headline}>
        {isGovernment
          ? "Your district report is ready"
          : "Claim your account to continue"}
      </h1>

      <p className={styles.body}>
        {isGovernment ? (
          <>
            Every week, Seymour &mdash; our AI analyst &mdash; reads{" "}
            {meta.city_name ? `${meta.city_name}'s` : "your city's"} public data
            and writes a report focused on your district: what improved, what
            needs attention, how you compare to the rest of the city. Tell us
            your priorities once and it&apos;s framed around your promises to
            constituents.
            <br /><br />
            Your staff also get free research tools: ask in plain language, get
            sourced answers from city data &mdash; draft talking points, track
            service commitments, understand what&apos;s happening on the streets,
            at the MTA, in the planning pipeline.
          </>
        ) : (
          "You have a free subscription waiting. Claim it to get full access to your personalized briefing and all city data."
        )}
      </p>

      <div className={styles.emailRow}>
        <div>
          <span className={styles.emailLabel}>Sending code to</span>
          <span className={styles.emailAddress}>{meta.recipient_email}</span>
        </div>
      </div>

      <div className={styles.ctaArea}>
        <button
          className={styles.primaryBtn}
          onClick={handleClaim}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader size="sm" color="white" />
              Sending code…
            </>
          ) : (
            "Send my sign-in code →"
          )}
        </button>
        {nextDest && (
          <p className={styles.ctaHint}>
            We&apos;ll set up your account, then take you where you were headed.
          </p>
        )}
        {isGovernment && (
          <p className={styles.note} style={{ textAlign: "center" }}>
            Free for your office — no credit card, ever. Need more seats or custom
            research? Reply to any Seymour email.
          </p>
        )}
      </div>
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
  isGovernment,
}: {
  email: string;
  otp: string;
  onOtpChange: (value: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  verifying: boolean;
  errorMsg: string;
  isMigration?: boolean;
  isGovernment?: boolean;
}) {
  const actionLabel = isGovernment
    ? "access your government account"
    : isMigration
    ? "finish setting up your newsletter"
    : "start your trial";

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
        {actionLabel}.
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
          ) : isGovernment ? (
            "Verify & access my account →"
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

function AlreadyActivatedView({
  isMigration,
  isGovernment,
  nextDest,
}: {
  isMigration?: boolean;
  isGovernment?: boolean;
  nextDest?: string;
}) {
  const destination = nextDest || "/home";
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
        {isGovernment
          ? "Your government account is active"
          : isMigration
          ? "You're already set up"
          : "Your trial is already active"}
      </h1>
      <p className={styles.body}>
        {isGovernment
          ? "Your account is ready. Personalize it to get reports built around your district priorities and promises."
          : isMigration
          ? "Your subscription is already active. Sign in to access your dashboard."
          : "You've already activated this gift. Sign in to access your dashboard."}
      </p>
      <Link href={destination} className={styles.primaryBtn}>
        {nextDest ? "Continue to my briefing →" : "Go to my dashboard →"}
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
