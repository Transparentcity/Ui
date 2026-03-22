"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Toaster, toast } from "sonner";
import { useFeedStoryDetail, useTrackFeedEngagement } from "@/lib/hooks/useFeed";
import { enrichStory } from "@/lib/feed/mockFeedData";
import { fetchDetailNarrative, type DetailNarrative } from "@/lib/feed/fetchReportNarratives";
import EscalateSheet from "@/components/feed/EscalateSheet";
import { Share2 } from "lucide-react";
import styles from "@/components/feed/feed.module.css";

// ── Visualization embed ──────────────────────────────────────────────────

function VizEmbed({
  vizType,
  vizId,
  vizHash,
  cardType,
}: {
  vizType: string;
  vizId: number | null;
  vizHash: string | null;
  cardType: string;
}) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // 311 photos — coming soon
  if (cardType === "311_images") {
    return (
      <div className={styles.detailVizArea}>
        <div className={styles.vizPlaceholderComingSoon}>
          <span>{"\u{1F4F8}"} 311 Photos</span>
          <span className={styles.comingSoonBadge}>Coming Soon</span>
        </div>
      </div>
    );
  }

  // Determine iframe URL
  let iframeSrc: string | null = null;

  if ((vizType === "anomaly" || vizType === "anomaly_chart") && vizId != null) {
    iframeSrc = `/a/${vizId}?embedded=true`;
  } else if (vizType === "chart" && vizId != null) {
    iframeSrc = `/t/${vizId}?embedded=true`;
  } else if (vizType === "map" && vizHash) {
    iframeSrc = `/m/${vizHash}?embedded=true`;
  } else if (vizType === "map" && vizId != null) {
    iframeSrc = `/m/${vizId}?embedded=true`;
  }

  if (!iframeSrc) return null;

  return (
    <div className={styles.detailVizArea}>
      {!iframeLoaded && (
        <div className={styles.detailVizLoading}>
          <div className={styles.pullSpinner} />
        </div>
      )}
      <iframe
        src={iframeSrc}
        className={styles.detailVizIframe}
        title="Visualization"
        loading="lazy"
        onLoad={() => setIframeLoaded(true)}
        style={{ opacity: iframeLoaded ? 1 : 0 }}
      />
    </div>
  );
}

// ── Format full date ─────────────────────────────────────────────────────

function formatFullDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// ── Detail page component ────────────────────────────────────────────────

