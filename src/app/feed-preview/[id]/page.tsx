"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Toaster, toast } from "sonner";
import styles from "@/components/feed/feed.module.css";
import { SAMPLE_STORIES } from "../page";
import { enrichStory } from "@/lib/feed/mockFeedData";
import { cleanDescription } from "@/lib/feed/textCleanup";
import { getApiBaseUrl } from "@/lib/apiBase";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";

// ── Visualization placeholder by card type ───────────────────────────────

function VizPlaceholder({ story }: { story: EnrichedFeedStory }) {
  const vizType = (story.visualization_type ?? story.primary_visualization?.type ?? "").toLowerCase();

  if (vizType === "photo" || story.card_type === "311_images") {
    return (
      <div className={styles.detailVizPlaceholder}>
        <span className={styles.detailVizLabel}>{"\u{1F4F8}"}</span>
        <span className={styles.detailVizText}>
          311 photos from the cluster area would display here
        </span>
      </div>
    );
  }

  if (vizType === "map") {
    return (
      <div className={styles.detailVizPlaceholder}>
        <span className={styles.detailVizLabel}>{"\u{1F5FA}\uFE0F"}</span>
        <span className={styles.detailVizText}>
          Choropleth map would render here
        </span>
      </div>
    );
  }

  if (
    vizType === "chart" ||
    vizType === "anomaly" ||
    story.card_type === "trend"
  ) {
    return (
      <div className={styles.detailVizPlaceholder}>
        <span className={styles.detailVizLabel}>{"\u{1F4CA}"}</span>
        <span className={styles.detailVizText}>
          Interactive chart would render here
        </span>
        <div
          style={{
            marginTop: 16,
            width: "80%",
            maxWidth: 400,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <div
            style={{
              borderLeft: "2px solid var(--border-primary)",
              borderBottom: "2px solid var(--border-primary)",
              height: 120,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "60%",
                background:
                  "linear-gradient(to top, var(--brand-primary-light, rgba(173,53,250,0.1)), transparent)",
                borderRadius: "4px 4px 0 0",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (story.card_type === "multi_metric") {
    return (
      <div className={styles.detailVizPlaceholder}>
        <span className={styles.detailVizLabel}>{"\u{1F4CB}"}</span>
        <span className={styles.detailVizText}>
          Multi-metric dashboard would render here
        </span>
      </div>
    );
  }

  return null;
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

export default function FeedPreviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const storyId = Number(params.id);

  const [story, setStory] = useState<EnrichedFeedStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // First check sample stories
    const sample = SAMPLE_STORIES.find((s: EnrichedFeedStory) => s.id === storyId);
    if (sample) {
      setStory(sample);
      setLoading(false);
      return;
    }

    // Check sessionStorage for stories cached by the list page
    try {
      const cached = sessionStorage.getItem("feedPreviewStories");
      if (cached) {
        const stories: EnrichedFeedStory[] = JSON.parse(cached);
        const found = stories.find((s) => s.id === storyId);
        if (found) {
          setStory(found);
          setLoading(false);
          return;
        }
      }
    } catch { /* parse error — fall through */ }

    // Last resort: fetch from the public list API and find the story
    const apiBase = getApiBaseUrl();
    fetch(`${apiBase}/api/feed/public?limit=100`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        const raw = data.stories?.find((s: { id: number }) => s.id === storyId);
        if (!raw) {
          setNotFound(true);
          return;
        }
        const enriched = enrichStory(raw);
        enriched.cleaned_description = cleanDescription(
          enriched.description,
          enriched.headline,
          enriched.city_name ?? undefined,
          enriched.neighborhood_label,
        );
        setStory(enriched);
      })
      .catch(() => {
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [storyId]);

  if (loading) {
    return (
      <div className={styles.detailContainer}>
        <button
          type="button"
          className={styles.detailBack}
          onClick={() => router.push("/feed-preview")}
        >
          {"\u2190"} Back to feed
        </button>
        <p style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>Loading story…</p>
      </div>
    );
  }

  if (notFound || !story) {
    return (
      <div className={styles.detailContainer}>
        <button
          type="button"
          className={styles.detailBack}
          onClick={() => router.push("/feed-preview")}
        >
          {"\u2190"} Back to feed
        </button>
        <h1 className={styles.detailHeadline}>Story not found</h1>
        <p className={styles.detailDescription}>
          No story with ID {storyId} exists.
        </p>
      </div>
    );
  }

  const publishedDate = formatFullDate(story.published_at);
  const vizContent = VizPlaceholder({ story });
  const descriptionText = story.cleaned_description || story.description;

  const handleApplaud = () => {
    toast.success("Applauded!");
  };

  const handleEscalate = () => {
    toast("Flagged for your District Supervisor");
  };

  const handleShare = () => {
    const url = `${window.location.origin}/feed-preview/${story.id}`;
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
    <>
      <Toaster position="bottom-center" richColors />
      <div className={styles.detailContainer}>
        <button
          type="button"
          className={styles.detailBack}
          onClick={() => router.push("/feed-preview")}
        >
          {"\u2190"} Back to feed
        </button>

        <div className={styles.detailIcon}>{story.type_icon}</div>

        <h1 className={styles.detailHeadline}>{story.headline}</h1>

        <p className={styles.detailDate}>{publishedDate}</p>

        {descriptionText && (
          <p className={styles.detailDescription}>{descriptionText}</p>
        )}

        {vizContent && <div className={styles.detailVizArea}>{vizContent}</div>}

        <hr className={styles.detailDivider} />

        <div className={styles.detailActionBar}>
          <button
            type="button"
            className={styles.detailActionBtn}
            onClick={handleApplaud}
          >
            {"\u{1F44F}"} Applaud
          </button>
          <button
            type="button"
            className={styles.detailActionBtn}
            onClick={handleEscalate}
          >
            {"\u{1F6A9}"} Flag
          </button>
          <button
            type="button"
            className={styles.detailActionBtn}
            onClick={handleShare}
          >
            {"\u{1F517}"} Share
          </button>
        </div>
      </div>
    </>
  );
}
