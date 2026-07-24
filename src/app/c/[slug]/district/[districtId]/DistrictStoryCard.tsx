"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";
import CardActionBar from "@/components/feed/CardActionBar";
import { improveGenericHeadline } from "@/lib/feed/headlineCleanup";
import styles from "@/components/feed/feed.module.css";

interface DistrictStoryCardProps {
  headline: string;
  description?: string | null;
  href: string;
  cityName: string;
  district: number;
  locationLabel?: string;
}

export default function DistrictStoryCard({
  headline,
  description,
  href,
  cityName,
  district,
  locationLabel,
}: DistrictStoryCardProps) {
  const router = useRouter();
  const cleanedHeadline = improveGenericHeadline(headline, { description });

  const handleClick = useCallback(() => {
    router.push(href);
  }, [router, href]);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}${href}`;
    if (typeof navigator.share === "function") {
      navigator.share({ title: cleanedHeadline, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(
        () => toast.success("Link copied to clipboard"),
        () => toast.error("Could not copy link"),
      );
    }
  }, [href, cleanedHeadline]);

  return (
    <article
      className={styles.card}
      onClick={handleClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <span className={styles.cardActor}>Story</span>
        </div>
        <div className={styles.cardHeaderRight}>
          <span className={styles.cardHeaderNeighborhoodText}>
            {locationLabel ?? `${cityName} District ${district}`}
          </span>
        </div>
      </div>
      <h2 className={styles.cardHeadline}>{cleanedHeadline}</h2>
      {description && (
        <p className={styles.cardDescription}>{description}</p>
      )}
      <span className={styles.readMore}>Read story →</span>
      <CardActionBar onShare={handleShare} showOverflow={false} />
    </article>
  );
}
