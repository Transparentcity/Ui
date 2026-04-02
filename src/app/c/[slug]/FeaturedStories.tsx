import type { PublicFeedStory } from "@/lib/publicApiClient";
import type { ReactNode } from "react";

type Props = {
  slug: string;
  cityDisplayName: string;
  stories: PublicFeedStory[];
};

function StoryCard({ href, className, children }: { href: string | null; className: string; children: ReactNode }) {
  if (href) {
    return <a href={href} className={className}>{children}</a>;
  }
  return <div className={className}>{children}</div>;
}

export default function FeaturedStories({ slug, cityDisplayName, stories }: Props) {
  if (stories.length === 0) return null;

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
                <h4 className="featured-story-headline-sm">{story.headline}</h4>
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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={featured.image_url}
                alt=""
                className="featured-story-img"
              />
            )}
            <div className="featured-story-body">
              <h3 className="featured-story-headline">{featured.headline}</h3>
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
                  <h4 className="featured-story-headline-sm">{story.headline}</h4>
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
      </div>
    </section>
  );
}
