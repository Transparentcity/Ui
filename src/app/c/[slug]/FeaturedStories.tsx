import type {
  PublicFeedStory,
  PublicCityMetricItem,
  PublicMetricComparisons,
} from "@/lib/publicApiClient";
import type { ReactNode } from "react";
import SafeImage from "@/components/SafeImage";
import { improveGenericHeadline } from "@/lib/feed/headlineCleanup";
import MetricSummaryCard, {
  type MetricCardData,
} from "@/components/feed/templates/MetricSummaryCard";

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
              <MetricSummaryCard key={mc.metric.id} data={mc} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Show 4 stories when available (balanced 2x2 grid), otherwise up to 3
  const visible = stories.slice(0, stories.length >= 4 ? 4 : 3);
  const use2x2 = visible.length === 4;

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

  // Balanced 2x2 grid: all stories rendered uniformly
  if (use2x2) {
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
                <MetricSummaryCard key={mc.metric.id} data={mc} />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  // Original layout: 1 primary + up to 2 secondary
  const featured = visible[0];
  const secondary = visible.slice(1);

  return (
    <section className="featured-stories-section">
      <div className="container">
        <header className="section-header" style={{ marginBottom: "1.25rem" }}>
          <span className="section-badge">What&rsquo;s happening</span>
          <h2 className="section-heading">Latest from {cityDisplayName}</h2>
        </header>

        <div className={`featured-stories-grid ${secondary.length === 0 ? "featured-stories-grid--single" : ""}`}>
          {/* Primary story */}
          <StoryCard href={storyHref(featured)} className="featured-story-card featured-story-card--primary">
            {featured.image_url && (
              <SafeImage
                src={featured.image_url}
                alt=""
                className="featured-story-img"
              />
            )}
            <div className="featured-story-body">
              <h3 className="featured-story-headline">{storyHeadline(featured)}</h3>
              {featured.description && (
                <p className="featured-story-desc">{featured.description}</p>
              )}
              {featured.published_at && (
                <span className="featured-story-date">
                  {formatDate(featured.published_at)}
                </span>
              )}
            </div>
          </StoryCard>

          {/* Secondary stories */}
          {secondary.length > 0 && (
            <div className="featured-stories-secondary">
              {secondary.map((story) => (
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
          )}
        </div>

        {/* Metric summary cards */}
        {metricCards.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            {metricCards.map((mc) => (
              <MetricSummaryCard key={mc.metric.id} data={mc} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
