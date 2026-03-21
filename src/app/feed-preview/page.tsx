"use client";

/**
 * DEV-ONLY preview page for the Feed V2 redesign.
 * Fetches REAL data from the public feed API (no auth required).
 * Falls back to sample data if the backend isn't running.
 *
 * Visit /feed-preview to see real feed cards with charts and maps.
 *
 * TODO: Remove this file before shipping to production.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Toaster } from "sonner";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { enrichStories, buildPlaceMap } from "@/lib/feed/mockFeedData";
import { cleanDescription } from "@/lib/feed/textCleanup";
import { fetchNarratives } from "@/lib/feed/fetchReportNarratives";
import { getApiBaseUrl } from "@/lib/apiBase";
import FeedCard from "@/components/feed/FeedCard";
import SkeletonCard from "@/components/feed/SkeletonCard";
import FeedEndState from "@/components/feed/FeedEndState";
import styles from "@/components/feed/feed.module.css";

// ── Sample enriched stories (fallback when API is unavailable) ──────────────

export const SAMPLE_STORIES: EnrichedFeedStory[] = [
  {
    id: 1001,
    story_type: "anomaly",
    research_report_id: 0,
    city_id: 1,
    city_name: "San Francisco",
    city_emoji: "\u{1F309}",
    district: 6,
    headline: "Motor Vehicle Theft Down 59% Year-over-Year in January",
    description:
      "January 2026 recorded 291 motor vehicle thefts vs. 718 in January 2024. The 12-week average is 340 incidents per week. District 6 (SoMa/Tenderloin) saw the steepest decline.",
    summary: "",
    primary_visualization: null,
    visualization_type: null,
    detail_url: "/stories/1001",
    cta_label: "Read full report",
    view_count: 342,
    click_count: 78,
    share_count: 12,
    priority_score: 85,
    is_featured: false,
    status: "published",
    story_date: "2026-03-09",
    published_at: "2026-03-16T10:00:00Z",
    metadata: { anomaly_severity: "high" },
    like_count: 24,
    comment_count: 5,
    card_type: "alert",
    template: "text_only",
    applaud_count: 24,
    escalate_count: 3,
    investigate_count: 1,
    type_icon: "\u{1F534}",
    type_label: "Alert",
    actor: "Police",
    neighborhood_label: "San Francisco \u00B7 D6",
    subline: "Mar 16",
    image_url_resolved: null,
    embed_url_resolved: null,
    cleaned_description: "",
  },
].map((s) => ({
  ...s,
  cleaned_description: cleanDescription(s.description, s.headline),
})) as EnrichedFeedStory[];

// ── Preview page component ────────────────────────────────────────────────

export default function FeedPreviewPage() {
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [stories, setStories] = useState<EnrichedFeedStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<"live" | "sample">("sample");

  // ── City filter state ──
  const [selectedCityIds, setSelectedCityIds] = useState<Set<number>>(new Set());
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  // Derive unique cities from the stories
  const uniqueCities = useMemo(() => {
    const seen = new Map<number, { city_id: number; city_name: string; city_emoji: string }>();
    for (const s of stories) {
      if (!seen.has(s.city_id)) {
        seen.set(s.city_id, {
          city_id: s.city_id,
          city_name: s.city_name ?? `City ${s.city_id}`,
          city_emoji: s.city_emoji ?? "\u{1F3D9}\uFE0F",
        });
      }
    }
    return [...seen.values()];
  }, [stories]);

  const toggleCity = useCallback((cid: number) => {
    setSelectedCityIds((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }, []);

  // Fetch real stories + places from the public API on mount
  useEffect(() => {
    const apiBase = getApiBaseUrl();

    Promise.all([
      fetch(`${apiBase}/api/feed/public?limit=30`).then((r) => r.ok ? r.json() : null),
      fetch(`${apiBase}/api/feed/public/places`).then((r) => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(async ([feedData, placesData]) => {
        if (!feedData?.stories?.length) {
          setStories(SAMPLE_STORIES);
          setDataSource("sample");
          return;
        }

        // Build place label map for real district names
        const placeMap = placesData?.places ? buildPlaceMap(placesData.places) : undefined;

        const enriched = enrichStories(feedData.stories, placeMap);
        setStories(enriched);
        setDataSource("live");

        // Persist stories to sessionStorage so the detail page can look them up
        try {
          sessionStorage.setItem("feedPreviewStories", JSON.stringify(enriched));
        } catch { /* quota exceeded — ignore */ }

        // Fetch rich narratives from research reports for thin descriptions
        const narratives = await fetchNarratives(feedData.stories);
        if (narratives.size > 0) {
          setStories((prev) => {
            const updated = prev.map((s) => {
              const narrative = narratives.get(s.id);
              if (narrative) {
                return {
                  ...s,
                  cleaned_description: cleanDescription(narrative, s.headline, s.city_name ?? undefined, s.neighborhood_label),
                };
              }
              return s;
            });
            // Update sessionStorage with enriched narratives
            try {
              sessionStorage.setItem("feedPreviewStories", JSON.stringify(updated));
            } catch { /* ignore */ }
            return updated;
          });
        }
      })
      .catch(() => {
        setStories(SAMPLE_STORIES);
        setDataSource("sample");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleHide = (storyId: number) => {
    if (storyId < 0) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(-storyId);
        return next;
      });
    } else {
      setHiddenIds((prev) => new Set(prev).add(storyId));
    }
  };

  const visible = useMemo(
    () => stories.filter((s) => {
      if (hiddenIds.has(s.id)) return false;
      if (selectedCityIds.size > 0 && !selectedCityIds.has(s.city_id)) return false;
      if (selectedTopic && s.card_type !== selectedTopic) return false;
      return true;
    }),
    [stories, hiddenIds, selectedCityIds, selectedTopic],
  );

  const hasFilters = selectedCityIds.size > 0 || selectedTopic;

  return (
    <>
      <Toaster position="bottom-center" richColors />
      <div className={styles.feedContainer}>
        <div className={styles.feedHeader}>
          <h1 className={styles.feedTitle}>
            Feed V2 {dataSource === "live" ? "(Live Data)" : "(Sample Data)"}
          </h1>
          <p className={styles.feedSubtitle}>
            {dataSource === "live"
              ? `${stories.length} real stories from the API \u2014 click any card for interactive charts`
              : "Backend not available \u2014 showing sample data"}
          </p>
        </div>

        {/* City chips + filters */}
        <div className={styles.compactFilterBar}>
          {uniqueCities.length > 1 && (
            <div className={styles.cityChipRow}>
              {uniqueCities.map((c) => (
                <button
                  key={c.city_id}
                  type="button"
                  className={`${styles.cityChip} ${selectedCityIds.has(c.city_id) ? styles.cityChipActive : ""}`}
                  onClick={() => toggleCity(c.city_id)}
                >
                  {c.city_emoji} {c.city_name}
                </button>
              ))}
            </div>
          )}

          <select
            id="feedv2-topic"
            value={selectedTopic ?? ""}
            onChange={(e) => setSelectedTopic(e.target.value || null)}
            className={styles.compactSelect}
          >
            <option value="">All topics</option>
            <option value="safety">Safety</option>
            <option value="justice">Justice</option>
            <option value="business">Business</option>
            <option value="spending">Spending</option>
            <option value="alert">Alerts</option>
            <option value="trend">Trends</option>
            <option value="context">Context</option>
            <option value="off_the_charts">Off the Charts</option>
            <option value="my_block">My Block</option>
            <option value="311_images">311 Photos</option>
          </select>

          {hasFilters && (
            <button
              type="button"
              className={styles.compactClear}
              onClick={() => {
                setSelectedCityIds(new Set());
                setSelectedTopic(null);
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Dev controls */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className={styles.chip}
            onClick={() => setHiddenIds(new Set())}
          >
            Reset hidden ({hiddenIds.size})
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className={styles.storiesList}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Cards */}
        {!loading && (
          <div className={styles.storiesList}>
            {visible.map((story) => (
              <FeedCard
                key={story.id}
                story={story}
                isAdmin
                onHide={handleHide}
                onDelete={(id) =>
                  alert(`Delete story ${id} (no-op in preview)`)
                }
                previewMode
              />
            ))}
          </div>
        )}

        {/* End state */}
        {!loading && <FeedEndState lastUpdated={new Date()} />}
      </div>
    </>
  );
}
