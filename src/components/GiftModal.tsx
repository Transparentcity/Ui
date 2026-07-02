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
  onClose: () => void;
  onGiftSent: (giftsRemaining: number) => void;
}

type ModalState = "idle" | "submitting" | "success" | "error";

export default function GiftModal({ giftsRemaining, onClose, onGiftSent }: GiftModalProps) {
  const { getAccessTokenSilently } = useAuth0();

  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [cityId, setCityId] = useState<number | null>(null);
  const [placeLabel, setPlaceLabel] = useState("");

  const [modalState, setModalState] = useState<ModalState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successEmail, setSuccessEmail] = useState("");
  const [successPlaceLabel, setSuccessPlaceLabel] = useState("");
  const [successRemaining, setSuccessRemaining] = useState(0);

  const handleCitySelect = (selectedCityId: number) => {
    setCityId(selectedCityId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityId) {
      setErrorMsg("Please select a location for your friend.");
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
      });

      setSuccessEmail(recipientEmail.trim());
      setSuccessPlaceLabel(placeLabel || "their city");
      setSuccessRemaining(result.gifts_remaining);
      setModalState("success");
      onGiftSent(result.gifts_remaining);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      setErrorMsg(msg);
      setModalState("error");
    }
  };

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
        className={authStyles.modal}
        style={{ maxWidth: 440, overflow: "visible" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={authStyles.header}>
          <h2 className={authStyles.title}>
            {modalState === "success" ? "🎁 Gift sent!" : "Give the gift of transparency"}
          </h2>
          <button
            type="button"
            className={authStyles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {modalState === "success" ? (
          <>
            <p className={authStyles.subtitle}>
              <strong>{successEmail}</strong> will receive a welcome email about{" "}
              <strong>{successPlaceLabel}</strong>. Their personal dashboard and weekly
              neighbourhood letter are on their way.
            </p>
            {successRemaining > 0 && (
              <p className={authStyles.subtitle} style={{ marginTop: 0 }}>
                You have <strong>{successRemaining}</strong> gift
                {successRemaining === 1 ? "" : "s"} remaining.
              </p>
            )}
            <div className={authStyles.actions}>
              <button
                type="button"
                className={`${authStyles.button} ${authStyles.buttonPrimary}`}
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={authStyles.subtitle}>
              Your friend gets a personal dashboard and weekly letter about their
              neighbourhood.{" "}
              <span className={styles.remaining}>
                {giftsRemaining === 1 ? "1 gift remaining." : `${giftsRemaining} gifts remaining.`}
              </span>
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <div className={styles.fields}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="gift-name">
                    Friend&rsquo;s name <span className={styles.optional}>(optional)</span>
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
                    Their location <span className={styles.required}>*</span>
                  </label>
                  <p className={styles.fieldHint}>
                    Enter their address, intersection, neighbourhood, city, or zip code.
                  </p>
                  <div className={styles.typeaheadWrapper}>
                    <CityTypeahead
                      onCitySelect={handleCitySelect}
                      onPlaceLabelChange={setPlaceLabel}
                      placeholder="e.g. Valencia St & 24th, San Francisco"
                      onGPSLocation={(loc) => {
                        void loc;
                      }}
                    />
                  </div>
                </div>

                {(modalState === "error") && errorMsg && (
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
                  disabled={modalState === "submitting" || !cityId || !recipientEmail.trim()}
                >
                  {modalState === "submitting" ? "Sending…" : "Send gift 🎁"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
