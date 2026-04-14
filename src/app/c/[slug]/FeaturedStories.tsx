import type {
  PublicFeedStory,
  PublicCityMetricItem,
  PublicMetricComparisons,
} from "@/lib/publicApiClient";
import type { ReactNode } from "react";
import { improveGenericHeadline } from "@/lib/feed/headlineCleanup";
import {
  type MetricCardData,
} from "@/components/feed/templates/MetricSummaryCard";
import MetricFeedCard from "@/components/feed/MetricFeedCard";

type Props = {
  slug: string;
  cityDisplayName: string;
  cityEmoji?: string;
  stories: PublicFeedStory[];
  metrics?: PublicCityMetricItem[];
  comparisonsMap?: Record<number, PublicMetricComparisons>;
};

function StoryCard({ href, className, children }: { href: string | null; className: string; children: ReactNode }) {
  if (href) {
    return <a href={href} className={className}>{children}</a>;
  }
  return <div className={className}>{children}</div>;
}

function storyHeadline(story: PublicFeedStory): string {
  return improveGenericHeadline(story.headline, {
    summary: story.summary,
    description: story.description,
    cityName: story.city_name,
  });
}

/**
 * Build up to 2 metric summary cards from available comparison data,
 * ranked by absolute percentage change (most interesting first).
 */
function buildMetricCards(
  slug: string,
  cityDisplayName: string,
  cityEmoji: string | undefined,
  metrics?: PublicCityMetricItem[],
  comparisonsMap?: Record<number, PublicMetricComparisons>,
): MetricCardData[] {
  if (!metrics?.length || !comparisonsMap) return [];
  const candidates: Array<{ card: MetricCardData; absPct: number }> = [];
  for (const m of metrics) {
    const comp = comparisonsMap[m.id]?.comparisons?.ytd;
    if (!comp) continue;
    const curr = comp.current_period_value;
    const prior = comp.comparison_period_value;
    if (curr == null || prior == null || prior === 0) continue;
    // Skip incomplete data (e.g. curr=0 showing "down 100%") and very small numbers
    if (curr === 0 || Math.abs(curr) < 5) continue;
    const pct = ((curr - prior) / prior) * 100;
    const idx = candidates.length;
    const hoursAgo = idx * 12 + 2;
    candidates.push({
      card: {
        metric: m,
        comparison: comp,
        slug,
        cityName: cityDisplayName,
        cityEmoji,
        publishedAt: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
      },
      absPct: Math.abs(pct),
    });
  }
  candidates.sort((a, b) => b.absPct - a.absPct);
  return candidates.slice(0, 2).map((c) => c.card);
}

export default function FeaturedStories({
  slug,
  cityDisplayName,
  cityEmoji,
  stories,
  metrics,
  comparisonsMap,
}: Props) {
  const metricCards = buildMetricCards(slug, cityDisplayName, cityEmoji, metrics, comparisonsMap);

  // If no stories and no metric cards, render nothing
  if (stories.length === 0 && metricCards.length === 0) return null;

  // If no stories but we have metric cards, render just the metric cards
  if (stories.length === 0) {
    return (
      <section className="featured-stories-section">
        <div className="container">
          <header className="section-header" style={{ marginBottom: "1.25rem" }}>
            <span className="section-badge">What&rsquo;s happening</span>
            <h2 className="section-heading">Latest from {cityDisplayName}</h2>
          </header>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {metricCards.map((mc) => (
              <MetricFeedCard key={mc.metric.id} data={mc} hideActions />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Show up to 10 most recent stories
  const visible = stories.slice(0, 10);

  const storyHref = (story: PublicFeedStory): string | null =>
    story.short_hash
      ? `/c/${slug}/stories/${story.short_hash}`
      : story.detail_url?.startsWith("/c/") || story.detail_url?.startsWith("/s/")
        ? story.detail_url
        : null;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <section className="featured-stories-section">
      <div className="container">
        <header className="section-header" style={{ marginBottom: "1.25rem" }}>
          <span className="section-badge">What&rsquo;s happening</span>
          <h2 className="section-heading">Latest from {cityDisplayName}</h2>
        </header>

        <div className="featured-stories-grid featured-stories-grid--2x2">
          {visible.map((story) => (
            <StoryCard
              key={story.id}
              href={storyHref(story)}
              className="featured-story-card featured-story-card--secondary"
            >
              <h4 className="featured-story-headline-sm">{storyHeadline(story)}</h4>
              {story.description && (
                <p className="featured-story-desc-sm">{story.description}</p>
              )}
              {story.published_at && (
                <span className="featured-story-date">
                  {formatDate(story.published_at)}
                </span>
              )}
            </StoryCard>
          ))}
        </div>

        {/* Metric summary cards */}
        {metricCards.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            {metricCards.map((mc) => (
              <MetricFeedCard key={mc.metric.id} data={mc} hideActions />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
