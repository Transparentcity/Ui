import type { PublicFeedStory } from "@/lib/publicApiClient";

type Props = {
  slug: string;
  cityDisplayName: string;
  stories: PublicFeedStory[];
};

export default function FeaturedStories({ slug, cityDisplayName, stories }: Props) {
  if (stories.length === 0) return null;

  const featured = stories[0];
  const secondary = stories.slice(1, 3);

  const storyHref = (story: PublicFeedStory) =>
    story.short_hash
      ? `/c/${slug}/stories/${story.short_hash}`
      : story.detail_url;

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

        <div className={`featured-stories-grid ${secondary.length === 0 ? "featured-stories-grid--single" : ""}`}>
          {/* Primary story */}
          <a href={storyHref(featured)} className="featured-story-card featured-story-card--primary">
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
          </a>

          {/* Secondary stories */}
          {secondary.length > 0 && (
            <div className="featured-stories-secondary">
              {secondary.map((story) => (
                <a
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
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
