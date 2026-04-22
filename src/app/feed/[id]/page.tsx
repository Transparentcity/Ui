"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  feedKeys,
  useCityFeedStories,
  useFeedStoryDetail,
  useTrackFeedEngagement,
} from "@/lib/hooks/useFeed";
import { enrichStory, enrichStories } from "@/lib/feed/mockFeedData";
import {
  canRestorePlacePrivateScope,
  isPrivateFeedStory,
  requiresPublishForPublicShare,
  resolveOutboundCanonicalPath,
} from "@/lib/feed/canonicalUrl";
import { runSharePublicUrl } from "@/lib/feed/sharePublicUrl";
import { restorePlaceScopeOnFeedStory } from "@/lib/apiClient";
import { fetchDetailNarrative, type DetailNarrative } from "@/lib/feed/fetchReportNarratives";
import { FeedStoryDetailView } from "@/components/feed/FeedStoryDetailView";
import FeedStoryShareDialog from "@/components/feed/FeedStoryShareDialog";
import styles from "@/components/feed/feed.module.css";

export default function FeedDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const storyId = Number(params.id);
  const [detailNarrative, setDetailNarrative] = useState<DetailNarrative | null>(null);
  const [placeShareOpen, setPlaceShareOpen] = useState(false);
  const trackEngagement = useTrackFeedEngagement();

  const { data: storyResponse, isLoading, error } = useFeedStoryDetail(
    Number.isNaN(storyId) ? null : storyId,
  );

  const rawStory = storyResponse?.story ?? null;
  const story = rawStory ? enrichStory(rawStory) : null;

  const showMakePrivate =
    Boolean(story) && isAuthenticated && canRestorePlacePrivateScope(story!);

  const makePrivateMutation = useMutation({
    mutationFn: async () => {
      if (!story) throw new Error("No story");
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

  useEffect(() => {
    if (rawStory) {
      trackEngagement.mutate({ storyId: rawStory.id, action: "view" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStory?.id]);

  useEffect(() => {
    if (!rawStory) return;
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

  const handleBack = () => {
    const sameOriginReferrer =
      typeof document !== "undefined" &&
      document.referrer &&
      document.referrer.startsWith(window.location.origin);
    if (sameOriginReferrer && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  const handleShare = () => {
    if (!story) return;
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
  };

  if (isLoading) {
    return (
      <div className={styles.detailContainer}>
        <button
          type="button"
          className={styles.detailBack}
          onClick={handleBack}
        >
          {"\u2190"} Back
        </button>
        <div className={styles.loadingState}>
          <div className={styles.pullSpinner} />
        </div>
      </div>
    );
  }

  if (error || !story || !rawStory) {
    const errorStatus = (error as { status?: number } | null)?.status;
    const isNotFound = !error || errorStatus === 404;
    return (
      <div className={styles.detailContainer}>
        <button
          type="button"
          className={styles.detailBack}
          onClick={handleBack}
        >
          {"\u2190"} Back
        </button>
        <div className={styles.emptyState}>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
            {isNotFound ? "Story not found" : "We couldn\u2019t load this story"}
          </h1>
          <p>
            {isNotFound
              ? "This story may have been unpublished, or the link is out of date."
              : "Something went wrong on our end. Please try again in a moment."}
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium !text-white hover:bg-purple-700"
          >
            Browse the latest feed
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.detailContainer}>
        <button
          type="button"
          className={styles.detailBack}
          onClick={handleBack}
        >
          {"\u2190"} Back
        </button>

        <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-gray-200 pb-3 dark:border-slate-600">
          <Link
            href={outboundPath}
            className="inline-flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-900 hover:underline dark:text-purple-400 dark:hover:text-purple-300"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            Open page
          </Link>
        </div>

        <FeedStoryDetailView
          story={story}
          detailNarrative={detailNarrative}
          relatedStories={relatedStories}
          onShare={handleShare}
          onMakePrivate={
            showMakePrivate ? () => makePrivateMutation.mutate() : undefined
          }
          makePrivatePending={makePrivateMutation.isPending}
        />
      </div>
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
