"use client";

import { useState } from "react";
import Link from "next/link";
import { Share2 } from "lucide-react";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { ICON_COMPONENTS } from "./categoryIcons";
import type { DetailNarrative } from "@/lib/feed/fetchReportNarratives";
import { VisualizationDeferredInteractiveContainer } from "@/components/VisualizationDeferredInteractiveContainer";
import {
  buildPrimaryVisualizationShortcodeConfig,
  processVisualizationShortcodes,
} from "@/lib/visualizationShortcodes";
import { slugify } from "@/lib/utils";
import { useMetricKey } from "./MetricKeyContext";
import MetricLink from "./MetricLink";
import styles from "./feed.module.css";

/**
 * Returns true when a detail_url is just a reference to the story's own page —
 * i.e. it's a /s/{hash} short-URL or a /c/{slug}/stories/{hash} canonical path.
 * These are suppressed as CTAs since the "Open page" link in the modal header
 * already covers them.
 */
function isStoryPageUrl(detailUrl: string, canonicalUrl?: string): boolean {
  if (!detailUrl) return false;
  if (detailUrl.startsWith("/s/")) return true;
  if (/^\/c\/[^/]+\/stories\//.test(detailUrl)) return true;
  if (canonicalUrl && detailUrl === canonicalUrl) return true;
  // Also catch absolute URLs (e.g. https://transparent.city/s/HASH)
  try {
    const path = new URL(detailUrl, "https://transparent.city").pathname;
    if (path.startsWith("/s/")) return true;
    if (/^\/c\/[^/]+\/stories\//.test(path)) return true;
  } catch {
    // not a valid URL
  }
  return false;
}

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

  let iframeSrc: string | null = null;

  if ((vizType === "anomaly" || vizType === "anomaly_chart") && vizId != null) {
    iframeSrc = `/a/${vizId}?embedded=true`;
  } else if (vizType === "chart" && vizId != null) {
    iframeSrc = `/t/${vizId}?embedded=true&period=ytd`;
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

export type FeedStoryDetailViewProps = {
  story: EnrichedFeedStory;
  detailNarrative: DetailNarrative | null;
  relatedStories: EnrichedFeedStory[];
  onShare: () => void;
  /** Move a shared saved-place story back to private scope (owner). */
  onMakePrivate?: () => void;
  makePrivatePending?: boolean;
  /** When true, replace the primary article shortcode with the story's saved static asset. */
  preferStaticPrimaryVisualizationInArticle?: boolean;
  /** When set, related stories open in-app (e.g. feed modal) instead of navigating. */
  onSelectRelatedStoryId?: (id: number) => void;
};

/**
 * Shared feed story detail body (header through related stories).
 * Wrap with {@link styles.detailContainer} and an optional back / canonical bar in the parent.
 */
export function FeedStoryDetailView({
  story,
  detailNarrative,
  relatedStories,
  onShare,
  onMakePrivate,
  makePrivatePending = false,
  preferStaticPrimaryVisualizationInArticle = false,
  onSelectRelatedStoryId,
}: FeedStoryDetailViewProps) {
  const publishedDate = formatFullDate(story.published_at);
  const articleHtml = story.article_html?.trim() || null;
  const { resolveMetricKey } = useMetricKey();
  const citySlug = story.city_name ? slugify(story.city_name) : null;
  const district = story.district > 0 ? story.district : null;
  /** Long-form HTML from create_feed_story — use this as the modal body, not summary + HTML. */
  const hasFullArticleHtml = Boolean(articleHtml);
  const inlinePrimaryVisualizationConfig = preferStaticPrimaryVisualizationInArticle
    ? buildPrimaryVisualizationShortcodeConfig({
        image_url: story.image_url_resolved ?? story.image_url ?? null,
        image_alt: story.image_alt_resolved,
        image_caption: story.image_caption_resolved,
        visualization_type: story.visualization_type,
        primary_visualization:
          story.primary_visualization as Record<string, unknown> | null,
      })
    : {};

  const pv = story.primary_visualization;
  const vizType = (story.visualization_type ?? pv?.type ?? "").toLowerCase();
  const vizId = pv?.id != null ? Number(pv.id) : null;
  const vizHash = pv?.short_hash ?? null;

  return (
    <>
      <div className={styles.detailHeaderRow}>
        <span className={styles.detailIcon} style={{ color: story.category_color }}>
          {ICON_COMPONENTS[story.type_icon] ? (() => { const Icon = ICON_COMPONENTS[story.type_icon]; return <Icon size={14} strokeWidth={2.5} />; })() : story.type_icon}
        </span>
        <span className={styles.detailActor}>{story.actor}</span>
        {story.subline && <span className={styles.detailTimestamp}>{story.subline}</span>}
      </div>

      {(story.story_type ?? "").toLowerCase() === "fix_it_already" && (
        <div className={styles.fixItAlreadyBadge}>
          <span aria-hidden="true">{"\u{1F926}"}</span>
          <span>Fix It, Already</span>
        </div>
      )}

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

      {hasFullArticleHtml ? (
        <>
          {/* Lede paragraph — shown before article body, mirrors the canonical story page */}
          {(story.description ?? "").trim().length > 0 && (
            <p className={styles.detailLede}>
              {story.description}
            </p>
          )}
          <div className={styles.detailNarrativeSection}>
            <VisualizationDeferredInteractiveContainer
              className={styles.detailArticleBody}
              html={processVisualizationShortcodes(articleHtml!, {
                ...inlinePrimaryVisualizationConfig,
                showDebug: false,
                showStaticCaptions: false,
                chartHeight: "480px",
                mapHeight: "480px",
                anomalyHeight: "380px",
              })}
            />
          </div>
        </>
      ) : (
        <div className={styles.detailNarrativeSection}>
          {detailNarrative ? (
            detailNarrative.above.map((para, i) => (
              <p key={`above-${i}`} className={styles.detailDescription}>
                {para}
              </p>
            ))
          ) : story.metadata?.metrics ? (
            <div className={styles.metricGrid} style={{ marginTop: 8 }}>
              {(story.metadata.metrics as Array<{ name: string; direction: string; pct: number }>)
                .slice(0, 6)
                .map((m, i) => {
                  const rawPct = typeof m.pct === "number" ? m.pct : parseFloat(String(m.pct)) || 0;
                  const cappedPct = Math.max(Math.min(rawPct, 9999), -9999);
                  const arrow =
                    m.direction === "up" ? "\u2191" : m.direction === "down" ? "\u2193" : "\u2500";
                  const formatted = `${cappedPct >= 0 ? "+" : ""}${Math.round(cappedPct)}%`;
                  return (
                    <div key={i} className={styles.metricCell}>
                      <span className={styles.metricName}>
                        <MetricLink
                          label={m.name}
                          metricKey={resolveMetricKey(m.name)}
                          citySlug={citySlug}
                          district={district}
                        />
                      </span>
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
          ) : story.summary || story.cleaned_description || story.description ? (
            <p className={styles.detailDescription}>
              {story.summary || story.cleaned_description || story.description}
            </p>
          ) : null}
        </div>
      )}

      {!articleHtml && (
        <VizEmbed
          vizType={vizType}
          vizId={vizId}
          vizHash={vizHash}
          cardType={story.card_type}
        />
      )}

      {!articleHtml && detailNarrative && detailNarrative.below.length > 0 && (
        <div className={styles.detailNarrativeSection}>
          {detailNarrative.below.map((para, i) => (
            <p key={`below-${i}`} className={styles.detailDescription}>
              {para}
            </p>
          ))}
        </div>
      )}

      {story.card_type === "context" ? (
        <Link
          href={district ? `/c/${citySlug}/district/${district}` : citySlug ? `/c/${citySlug}` : "/"}
          className={styles.detailReportLink}
        >
          See Data {"\u2192"}
        </Link>
      ) : story.detail_url && !isStoryPageUrl(story.detail_url, story.canonical_url) ? (
        <a href={story.detail_url} className={styles.detailReportLink}>
          {story.cta_label || "Read full report"} {"\u2192"}
        </a>
      ) : null}

      <hr className={styles.detailDivider} />

      <div className={styles.detailActionBar}>
        <button type="button" className={styles.detailActionBtn} onClick={onShare}>
          <Share2 size={16} /> Share
        </button>
        {onMakePrivate ? (
          <button
            type="button"
            className={styles.detailActionBtn}
            onClick={onMakePrivate}
            disabled={makePrivatePending}
          >
            {makePrivatePending ? "Making private…" : "Make private"}
          </button>
        ) : null}
      </div>

      {relatedStories.length > 0 && (
        <>
          <hr className={styles.detailDivider} />
          <h2 className={styles.relatedTitle}>
            More from{" "}
            {story.neighborhood_label?.split("\u00B7")[0]?.trim() || "this city"}
          </h2>
          <div className={styles.relatedList}>
            {relatedStories.map((rs) =>
              onSelectRelatedStoryId ? (
                <button
                  key={rs.id}
                  type="button"
                  className={`${styles.relatedCard} ${styles.relatedCardAsButton}`}
                  onClick={() => onSelectRelatedStoryId(rs.id)}
                >
                  <span className={styles.relatedIcon} style={{ color: rs.category_color }}>
                    {ICON_COMPONENTS[rs.type_icon] ? (() => { const Icon = ICON_COMPONENTS[rs.type_icon]; return <Icon size={12} strokeWidth={2.5} />; })() : rs.type_icon}
                  </span>
                  <div className={styles.relatedContent}>
                    <span className={styles.relatedHeadline}>{rs.headline}</span>
                    <span className={styles.relatedMeta}>{rs.subline}</span>
                  </div>
                </button>
              ) : (
                <Link key={rs.id} href={rs.canonical_url} className={styles.relatedCard}>
                  <span className={styles.relatedIcon} style={{ color: rs.category_color }}>
                    {ICON_COMPONENTS[rs.type_icon] ? (() => { const Icon = ICON_COMPONENTS[rs.type_icon]; return <Icon size={12} strokeWidth={2.5} />; })() : rs.type_icon}
                  </span>
                  <div className={styles.relatedContent}>
                    <span className={styles.relatedHeadline}>{rs.headline}</span>
                    <span className={styles.relatedMeta}>{rs.subline}</span>
                  </div>
                </Link>
              ),
            )}
          </div>
        </>
      )}

    </>
  );
}
