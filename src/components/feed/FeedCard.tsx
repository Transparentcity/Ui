"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { useTrackFeedEngagement } from "@/lib/hooks/useFeed";
import { applaudStory, escalateStory } from "@/lib/apiClient";
import { useAuth0 } from "@auth0/auth0-react";
import CardActionBar from "./CardActionBar";
import CompactCardActionBar from "./CompactCardActionBar";
import OverflowMenu from "./OverflowMenu";
import EscalateSheet from "./EscalateSheet";
import TextOnlyCard from "./templates/TextOnlyCard";
import TextChartCard from "./templates/TextChartCard";
import TextPhotoCard from "./templates/TextPhotoCard";
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
}

export default function FeedCard({ story, isAdmin, onHide, onDelete, compact }: FeedCardProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { getAccessTokenSilently } = useAuth0();
  const trackEngagement = useTrackFeedEngagement();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [localEscalateCount, setLocalEscalateCount] = useState(story.escalate_count);

  // Close overflow when clicking outside (desktop)
  useEffect(() => {
    if (!overflowOpen || isMobile) return;
    const handler = () => setOverflowOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [overflowOpen, isMobile]);

  const handleCardClick = useCallback(() => {
    // Don't navigate when an overlay is open
    if (overflowOpen || escalateOpen) return;
    trackEngagement.mutate({ storyId: story.id, action: "click" });
    router.push(`/feed/${story.id}`);
  }, [router, story.id, overflowOpen, escalateOpen, trackEngagement]);

  const handleApplaud = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      await applaudStory(story.id, token);
    } catch {
      // Fire-and-forget; the optimistic UI update in CardActionBar handles display
    }
  }, [story.id, getAccessTokenSilently]);

  const handleEscalate = useCallback(() => {
    setEscalateOpen(true);
  }, []);

  const handleEscalateSend = useCallback(async (comment: string, includeName: boolean) => {
    setLocalEscalateCount((c) => c + 1);
    try {
      const token = await getAccessTokenSilently();
      await escalateStory(story.id, token, comment, includeName);
    } catch {
      // Roll back optimistic update on failure
      setLocalEscalateCount((c) => Math.max(0, c - 1));
      toast.error("Could not submit flag. Please try again.");
    }
  }, [story.id, getAccessTokenSilently]);

  const handleShare = useCallback(() => {
    trackEngagement.mutate({ storyId: story.id, action: "share" });
    const url = `${window.location.origin}/feed/${story.id}`;

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

  // Choose template — card_type overrides take priority for redesigned types
  const Template =
    story.card_type === "alert"
      ? AlertCard
      : story.card_type === "spending"
        ? SpendingCard
        : story.card_type === "off_the_charts"
          ? OffTheChartsCard
          : story.card_type === "311_images"
            ? PhotoCard
            : story.template === "multi_metric"
              ? MultiMetricCard
              : story.template === "text_chart"
                ? TextChartCard
                : story.template === "text_photo"
                  ? TextPhotoCard
                  : TextOnlyCard;

  const actionBar = compact ? (
    <CompactCardActionBar
      onOverflow={() => setOverflowOpen((o) => !o)}
    />
  ) : (
    <CardActionBar
      applaudCount={story.applaud_count}
      escalateCount={localEscalateCount}
      onApplaud={handleApplaud}
      onEscalate={handleEscalate}
      onShare={handleShare}
      onOverflow={() => setOverflowOpen((o) => !o)}
    />
  );

  return (
    <article className={cardClassName} onClick={handleCardClick} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCardClick(); } }}>
      {compact ? (
        <CompactCard story={story}>{actionBar}</CompactCard>
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

      <EscalateSheet
        open={escalateOpen}
        headline={story.headline}
        onClose={() => setEscalateOpen(false)}
        onSend={handleEscalateSend}
      />
    </article>
  );
}
