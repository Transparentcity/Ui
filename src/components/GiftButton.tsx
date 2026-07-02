"use client";

import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { getMyGifts } from "@/lib/apiClient";
import GiftModal from "./GiftModal";
import styles from "./GiftButton.module.css";

const MAX_GIFTS = 2;

export default function GiftButton() {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [giftsRemaining, setGiftsRemaining] = useState<number | null>(null);
  const [isGiftRecipient, setIsGiftRecipient] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => getMyGifts(token))
      .then((gifts) => {
        if (cancelled) return;
        setGiftsRemaining(MAX_GIFTS - gifts.length);
      })
      .catch(() => {
        // Could be a gift recipient (403) — hide button gracefully
        if (!cancelled) setIsGiftRecipient(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessTokenSilently]);

  const handleGiftSent = (remaining: number) => {
    setGiftsRemaining(remaining);
    if (remaining <= 0) setModalOpen(false);
  };

  if (!isAuthenticated || isGiftRecipient || giftsRemaining === 0) return null;

  return (
    <>
      <button
        className={styles.giftBtn}
        onClick={() => setModalOpen(true)}
        aria-label={`Send a gift subscription. ${giftsRemaining ?? MAX_GIFTS} remaining.`}
        title="Send a gift subscription"
      >
        <GiftIcon />
      </button>

      {modalOpen && (
        <GiftModal
          giftsRemaining={giftsRemaining ?? MAX_GIFTS}
          onClose={() => setModalOpen(false)}
          onGiftSent={handleGiftSent}
        />
      )}
    </>
  );
}

function GiftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Box body */}
      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      {/* Lid */}
      <rect x="2" y="7" width="20" height="4" rx="1" stroke="currentColor" strokeWidth="2" />
      {/* Vertical ribbon */}
      <line x1="12" y1="7" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
      {/* Bow left */}
      <path
        d="M12 7C12 7 9 4 7 5C5 6 6 8 7 8C9 8 12 7 12 7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Bow right */}
      <path
        d="M12 7C12 7 15 4 17 5C19 6 18 8 17 8C15 8 12 7 12 7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
