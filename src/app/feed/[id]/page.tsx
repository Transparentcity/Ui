"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useFeedStoryDetail, useCityFeedStories, useTrackFeedEngagement } from "@/lib/hooks/useFeed";
import { enrichStory, enrichStories } from "@/lib/feed/mockFeedData";
import { resolveOutboundCanonicalPath } from "@/lib/feed/canonicalUrl";
import { fetchDetailNarrative, type DetailNarrative } from "@/lib/feed/fetchReportNarratives";
import { FeedStoryDetailView } from "@/components/feed/FeedStoryDetailView";
import styles from "@/components/feed/feed.module.css";

export default function FeedDetailPage() {
  const params = useParams();
  const router = useRouter();
  const storyId = Number(params.id);
  const [detailNarrative, setDetailNarrative] = useState<DetailNarrative | null>(null);
  const trackEngagement = useTrackFeedEngagement();

  const { data: storyResponse, isLoading, error } = useFeedStoryDetail(
    Number.isNaN(storyId) ? null : storyId,
  );

  const rawStory = storyResponse?.story ?? null;
  const story = rawStory ? enrichStory(rawStory) : null;

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
    trackEngagement.mutate({ storyId, action: "share" });
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
      />
    </div>
  );
}