export default function FeedDetailPage() {
  const params = useParams();
  const router = useRouter();
  const storyId = Number(params.id);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [applaudCount, setApplaudCount] = useState(0);
  const [escalateCount, setEscalateCount] = useState(0);
  const [detailNarrative, setDetailNarrative] = useState<DetailNarrative | null>(null);
  const trackEngagement = useTrackFeedEngagement();

  const { data: storyResponse, isLoading, error } = useFeedStoryDetail(
    Number.isNaN(storyId) ? null : storyId,
  );

  const rawStory = storyResponse?.story ?? null;
  const story = rawStory ? enrichStory(rawStory) : null;

  // Initialize counts + track view on story load
  useEffect(() => {
    if (rawStory) {
      setApplaudCount(rawStory.like_count ?? 0);
      setEscalateCount(rawStory.comment_count ?? 0);
      trackEngagement.mutate({ storyId: rawStory.id, action: "view" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStory?.id]);

  // Fetch rich narrative from the research report (full detail version)
  useEffect(() => {
    if (!rawStory) return;
    fetchDetailNarrative(rawStory).then((dn) => {
      if (dn) setDetailNarrative(dn);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStory?.id]);

  const handleApplaud = () => {
    setApplaudCount((c) => c + 1);
    trackEngagement.mutate({ storyId, action: "like" });
    toast.success("Applauded!");
  };

  const handleFlag = () => {
    setEscalateOpen(true);
  };

  const handleEscalateSend = () => {
    setEscalateCount((c) => c + 1);
  };

  const handleShare = () => {
    trackEngagement.mutate({ storyId, action: "share" });
    const url = `${window.location.origin}/feed/${storyId}`;
    if (typeof navigator.share === "function") {
      navigator.share({ title: story?.headline ?? "", url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(
        () => toast.success("Link copied to clipboard"),
        () => toast.error("Could not copy link"),
      );
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <>
        <Toaster position="bottom-center" richColors />
        <div className={styles.detailContainer}>
          <div className={styles.loadingState}>
            <div className={styles.pullSpinner} />
          </div>
        </div>
      </>
    );
  }

  // Error or not found
  if (error || !story) {
    return (
      <>
        <Toaster position="bottom-center" richColors />
        <div className={styles.detailContainer}>
          <h1 className={styles.detailHeadline}>Story not found</h1>
          <p className={styles.detailDescription}>
            {error
              ? "Error loading story. Please try again later."
              : `No story with ID ${storyId} exists.`}
          </p>
        </div>
      </>
    );
  }

  const publishedDate = formatFullDate(story.published_at);

  // Determine viz type and IDs
  const pv = story.primary_visualization;
  const vizType = (
    story.visualization_type ??
    pv?.type ??
    ""
  ).toLowerCase();
  const vizId = pv?.id != null ? Number(pv.id) : null;
  const vizHash = pv?.short_hash ?? null;

  return (
    <>
      <Toaster position="bottom-center" richColors />
      <div className={styles.detailContainer}>
        <div className={styles.detailHeaderRow}>
          <span className={styles.detailIcon}>{story.type_icon}</span>
          <span className={styles.detailActor}>{story.actor}</span>
          {story.subline && <span className={styles.detailTimestamp}>{story.subline}</span>}
        </div>

        <h1 className={styles.detailHeadline}>{story.headline}</h1>

        <p className={styles.detailDate}>
          {publishedDate}
          {story.neighborhood_label && (
            <>
              {" \u00B7 "}
              {story.neighborhood_label}
            </>
          )}
        </p>

        {/* Narrative above the chart */}
        <div className={styles.detailNarrativeSection}>
          {detailNarrative ? (
            detailNarrative.above.map((para, i) => (
              <p key={`above-${i}`} className={styles.detailDescription}>
                {para}
              </p>
            ))
          ) : (story.card_type === "multi_metric" || story.card_type === "my_block") && story.metadata?.metrics ? (
            /* Multi-metric stories: show structured metric grid instead of raw text */
            <div className={styles.metricGrid} style={{ marginTop: 8 }}>
              {(story.metadata.metrics as Array<{ name: string; direction: string; pct: number }>)
                .slice(0, 6)
                .map((m, i) => {
                  const rawPct = typeof m.pct === "number" ? m.pct : parseFloat(String(m.pct)) || 0;
                  const cappedPct = Math.max(Math.min(rawPct, 9999), -9999);
                  const arrow = m.direction === "up" ? "\u2191" : m.direction === "down" ? "\u2193" : "\u2500";
                  const formatted = `${cappedPct >= 0 ? "+" : ""}${Math.round(cappedPct)}%`;
                  return (
                    <div key={i} className={styles.metricCell}>
                      <span className={styles.metricName}>{m.name}</span>
                      <span
                        className={`${styles.metricValue} ${
                          m.direction === "up"
                            ? styles.metricUp
                            : m.direction === "down"
                              ? styles.metricDown
                              : styles.metricFlat
                        }`}
                      >
                        {arrow} {formatted}
                      </span>
                    </div>
                  );
                })}
            </div>
          ) : (
            /* Fallback: show description text if available */
            (story.summary || story.cleaned_description || story.description) ? (
              <p className={styles.detailDescription}>
                {story.summary || story.cleaned_description || story.description}
              </p>
            ) : null
          )}
        </div>

        {/* Interactive visualization via iframe */}
        <VizEmbed
          vizType={vizType}
          vizId={vizId}
          vizHash={vizHash}
          cardType={story.card_type}
        />

        {/* Narrative below the chart */}
        {detailNarrative && detailNarrative.below.length > 0 && (
          <div className={styles.detailNarrativeSection}>
            {detailNarrative.below.map((para, i) => (
              <p key={`below-${i}`} className={styles.detailDescription}>
                {para}
              </p>
            ))}
          </div>
        )}

        {/* CTA to full research report */}
        {story.detail_url && (
          <a
            href={story.detail_url}
            className={styles.detailReportLink}
          >
            {story.cta_label || "Read full report"} {"\u2192"}
          </a>
        )}

        <hr className={styles.detailDivider} />

        <div className={styles.detailActionBar}>
          <button
            type="button"
            className={styles.detailActionBtn}
            onClick={handleApplaud}
          >
            {"\u{1F44F}"} {applaudCount > 0 ? `${applaudCount} ` : ""}Applaud
          </button>
          <button
            type="button"
            className={styles.detailActionBtn}
            onClick={handleFlag}
          >
            {"\u2B06\uFE0F"} {escalateCount > 0 ? `${escalateCount} ` : ""}Escalate
          </button>
          <button
            type="button"
            className={styles.detailActionBtn}
            onClick={handleShare}
          >
            <Share2 size={16} /> Share
          </button>
        </div>
      </div>

      <EscalateSheet
        open={escalateOpen}
        headline={story.headline}
        onClose={() => setEscalateOpen(false)}
        onSend={handleEscalateSend}
      />
    </>
  );
}
