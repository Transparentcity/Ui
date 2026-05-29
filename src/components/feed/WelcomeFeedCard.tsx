"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import styles from "./WelcomeFeedCard.module.css";

export type WelcomeNewsletterLink = {
  shortHash: string;
  editionDate: string;
};

type Props = {
  slug: string;
  newsletters: WelcomeNewsletterLink[];
};

const STORAGE_KEY = "tc:welcome-feed-card-dismissed";

function formatEditionDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function WelcomeFeedCard({ slug, newsletters }: Props) {
  const { isAuthenticated, isLoading } = useAuth0();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [animatingOut, setAnimatingOut] = useState(false);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    return () => {
      if (animTimer.current) clearTimeout(animTimer.current);
    };
  }, []);

  if (isLoading || !isAuthenticated) return null;
  if (dismissed === null || dismissed) return null;

  const handleDismiss = () => {
    if (animatingOut) return;
    setAnimatingOut(true);
    animTimer.current = setTimeout(() => {
      setDismissed(true);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, "1");
      }
    }, 250);
  };

  const className = animatingOut
    ? `${styles.card} ${styles.dismissing}`
    : styles.card;

  return (
    <div className={className} role="region" aria-label="Welcome">
      <button
        type="button"
        className={styles.dismissBtn}
        onClick={handleDismiss}
        aria-label="Dismiss welcome card"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M1 1l12 12M13 1L1 13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <h3 className={styles.heading}>Welcome to your feed</h3>
      <p className={styles.body}>
        These are the stories shaping your Sunday newsletter. The more you read here,
        the better we get at picking what lands in your inbox.
      </p>

      {newsletters.length > 0 && (
        <>
          <p className={styles.linkLabel}>
            Catch up on the last {newsletters.length === 1 ? "" : `${newsletters.length} `}
            city-wide newsletter{newsletters.length === 1 ? "" : "s"}
          </p>
          <ul className={styles.linkList}>
            {newsletters.map((n) => (
              <li key={n.shortHash} className={styles.linkItem}>
                <a href={`/c/${slug}/newsletter/${n.shortHash}`}>
                  {formatEditionDate(n.editionDate)} newsletter
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
