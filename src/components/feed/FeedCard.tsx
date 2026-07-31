"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import {
  canRestorePlacePrivateScope,
  isPrivateFeedStory,
  requiresPublishForPublicShare,
} from "@/lib/feed/canonicalUrl";
import { runSharePublicUrl } from "@/lib/feed/sharePublicUrl";
import {
  feedKeys,
  useTrackFeedEngagement,
} from "@/lib/hooks/useFeed";
import { useAuth0 } from "@auth0/auth0-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { restorePlaceScopeOnFeedStory } from "@/lib/apiClient";
import CardActionBar from "./CardActionBar";
import OverflowMenu from "./OverflowMenu";
import FeedStoryShareDialog from "./FeedStoryShareDialog";
import TextOnlyCard from "./templates/TextOnlyCard";
import TextChartCard from "./templates/TextChartCard";
import MultiMetricCard from "./templates/MultiMetricCard";
import AlertCard from "./templates/AlertCard";
import SpendingCard from "./templates/SpendingCard";
import OffTheChartsCard from "./templates/OffTheChartsCard";
import PhotoCard from "./templates/PhotoCard";
import { useIsMobile } from "./useIsMobile";
import styles from "./feed.module.css";

interface FeedCardProps {
  story: EnrichedFeedStory;
  isAdmin?: boolean;
  onHide: (storyId: number) => void;
  onApplaud?: (storyId: number) => void;
  onDelete?: (storyId: number) => void;
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
  onApplaud,
  onDelete,
  onOpenFeedDetail,
}: FeedCardProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const trackEngagement = useTrackFeedEngagement();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [placeShareOpen, setPlaceShareOpen] = useState(false);

  const showMakePrivate =
    isAuthenticated && canRestorePlacePrivateScope(story);
  const showOverflowMenu = !!isAdmin || showMakePrivate;

  const makePrivateMutation = useMutation({
    mutationFn: async () => {
      const token = await getAccessTokenSilently();
      return restorePlaceScopeOnFeedStory(story.id, token);
    },
    onSuccess: (res) => {
      const id = res.story.id;
      queryClient.setQueryData(feedKeys.detail(id), { story: res.story });
      queryClient.invalidateQueries({ queryKey: feedKeys.lists() });
      queryClient.invalidateQueries({ queryKey: feedKeys.places() });
      queryClient.invalidateQueries({ queryKey: feedKeys.detail(id) });
      toast.success("Story is private to your saved place again.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update this story.");
    },
  });

  const handleMakePrivate = useCallback(() => {
    makePrivateMutation.mutate();
  }, [makePrivateMutation]);

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
    // Open modal first so the parent can seed React Query cache before any async work.
    if (onOpenFeedDetail) {
      onOpenFeedDetail(story);
      trackEngagement.mutate({ storyId: story.id, action: "click" });
      return;
    }
    trackEngagement.mutate({ storyId: story.id, action: "click" });
    router.push(story.canonical_url);
  }, [
    router,
    story,
    onOpenFeedDetail,
    overflowOpen,
    trackEngagement,
  ]);

  const handleShare = useCallback(() => {
    if (requiresPublishForPublicShare(story)) {
      setPlaceShareOpen(true);
      return;
    }
    if (isPrivateFeedStory(story)) {
      toast.info(
        "This story is only visible in your account and does not have a shareable public link.",
      );
      return;
    }
    runSharePublicUrl(story, trackEngagement);
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

  const handleApplaud = isAdmin
    ? () => onApplaud?.(story.id)
    : undefined;

  const handleDelete = isAdmin
    ? () => onDelete?.(story.id)
    : undefined;

  const cardClassName = [
    styles.card,
    story.card_type === "traction" ? styles.cardTraction : "",
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

  const actionBar = (
    <CardActionBar
      onShare={handleShare}
      onOverflow={showOverflowMenu ? () => setOverflowOpen((o) => !o) : undefined}
      showOverflow={showOverflowMenu}
    />
  );

  return (
    <>
    <article className={cardClassName} onClick={handleCardClick} tabIndex={0} onKeyDown={(e) => { const tag = (e.target as HTMLElement).tagName; if (tag === "TEXTAREA" || tag === "INPUT") return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCardClick(); } }}>
      {Template === PhotoCard ? (
        <PhotoCard story={story} variant={photoVariant}>{actionBar}</PhotoCard>
      ) : (
        <Template story={story}>{actionBar}</Template>
      )}

      {/* Overflow (admin tools and/or owner "Make private") */}
      {showOverflowMenu && (
        <div className={styles.overflowAnchor} style={{ position: "absolute", right: 16, bottom: 16 }}>
          <OverflowMenu
            open={overflowOpen}
            onClose={() => setOverflowOpen(false)}
            onShare={handleShare}
            onHide={isAdmin ? handleHide : undefined}
            onApplaud={handleApplaud}
            likedByMe={Boolean(story.liked_by_me)}
            onDelete={handleDelete}
            onMakePrivate={showMakePrivate ? handleMakePrivate : undefined}
            makePrivatePending={makePrivateMutation.isPending}
            omitShare={showMakePrivate && !isAdmin}
            mobile={isMobile}
          />
        </div>
      )}
    </article>
    {requiresPublishForPublicShare(story) && (
      <FeedStoryShareDialog
        story={story}
        open={placeShareOpen}
        onOpenChange={setPlaceShareOpen}
      />
    )}
    </>
  );
}
