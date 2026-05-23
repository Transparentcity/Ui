"use client";

import Link from "next/link";
import styles from "../get-landing.module.css";

type Props = {
  slug: string;
  /** Public edition short hash (city newsletter archive). */
  shortHash?: string;
  district?: number;
  editionDate?: string;
  /** Allowlisted pending newsletter id (personalized marketing sample). */
  featuredPendingId?: number;
  captionLabel?: string;
};

export default function HeroNewsletterEmbed({
  slug,
  shortHash,
  district = 0,
  editionDate,
  featuredPendingId,
  captionLabel,
}: Props) {
  const embedSrc = featuredPendingId
    ? `/get/${slug}/featured/${featuredPendingId}/embed`
    : `/c/${slug}/newsletter/${shortHash}/embed`;
  const fullHref = featuredPendingId
    ? embedSrc
    : `/c/${slug}/newsletter/${shortHash}`;

  const dateStr = editionDate
    ? new Date(editionDate).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  const label =
    captionLabel ??
    (district > 0 ? `District ${district} · ${dateStr}` : `Citywide · ${dateStr}`);

  return (
    <div className={styles.newsletterFrameWrapper}>
      <div className={styles.newsletterFrame}>
        <iframe
          src={embedSrc}
          title={`Sample weekly briefing — ${label}`}
          loading="lazy"
          className={styles.newsletterIframe}
          scrolling="yes"
        />
      </div>
      <div className={styles.newsletterFrameCaption}>
        <span className={styles.newsletterFrameLabel}>Sample issue: {label}</span>
        <Link href={fullHref} className={styles.newsletterFrameLink} target="_blank" rel="noopener">
          {featuredPendingId ? "Open sample →" : "Read full issue →"}
        </Link>
      </div>
    </div>
  );
}
