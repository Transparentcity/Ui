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
  const [applaudCount, setApplaudCount] = useState(0);
  const [escalateCount, setEscalateCount] = useState(0);
  const [detailNarrative, setDetailNarrative] = useState<DetailNarrative | null>(null);
  const trackEngagement = useTrackFeedEngagement();

  const { data: storyResponse, isLoading, error } = useFeedStoryDetail(
    Number.isNaN(storyId) ? null : storyId,
  );

  const rawStory = storyResponse?.story ?? null;
  const story = rawStory ? enrichStory(rawStory) : null;

  useEffect(() => {
    if (rawStory) {
      setApplaudCount(rawStory.applaud_count ?? rawStory.like_count ?? 0);
      setEscalateCount(rawStory.escalate_count ?? rawStory.comment_count ?? 0);
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

  const handleApplaud = () => {
    setApplaudCount((c) => c + 1);
    trackEngagement.mutate({ storyId, action: "like" });
    toast.success("Applauded!");
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

  const handleEscalateSend = (_comment: string, _includeName: boolean) => {
    setEscalateCount((c) => c + 1);
  };

  if (isLoading) {
    return (
      <div className={styles.detailContainer}>
        <button
          type="button"
          className={styles.detailBack}
          onClick={() => router.back()}
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
    return (
      <div className={styles.detailContainer}>
        <button
          type="button"
          className={styles.detailBack}
          onClick={() => router.back()}
        >
          {"\u2190"} Back
        </button>
        <h1 className={styles.detailHeadline}>Story not found</h1>
        <p className={styles.detailDescription}>
          {error
            ? "Error loading story. Please try again later."
            : `No story with ID ${storyId} exists.`}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.detailContainer}>
      <button
        type="button"
        className={styles.detailBack}
        onClick={() => router.back()}
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
        applaudCount={applaudCount}
        escalateCount={escalateCount}
        onApplaud={handleApplaud}
        onShare={handleShare}
        onEscalateSend={handleEscalateSend}
      />
    </div>
  );
}
