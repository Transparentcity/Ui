"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useFeedStoryDetail,
  useCityFeedStories,
  useTrackFeedEngagement,
  feedKeys,
  type FeedStory,
} from "@/lib/hooks/useFeed";
import { enrichStory, enrichStories } from "@/lib/feed/mockFeedData";
import { resolveOutboundCanonicalPath } from "@/lib/feed/canonicalUrl";
import { fetchDetailNarrative, type DetailNarrative } from "@/lib/feed/fetchReportNarratives";
import { FeedStoryDetailView } from "./FeedStoryDetailView";
import styles from "./feed.module.css";

type FeedStoryModalProps = {
  storyId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Swap the open story (e.g. related picks) without closing the modal. */
  onSelectRelatedStory?: (id: number) => void;
};

export default function FeedStoryModal({
  storyId,
  open,
  onOpenChange,
  onSelectRelatedStory,
}: FeedStoryModalProps) {
  const queryClient = useQueryClient();
  const trackEngagement = useTrackFeedEngagement();
  const [detailNarrative, setDetailNarrative] = useState<DetailNarrative | null>(null);

  const activeId = open && storyId != null ? storyId : null;
  const { data: storyResponse, isLoading, isFetching, error } =
    useFeedStoryDetail(activeId);

  const rawStory = storyResponse?.story ?? null;
  const story = rawStory ? enrichStory(rawStory) : null;

  useEffect(() => {
    if (!open) {
      setDetailNarrative(null);
    }
  }, [open]);

  useEffect(() => {
    if (!rawStory) return;
    trackEngagement.mutate({ storyId: rawStory.id, action: "view" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStory?.id]);

  useEffect(() => {
    if (!rawStory) return;
    setDetailNarrative(null);
    const hasArticle = Boolean(rawStory.article_html?.trim());
    if (hasArticle) return;
    fetchDetailNarrative(rawStory).then((dn) => {
      if (dn) setDetailNarrative(dn);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStory?.id, rawStory?.article_html]);

  const { data: relatedData } = useCityFeedStories(
    rawStory?.city_id ?? null,
    { limit: 6, order_by: "published_at" },
  );

  const relatedStories = useMemo(() => {
    if (!relatedData?.stories || !rawStory) return [];
    return enrichStories(relatedData.stories)
      .filter((s) => s.id !== rawStory.id)
      .slice(0, 3);
  }, [relatedData?.stories, rawStory]);

  const outboundPath = story ? resolveOutboundCanonicalPath(story) : "";
  /** Detail fetch still loading fields omitted from feed list (e.g. article_html). */
  const showFullStoryLoadingBar = Boolean(
    story && isFetching && !rawStory?.article_html?.trim(),
  );

  const handleSelectRelatedStoryId = useCallback(
    (id: number) => {
      const picked = relatedStories.find((s) => s.id === id);
      if (picked) {
        queryClient.setQueryData(feedKeys.detail(id), {
          story: picked as FeedStory,
        });
      }
      onSelectRelatedStory?.(id);
    },
    [onSelectRelatedStory, queryClient, relatedStories],
  );

  const handleShare = () => {
    if (!story) return;
    trackEngagement.mutate({ storyId: story.id, action: "share" });
    const url = `${window.location.origin}${outboundPath}`;
    if (typeof navigator.share === "function") {
      navigator.share({ title: story.headline, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(
        () => toast.success("Link copied to clipboard"),
        () => toast.error("Could not copy link"),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,880px)] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{story?.headline ?? "Story"}</DialogTitle>
        </DialogHeader>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 pr-12 dark:border-slate-600 dark:bg-slate-800/90">
          {story && outboundPath ? (
            <a
              href={outboundPath}
              className="inline-flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-900 hover:underline dark:text-purple-400 dark:hover:text-purple-300"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              Open page
            </a>
          ) : (
            <span className="text-sm text-gray-500 dark:text-slate-400">Loading…</span>
          )}
        </div>

        {showFullStoryLoadingBar && (
          <div
            className="flex shrink-0 items-center gap-2 border-b border-amber-200/80 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
            Loading full story…
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2">
          {isLoading && (
            <div className={styles.detailContainer}>
              <div className={styles.loadingState}>
                <div className={styles.pullSpinner} />
              </div>
            </div>
          )}

          {!isLoading && (error || !story) && (
            <div className={styles.detailContainer}>
              <h1 className={styles.detailHeadline}>Story not found</h1>
              <p className={styles.detailDescription}>
                {error
                  ? "Error loading story. Please try again later."
                  : "This story could not be loaded."}
              </p>
            </div>
          )}

          {!isLoading && story && rawStory && (
            <div className={styles.detailContainer}>
              <FeedStoryDetailView
                story={story}
                detailNarrative={detailNarrative}
                relatedStories={relatedStories}
                onShare={handleShare}
                onSelectRelatedStoryId={
                  onSelectRelatedStory ? handleSelectRelatedStoryId : undefined
                }
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
