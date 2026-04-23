import type {
  PublicFeedStory,
  PublicCityMetricItem,
  PublicMetricComparisons,
} from "@/lib/publicApiClient";
import { improveGenericHeadline } from "@/lib/feed/headlineCleanup";
import {
  type MetricCardData,
} from "@/components/feed/templates/MetricSummaryCard";
import MetricFeedCard from "@/components/feed/MetricFeedCard";
import { getCategoryMeta } from "@/lib/feed/mockFeedData";
import CardHeader from "@/components/feed/CardHeader";
import SourceLine from "@/components/SourceLine";
import feedStyles from "@/components/feed/feed.module.css";

type Props = {
  slug: string;
  cityDisplayName: string;
  cityEmoji?: string;
  stories: PublicFeedStory[];
  metrics?: PublicCityMetricItem[];
  comparisonsMap?: Record<number, PublicMetricComparisons>;
};

function storyHeadline(story: PublicFeedStory): string {
  return improveGenericHeadline(story.headline, {
    summary: story.summary,
    description: story.description,
    cityName: story.city_name,
  });
}

/** Derive a department / actor from the story headline (keyword matching). */
function deriveActor(headline: string): string {
  const hl = headline.toLowerCase();
  if (/graffiti|pothole|street\s*light|sidewalk|trash|litter|dumping|street\s*clean/.test(hl)) return "Public Works";
  if (/fire\s*(?:dep|dept|department)|fire\s*call|arson/.test(hl)) return "Fire Dept";
  if (/911|police|crime|theft|robbery|assault|homicide|shooting|burglary|arrest/.test(hl)) return "Police";
  if (/permit|building|inspection|housing|code\s*(?:enforce|violation)/.test(hl)) return "Building Dept";
  if (/\bparks?\b(?!\s+(?:traffic|light|ave|blvd|street|st|rd|dr|way|lane|ct))|recreation|playground|\btree(?:s|\b)(?!\s*light)/.test(hl)) return "Parks & Rec";
  if (/transit|bus|muni|subway|metro|rail|bike\s*lane/.test(hl)) return "Transit";
  if (/school|education|student|enrollment/.test(hl)) return "Education";
  if (/health|hospital|overdose|mental\s*health/.test(hl)) return "Public Health";
  if (/budget|contract|spending|procurement/.test(hl)) return "Controller";
  if (/restaurant|food|business\s*license|retail|storefront/.test(hl)) return "Business";
  if (/311|service\s*request|complaint/.test(hl)) return "311";
  if (/court|da\b|prosecutor|charges|sentenc/.test(hl)) return "District Attorney";
  if (/water|sewer|utility/.test(hl)) return "Utilities";

  // Fall back by story_type
  const st = (headline ?? "").toLowerCase();
  if (st.includes("safety") || st.includes("crime")) return "Police";
  return "City Hall";
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
    if (curr === 0 || Math.abs(curr) < 5) continue;
    const pct = ((curr - prior) / prior) * 100;
    // Suppress bad data: value dropped to 0 (data gap), change > 500%,
    // or extreme drops (>= 90%) that indicate partial reporting periods
    if (curr === 0 && pct === -100) continue;
    if (Math.abs(pct) > 500) continue;
    if (pct <= -90) continue;
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

function StoryFeedCard({
  story,
  slug,
  cityDisplayName,
  cityEmoji,
}: {
  story: PublicFeedStory;
  slug: string;
  cityDisplayName: string;
  cityEmoji?: string;
}) {
  const headline = storyHeadline(story);
  const actor = deriveActor(headline);
  const catMeta = getCategoryMeta(actor);
  const cityNameOnly = cityDisplayName.split(",")[0].trim();
  const neighborhoodLabel = cityEmoji
    ? `${cityEmoji} ${cityNameOnly}`
    : cityNameOnly;
  const dateLabel = formatDate(story.published_at);

  const href = story.short_hash
    ? `/c/${slug}/stories/${story.short_hash}`
    : story.detail_url || null;

  return (
    <div
      className={feedStyles.card}
      style={{ position: "relative", color: "inherit" }}
    >
      {href && (
        <a
          href={href}
          aria-label={headline}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            textDecoration: "none",
          }}
        />
      )}
      <div style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
        <CardHeader
          typeIcon={catMeta.icon}
          typeLabel="Story"
          actor={catMeta.label}
          subline={dateLabel ?? ""}
          neighborhoodLabel={neighborhoodLabel}
          categoryColor={catMeta.color}
        />
        <h2 className={feedStyles.cardHeadline}>{headline}</h2>
        {story.description && (
          <p className={feedStyles.cardDescription}>{story.description}</p>
        )}
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 2,
          marginTop: "auto",
          paddingTop: 12,
          pointerEvents: "auto",
        }}
      >
        <SourceLine category={actor} citySlug={slug} />
      </div>
    </div>
  );
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

  if (stories.length === 0 && metricCards.length === 0) {
    return (
      <section className="featured-stories-section">
        <div className="container">
          <header className="section-header" style={{ marginBottom: "1.25rem" }}>
            <span className="section-badge">What&rsquo;s happening</span>
            <h2 className="section-heading">Latest from {cityDisplayName}</h2>
          </header>
          <div
            style={{
              background: "var(--bg-secondary, #f8f9fa)",
              border: "1px solid var(--border-primary, #e5e7eb)",
              borderRadius: "12px",
              padding: "24px 20px",
              textAlign: "center",
              color: "var(--text-secondary, #6b7280)",
              fontSize: "15px",
              lineHeight: "1.6",
            }}
          >
            <p style={{ margin: "0 0 8px" }}>
              We don&rsquo;t have stories for {cityDisplayName} just yet. We&rsquo;re
              working on it.
            </p>
            <p style={{ margin: 0 }}>
              In the meantime, check out{" "}
              <a
                href="/"
                style={{
                  color: "var(--brand-primary, #6366f1)",
                  textDecoration: "underline",
                  fontWeight: 500,
                }}
              >
                what&rsquo;s happening across all cities
              </a>.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Show up to 10 most recent stories
  const visible = stories.slice(0, 10);

  return (
    <section className="featured-stories-section">
      <div className="container">
        <header className="section-header" style={{ marginBottom: "1.25rem" }}>
          <span className="section-badge">What&rsquo;s happening</span>
          <h2 className="section-heading">Latest from {cityDisplayName}</h2>
        </header>

        <div className="featured-stories-grid">
          {/* Metric summary cards */}
          {metricCards.map((mc) => (
            <MetricFeedCard key={mc.metric.id} data={mc} hideActions />
          ))}

          {/* Story cards */}
          {visible.map((story) => (
            <StoryFeedCard
              key={story.id}
              story={story}
              slug={slug}
              cityDisplayName={cityDisplayName}
              cityEmoji={cityEmoji}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
