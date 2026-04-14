"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MetricCardData } from "./templates/MetricSummaryCard";
import MetricSummaryCard from "./templates/MetricSummaryCard";
import CardActionBar from "./CardActionBar";
import OverflowMenu from "./OverflowMenu";
import { useIsMobile } from "./useIsMobile";
import styles from "./feed.module.css";

interface MetricFeedCardProps {
  data: MetricCardData;
  onHide?: (metricId: number) => void;
  /** Hide share button and overflow menu (used on public landing page) */
  hideActions?: boolean;
}

const noop = () => {};

export default function MetricFeedCard({ data, onHide = noop, hideActions = false }: MetricFeedCardProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [hiding, setHiding] = useState(false);

  const metricId = data.metric.id;
  const href = `/c/${data.slug}/metrics/${data.metric.metric_key}`;

  // Close overflow when clicking outside (desktop)
  useEffect(() => {
    if (!overflowOpen || isMobile) return;
    const handler = () => setOverflowOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [overflowOpen, isMobile]);

  const handleCardClick = useCallback(() => {
    if (overflowOpen) return;
    router.push(href);
  }, [router, href, overflowOpen]);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}${href}`;
    if (typeof navigator.share === "function") {
      navigator.share({ title: data.metric.metric_name, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(
        () => toast.success("Link copied to clipboard"),
        () => toast.error("Could not copy link"),
      );
    }
  }, [href, data.metric.metric_name]);

  const handleHide = useCallback(() => {
    setHiding(true);
    setTimeout(() => onHide(metricId), 300);
    toast("Hidden. You\u2019ll see fewer like this.", {
      action: {
        label: "Undo",
        onClick: () => {
          onHide(-metricId); // negative = undo signal
        },
      },
    });
  }, [metricId, onHide]);

  const cardClassName = [
    styles.card,
    hiding ? styles.cardHiding : "",
    overflowOpen ? styles.cardMenuOpen : "",
  ]
    .filter(Boolean)
    .join(" ");

  const actionBar = hideActions ? null : (
    <CardActionBar
      onShare={handleShare}
      onOverflow={() => setOverflowOpen((o) => !o)}
    />
  );

  return (
    <article
      className={cardClassName}
      onClick={handleCardClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "TEXTAREA" || tag === "INPUT") return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <MetricSummaryCard data={data}>{actionBar}</MetricSummaryCard>

      {!hideActions && (
        <div className={styles.overflowAnchor} style={{ position: "absolute", right: 16, bottom: 16 }}>
          <OverflowMenu
            open={overflowOpen}
            onClose={() => setOverflowOpen(false)}
            onShare={handleShare}
            onHide={handleHide}
            mobile={isMobile}
          />
        </div>
      )}
    </article>
  );
}
