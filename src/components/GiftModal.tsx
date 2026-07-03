"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { sendGift } from "@/lib/apiClient";
import CityTypeahead from "./CityTypeahead";
import authStyles from "./AuthModal.module.css";
import styles from "./GiftModal.module.css";

interface GiftModalProps {
  giftsRemaining: number;
  isAdmin?: boolean;
  onClose: () => void;
  onGiftSent: (giftsRemaining: number) => void;
}

type ModalState = "idle" | "submitting" | "success" | "error";

export default function GiftModal({ giftsRemaining, isAdmin = false, onClose, onGiftSent }: GiftModalProps) {
  const { getAccessTokenSilently } = useAuth0();

  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [cityId, setCityId] = useState<number | null>(null);
  const [placeLabel, setPlaceLabel] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");

  const [modalState, setModalState] = useState<ModalState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successEmail, setSuccessEmail] = useState("");
  const [successRemaining, setSuccessRemaining] = useState(0);

  const resetForm = () => {
    setRecipientName("");
    setRecipientEmail("");
    setCityId(null);
    setPlaceLabel("");
    setCoords(null);
    setCustomPrompt("");
    setErrorMsg("");
    setModalState("idle");
  };

  const handleCitySelect = (selectedCityId: number) => {
    setCityId(selectedCityId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityId) {
      setErrorMsg("Please choose a city or neighbourhood.");
      setModalState("error");
      return;
    }
    if (!recipientEmail.trim()) {
      setErrorMsg("Please enter your friend's email address.");
      setModalState("error");
      return;
    }

    setModalState("submitting");
    setErrorMsg("");

    try {
      const token = await getAccessTokenSilently();
      const result = await sendGift(token, {
        recipient_email: recipientEmail.trim(),
        recipient_name: recipientName.trim() || null,
        city_id: cityId,
        place_label: placeLabel || "their city",
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        custom_prompt: customPrompt.trim() || null,
      });

      setSuccessEmail(recipientEmail.trim());
      setSuccessRemaining(result.gifts_remaining);
      setModalState("success");
      onGiftSent(result.gifts_remaining);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setErrorMsg(msg);
      setModalState("error");
    }
  };

  const currentGiftsRemaining = modalState === "success" ? successRemaining : giftsRemaining;

  const content = (
    <div
      className={authStyles.overlay}
      style={{ zIndex: 10010 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Send a gift subscription"
    >
      <div
        className={`${authStyles.modal} ${styles.modal}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <div className={styles.closeRow}>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {modalState === "success" ? (
          /* ── Success state ── */
          <div className={styles.successContent}>
            <div className={styles.successIconWrap} aria-hidden="true">
              <svg
                className={styles.successCheck}
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

            <h2 className={styles.successHeadline}>Free trial sent!</h2>

            <p className={styles.successBody}>
              We&rsquo;ve sent <strong>{successEmail}</strong> a free
              transparent.city trial. When they click through, they&rsquo;ll
              activate their subscription and start receiving their weekly
              briefing.
            </p>

            {successRemaining > 0 && (
              <p className={styles.giftCountNote}>
                You have{" "}
                <strong>
                  {successRemaining}{" "}
                  {successRemaining === 1 ? "gift" : "gifts"}
                </strong>{" "}
                remaining.
              </p>
            )}

            <div className={styles.successActions}>
              {successRemaining > 0 && (
                <button
                  type="button"
                  className={`${authStyles.button} ${authStyles.buttonOutline}`}
                  onClick={resetForm}
                >
                  Send another trial
                </button>
              )}
              <button
                type="button"
                className={`${authStyles.button} ${authStyles.buttonPrimary}`}
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── Form state ── */
          <div className={styles.formContent}>
            <div className={styles.formHeader}>
              <h2 className={styles.formTitle}>Gift a free trial subscription</h2>
              <p className={styles.formSubtitle}>
                Your friend gets a free transparent.city trial &mdash; a weekly
                AI briefing and personal dashboard powered by public records.{" "}
                <span className={styles.remaining}>
                  {currentGiftsRemaining === 1
                    ? "1 gift remaining."
                    : `${currentGiftsRemaining} gifts remaining.`}
                </span>
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className={styles.fields}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="gift-name">
                    Friend&rsquo;s name{" "}
                    <span className={styles.optional}>(optional)</span>
                  </label>
                  <input
                    id="gift-name"
                    type="text"
                    className={styles.input}
                    placeholder="What's their name?"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    maxLength={255}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="gift-email">
                    Email address <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="gift-email"
                    type="email"
                    className={styles.input}
                    placeholder="friend@example.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>
                    Starting location <span className={styles.required}>*</span>
                  </label>
                  <p className={styles.fieldHint}>
                    City, neighbourhood, or address. They&rsquo;ll be able to
                    refine this when they activate their subscription.
                  </p>
                  <div className={styles.typeaheadWrapper}>
                    <CityTypeahead
                      onCitySelect={handleCitySelect}
                      onPlaceLabelChange={setPlaceLabel}
                      onCoordinatesChange={setCoords}
                      placeholder="e.g. Mission District, San Francisco"
                      onGPSLocation={(loc) => {
                        if (loc) setCoords(loc);
                      }}
                    />
                  </div>
                </div>

                {isAdmin && (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="gift-custom-prompt">
                      Personalized prompt{" "}
                      <span className={styles.optional}>(admin only)</span>
                    </label>
                    <p className={styles.fieldHint}>
                      Added to Seymour&rsquo;s weekly briefing for this recipient. E.g. &ldquo;Focus on school board decisions and park safety.&rdquo;
                    </p>
                    <textarea
                      id="gift-custom-prompt"
                      className={styles.textarea}
                      placeholder="Optional focus or emphasis for their weekly newsletter…"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      maxLength={2000}
                      rows={3}
                    />
                  </div>
                )}

                {modalState === "error" && errorMsg && (
                  <p className={styles.errorMsg} role="alert">
                    {errorMsg}
                  </p>
                )}
              </div>

              <div className={authStyles.actions}>
                <button
                  type="button"
                  className={`${authStyles.button} ${authStyles.buttonOutline}`}
                  onClick={onClose}
                  disabled={modalState === "submitting"}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`${authStyles.button} ${authStyles.buttonPrimary}`}
                  disabled={
                    modalState === "submitting" || !cityId || !recipientEmail.trim()
                  }
                >
                  {modalState === "submitting" ? "Sending…" : "Send free trial →"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
