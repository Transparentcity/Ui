"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { resolveOutboundCanonicalPath } from "@/lib/feed/canonicalUrl";
import { useTrackFeedEngagement } from "@/lib/hooks/useFeed";
import CardActionBar from "./CardActionBar";
import CompactCardActionBar from "./CompactCardActionBar";
import OverflowMenu from "./OverflowMenu";
import TextOnlyCard from "./templates/TextOnlyCard";
import TextChartCard from "./templates/TextChartCard";
import MultiMetricCard from "./templates/MultiMetricCard";
import AlertCard from "./templates/AlertCard";
import SpendingCard from "./templates/SpendingCard";
import OffTheChartsCard from "./templates/OffTheChartsCard";
import PhotoCard from "./templates/PhotoCard";
import CompactCard from "./templates/CompactCard";
import { useIsMobile } from "./useIsMobile";
import styles from "./feed.module.css";

interface FeedCardProps {
  story: EnrichedFeedStory;
  isAdmin?: boolean;
  onHide: (storyId: number) => void;
  onDelete?: (storyId: number) => void;
  /** @deprecated previewMode is no longer used; feed-preview routes have been removed */
  previewMode?: boolean;
  compact?: boolean;
  /**
   * When set, open the story in the in-app feed detail surface instead of
   * navigating away from the feed.
   */
  onOpenFeedDetail?: (story: EnrichedFeedStory) => void;
}

export default function FeedCard({
  story,
  isAdmin,
  onHide,
  onDelete,
  compact,
  onOpenFeedDetail,
}: FeedCardProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const trackEngagement = useTrackFeedEngagement();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [hiding, setHiding] = useState(false);

  // Close overflow when clicking outside (desktop)
  useEffect(() => {
    if (!overflowOpen || isMobile) return;
    const handler = () => setOverflowOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [overflowOpen, isMobile]);

  const handleCardClick = useCallback(() => {
    // Don't navigate when an overlay is open
    if (overflowOpen) return;
    trackEngagement.mutate({ storyId: story.id, action: "click" });
    if (onOpenFeedDetail) {
      onOpenFeedDetail(story);
      return;
    }
    router.push(story.canonical_url);
  }, [
    router,
    story,
    onOpenFeedDetail,
    overflowOpen,
    trackEngagement,
  ]);

  const handleShare = useCallback(() => {
    trackEngagement.mutate({ storyId: story.id, action: "share" });
    const path = resolveOutboundCanonicalPath(story);
    const url = `${window.location.origin}${path}`;

    if (typeof navigator.share === "function") {
      navigator.share({ title: story.headline, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(
        () => toast.success("Link copied to clipboard"),
        () => toast.error("Could not copy link"),
      );
    }
  }, [story, trackEngagement]);

  const handleHide = useCallback(() => {
    setHiding(true);
    // Wait for animation to finish before removing from list
    setTimeout(() => onHide(story.id), 300);
    toast("Hidden. You\u2019ll see fewer like this.", {
      action: {
        label: "Undo",
        onClick: () => {
          // Undo is handled by parent re-adding the story
          onHide(-story.id); // negative = undo signal
        },
      },
    });
  }, [story.id, onHide]);

  const handleDelete = isAdmin
    ? () => onDelete?.(story.id)
    : undefined;

  const cardClassName = [
    styles.card,
    compact ? styles.cardCompact : "",
    story.card_type === "off_the_charts" ? styles.cardOffTheCharts : "",
    hiding ? styles.cardHiding : "",
    overflowOpen ? styles.cardMenuOpen : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Choose template — card_type overrides take priority for redesigned types.
  // Trend and safety stories with a percentage in the headline get AlertCard
  // so they show the metric hero instead of a bare headline.
  const headlineHasPct = /\d+(\.\d+)?%/.test(story.headline ?? "");
  const trendWithData =
    (story.card_type === "trend" || story.card_type === "safety") &&
    (headlineHasPct || story.metadata?.pct_change != null);

  // Determine which template to use and any variant props
  const isTextPhoto = story.template === "text_photo" && story.card_type !== "311_images";
  const Template =
    story.card_type === "alert" || trendWithData
      ? AlertCard
      : story.card_type === "spending"
        ? SpendingCard
        : story.card_type === "off_the_charts" || story.card_type === "milestone"
          ? OffTheChartsCard
          : story.card_type === "311_images" || isTextPhoto
            ? PhotoCard
            : story.card_type === "comparison" || story.template === "multi_metric"
              ? MultiMetricCard
              : story.template === "text_chart"
                ? TextChartCard
                : TextOnlyCard;
  // PhotoCard variant: "generic" for text_photo stories, "311" (default) for 311_images
  const photoVariant = isTextPhoto ? "generic" as const : undefined;

  const actionBar = compact ? (
    <CompactCardActionBar
      onOverflow={() => setOverflowOpen((o) => !o)}
    />
  ) : (
    <CardActionBar
      onShare={handleShare}
      onOverflow={() => setOverflowOpen((o) => !o)}
    />
  );

  return (
    <article className={cardClassName} onClick={handleCardClick} role="link" tabIndex={0} onKeyDown={(e) => { const tag = (e.target as HTMLElement).tagName; if (tag === "TEXTAREA" || tag === "INPUT") return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCardClick(); } }}>
      {compact ? (
        <CompactCard story={story}>{actionBar}</CompactCard>
      ) : Template === PhotoCard ? (
        <PhotoCard story={story} variant={photoVariant}>{actionBar}</PhotoCard>
      ) : (
        <Template story={story}>{actionBar}</Template>
      )}

      {/* Overflow menu anchor (positioned relative to action bar ···) */}
      <div className={styles.overflowAnchor} style={{ position: "absolute", right: 16, bottom: 16 }}>
        <OverflowMenu
          open={overflowOpen}
          onClose={() => setOverflowOpen(false)}
          onShare={handleShare}
          onHide={handleHide}
          onDelete={handleDelete}
          mobile={isMobile}
        />
      </div>
    </article>
  );
}
