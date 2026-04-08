"use client";

import { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGovernmentVerificationStatus,
  sendGovernmentVerificationCode,
  verifyGovernmentCode,
  updateUserPreferences,
  listLeadersForClaim,
  createClaim,
  followRepresentative,
  type ClaimContext,
  type LeaderForClaim,
} from "@/lib/apiClient";
import styles from "./WelcomeModal.module.css";
import Loader from "./Loader";

export interface GovernmentOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  /** Claim context from signup (e.g. from URL or user metadata). */
  claimContext: ClaimContext | null | undefined;
}

type Step = "confirm-profile" | "government-email" | "enter-code" | "success";

export default function GovernmentOnboardingModal({
  isOpen,
  onClose,
  onComplete,
  claimContext,
}: GovernmentOnboardingModalProps) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("confirm-profile");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile confirmation (when we have city_id + district)
  const [leader, setLeader] = useState<LeaderForClaim | null>(null);
  const [leaderLoading, setLeaderLoading] = useState(false);

  // Government email verification
  const [governmentEmail, setGovernmentEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const hasClaimContext =
    claimContext &&
    claimContext.city_id != null &&
    claimContext.district != null;

  // Load leader when we have claim context
  useEffect(() => {
    if (!isOpen || !hasClaimContext || !claimContext?.city_id) return;
    let cancelled = false;
    setLeaderLoading(true);
    setLeader(null);
    listLeadersForClaim(claimContext.city_id)
      .then((list) => {
        if (cancelled) return;
        const district = claimContext.district ?? 0;
        const match = list.find((l) => (l.district ?? 0) === district);
        setLeader(match ?? null);
      })
      .catch(() => {
        if (!cancelled) setLeader(null);
      })
      .finally(() => {
        if (!cancelled) setLeaderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, hasClaimContext, claimContext?.city_id, claimContext?.district]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(hasClaimContext ? "confirm-profile" : "government-email");
      setGovernmentEmail("");
      setCode("");
      setCodeSentTo(null);
      setDevCode(null);
      setError(null);
    }
  }, [isOpen, hasClaimContext]);

  const handleSkip = () => {
    // Dismiss for this session only — don't mark onboarding complete
    // so the modal re-appears on future sign-ins until verification is done.
    onClose();
  };

  const handleConfirmProfileYes = () => {
    setError(null);
    setStep("government-email");
  };

  const handleSendCode = async () => {
    const email = governmentEmail.trim();
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setError(null);
    setDevCode(null);
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await sendGovernmentVerificationCode(email, token);
      setCodeSentTo(email);
      if (res.dev_code) {
        setDevCode(res.dev_code);
        setCode(res.dev_code);
      } else {
        setCode("");
      }
      setStep("enter-code");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : "Failed to send code. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    const trimmed = code.replace(/\D/g, "").slice(0, 6);
    if (trimmed.length !== 6) {
      setError("Please enter the 6-digit code from your email.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      await verifyGovernmentCode(trimmed, token);
      setStep("success");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : "Invalid or expired code. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessFinish = async () => {
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const cityId = claimContext?.city_id;
      // If we have a leader and city, create claim
      if (leader && cityId != null) {
        try {
          await createClaim(leader.id, token);
        } catch {
          // Claim might already exist; ignore
        }
      }
      // Add district to My Districts when we have city+district (from leader or claim context)
      if (cityId != null && (claimContext?.district != null || leader?.district != null)) {
        const districtStr = String(leader?.district ?? claimContext?.district ?? "0");
        try {
          await followRepresentative(cityId, districtStr, token);
          queryClient.invalidateQueries({ queryKey: ["cities", "savedDistricts"] });
        } catch {
          // Follow might fail if table missing or already followed; don't block completion
        }
      }
      await updateUserPreferences({ has_completed_onboarding: true }, token);
      onComplete();
      onClose();
    } catch {
      onComplete();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const steps: Step[] = hasClaimContext
    ? ["confirm-profile", "government-email", "enter-code", "success"]
    : ["government-email", "enter-code", "success"];
  const currentStepIndex = steps.indexOf(step);

  return (
    <div className={styles.overlay} onClick={handleSkip}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.closeButton}
          onClick={handleSkip}
          title="Close"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className={styles.stepIndicator}>
          {steps.map((s, i) => (
            <div
              key={s}
              className={`${styles.stepDot} ${i === currentStepIndex ? styles.stepDotActive : ""} ${i < currentStepIndex ? styles.stepDotComplete : ""}`}
            />
          ))}
        </div>

        {/* Confirm profile (only when we have claim context and a leader) */}
        {step === "confirm-profile" && hasClaimContext && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Confirm your profile</h2>
            <p className={styles.stepDescription}>
              You started from a claim link. Is this the official profile you’re claiming?
            </p>
            {leaderLoading ? (
              <Loader size="lg" color="purple" />
            ) : leader ? (
              <div className={styles.leadersContainer}>
                <div className={styles.leaderCard}>
                  <div className={styles.leaderName}>{leader.name}</div>
                  <div className={styles.leaderTitle}>{leader.title}</div>
                  {leader.district != null && leader.district !== 0 && (
                    <div className={styles.leaderDistrict}>District {leader.district}</div>
                  )}
                </div>
              </div>
            ) : (
              <p className={styles.stepDescription}>
                We couldn’t load the official for this district. You can still verify your government email and claim from the claim page later.
              </p>
            )}
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleConfirmProfileYes}
                disabled={leaderLoading}
              >
                Yes, that’s me
              </button>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => setStep("government-email")}
              >
                No, I’ll choose later
              </button>
            </div>
          </div>
        )}

        {/* Email verification (any email; verification is manual) */}
        {step === "government-email" && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Verify your government email</h2>
            <p className={styles.stepDescription}>
              Enter your government email so we can confirm your role. We&apos;ll send a code to verify you have access.
            </p>
            <p className={styles.stepDescription} style={{ marginTop: 0, fontSize: 12, color: "var(--text-tertiary, #9ca3af)" }}>
              Don&apos;t have a .gov address? Enter the email your office uses and our team will verify manually.
            </p>
            <div className={styles.locationSection}>
              <div className={styles.inputGroup}>
                <input
                  type="email"
                  className={styles.input}
                  placeholder="you@example.com"
                  value={governmentEmail}
                  onChange={(e) => setGovernmentEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                  disabled={loading}
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 8, border: "1px solid var(--border-primary)" }}
                />
              </div>
              {error && <div className={styles.error}>{error}</div>}
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSendCode}
                disabled={loading || !governmentEmail.trim()}
              >
                {loading ? (
                  <span className={styles.buttonLoader}>
                    <Loader size="sm" color="white" />
                  </span>
                ) : (
                  "Send verification code"
                )}
              </button>
            </div>
            {hasClaimContext && (
              <button type="button" className={styles.backButton} onClick={() => setStep("confirm-profile")}>
                Back
              </button>
            )}
          </div>
        )}

        {/* Enter code */}
        {step === "enter-code" && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Enter verification code</h2>
            <p className={styles.stepDescription}>
              {devCode
                ? "Email delivery is not configured. Use the code below."
                : `We sent a 6-digit code to ${codeSentTo ?? "your email"}.`}
            </p>
            {devCode && (
              <p className={styles.stepDescription} style={{ marginTop: 8, fontWeight: 600 }}>
                Your code: {devCode}
              </p>
            )}
            <div className={styles.locationSection}>
              <div className={styles.inputGroup}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className={styles.input}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
                  disabled={loading}
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 8, border: "1px solid var(--border-primary)", letterSpacing: 4, textAlign: "center" }}
                />
              </div>
              {error && <div className={styles.error}>{error}</div>}
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleVerifyCode}
                disabled={loading || code.replace(/\D/g, "").length !== 6}
              >
                {loading ? (
                  <span className={styles.buttonLoader}>
                    <Loader size="sm" color="white" />
                  </span>
                ) : (
                  "Verify"
                )}
              </button>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => {
                  setCode("");
                  setError(null);
                  handleSendCode();
                }}
                disabled={loading}
              >
                Resend code
              </button>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => setStep("government-email")}
                disabled={loading}
              >
                Use a different email
              </button>
            </div>
          </div>
        )}

        {/* Success (submitted for manual verification) */}
        {step === "success" && (
          <div className={styles.stepContent}>
            <div className={styles.successIcon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 className={styles.stepTitle}>Submitted for verification</h2>
            <p className={styles.stepDescription}>
              We&apos;ll verify your email and notify you once approved. You can claim your official profile from your district page anytime.
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSuccessFinish}
              disabled={loading}
            >
              {loading ? (
                <span className={styles.buttonLoader}>
                  <Loader size="sm" color="white" />
                </span>
              ) : (
                "Continue to dashboard"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
