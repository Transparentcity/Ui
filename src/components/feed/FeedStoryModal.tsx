"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
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
  const trackEngagement = useTrackFeedEngagement();
  const [detailNarrative, setDetailNarrative] = useState<DetailNarrative | null>(null);
  const [applaudCount, setApplaudCount] = useState(0);
  const [escalateCount, setEscalateCount] = useState(0);

  const activeId = open && storyId != null ? storyId : null;
  const { data: storyResponse, isLoading, error } = useFeedStoryDetail(activeId);

  const rawStory = storyResponse?.story ?? null;
  const story = rawStory ? enrichStory(rawStory) : null;

  useEffect(() => {
    if (!open) {
      setDetailNarrative(null);
    }
  }, [open]);

  useEffect(() => {
    if (!rawStory) return;
    setApplaudCount(rawStory.applaud_count ?? rawStory.like_count ?? 0);
    setEscalateCount(rawStory.escalate_count ?? rawStory.comment_count ?? 0);
    trackEngagement.mutate({ storyId: rawStory.id, action: "view" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStory?.id]);

  useEffect(() => {
    if (!rawStory) return;
    setDetailNarrative(null);
    fetchDetailNarrative(rawStory).then((dn) => {
      if (dn) setDetailNarrative(dn);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStory?.id]);

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

  const handleApplaud = () => {
    if (!story) return;
    setApplaudCount((c) => c + 1);
    trackEngagement.mutate({ storyId: story.id, action: "like" });
    toast.success("Applauded!");
  };

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

  const handleEscalateSend = (_comment: string, _includeName: boolean) => {
    setEscalateCount((c) => c + 1);
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

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 pr-12">
          {story && outboundPath ? (
            <Link
              href={outboundPath}
              className="inline-flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-900 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              Open canonical page
            </Link>
          ) : (
            <span className="text-sm text-gray-500">Loading…</span>
          )}
        </div>

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
                applaudCount={applaudCount}
                escalateCount={escalateCount}
                onApplaud={handleApplaud}
                onShare={handleShare}
                onEscalateSend={handleEscalateSend}
                onSelectRelatedStoryId={onSelectRelatedStory}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
