import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import "../../../../landing.css";

import {
  getPublicFeedStoryByHash,
  listPublicCitiesForSitemap,
  listPublicFeedStories,
} from "@/lib/publicApiClient";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import SafeImage from "@/components/SafeImage";
import { StoryFallbackVizEmbed } from "@/components/StoryFallbackVizEmbed";
import { VisualizationDeferredInteractiveContainer } from "@/components/VisualizationDeferredInteractiveContainer";
import CitySignupButton from "../../CitySignupButton";
import {
  articleUsesPrimaryVisualizationShortcode,
  buildPrimaryVisualizationShortcodeConfig,
  processVisualizationShortcodes,
} from "@/lib/visualizationShortcodes";
import ShareButton from "./ShareButton";
import AdminStoryProvenance from "@/components/feed/AdminStoryProvenance";
import CitySignupCTA from "../../CitySignupCTA";
import { SignupEmailProvider } from "../../SignupEmailContext";
import { improveGenericHeadline } from "@/lib/feed/headlineCleanup";
import { slugify } from "@/lib/utils";
import Breadcrumb from "@/components/Breadcrumb";
import { enrichStory } from "@/lib/feed/mockFeedData";
import type { FeedStory } from "@/lib/hooks/useFeed";

export const revalidate = 3600;

/**
 * Returns true when detail_url points back to this story's own page,
 * whether as a relative path (/s/HASH, /c/slug/stories/HASH) or an
 * absolute URL (https://transparent.city/c/slug/stories/HASH).
 */
function isSelfReferentialUrl(detailUrl: string, slug: string, hash: string): boolean {
  if (!detailUrl) return true;
  if (detailUrl.startsWith("/s/")) return true;
  if (/^\/c\/[^/]+\/stories\//.test(detailUrl)) return true;
  // Strip absolute origin so "https://transparent.city/s/HASH" is also caught
  try {
    const parsed = new URL(detailUrl, "https://transparent.city");
    const path = parsed.pathname;
    if (path.startsWith("/s/")) return true;
    if (/^\/c\/[^/]+\/stories\//.test(path)) return true;
  } catch {
    // not a valid URL, fall through
  }
  return false;
}

type PageProps = {
  params: Promise<{ slug: string; hash: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, hash } = await params;
  try {
    const { story } = await getPublicFeedStoryByHash(hash);
    const cityName = story.city_name ?? slug;
    const headline = improveGenericHeadline(story.headline ?? "", {
      summary: story.summary,
      description: story.description,
      cityName: story.city_name,
    });
    const lede = (story.description ?? story.summary ?? "").trim();
    const descSnippet = lede.length > 0 ? lede.slice(0, 160) : headline.slice(0, 160);
    const canonical = `/c/${slug}/stories/${hash}`;
    return {
      title: headline || "Story",
      description: descSnippet,
      alternates: { canonical },
      openGraph: {
        title: headline || "Story",
        description: descSnippet,
        url: canonical,
        type: "article",
        ...(story.image_url ? { images: [{ url: story.image_url }] } : {}),
      },
      twitter: {
        card: story.image_url ? "summary_large_image" : "summary",
        title: headline || "Story",
        description: descSnippet,
        ...(story.image_url ? { images: [story.image_url] } : {}),
      },
      other: {
        "article:section": cityName,
        ...(story.published_at || story.story_date
          ? { "article:published_time": story.published_at ?? story.story_date }
          : {}),
      },
    };
  } catch {
    return { title: "Story – Transparent.city" };
  }
}

export default async function CanonicalStoryPage({ params }: PageProps) {
  const { slug, hash } = await params;

  let story: Awaited<ReturnType<typeof getPublicFeedStoryByHash>>["story"] | null = null;
  try {
    const res = await getPublicFeedStoryByHash(hash);
    story = res.story;
  } catch {
    notFound();
  }

  if (!story) notFound();

  // Fix generic placeholder headlines ("The Fact", etc.)
  const headline = improveGenericHeadline(story.headline ?? "", {
    summary: story.summary,
    description: story.description,
    cityName: story.city_name,
  });

  // Resolve city display name from slug
  let cityDisplay = story.city_name ?? slug;
  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => slugify(c.name) === slug);
    if (match) {
      cityDisplay =
        match.state && match.country && match.country !== "United States"
          ? `${match.name}, ${match.state}, ${match.country}`
          : match.state
            ? `${match.name}, ${match.state}`
            : match.name;
    }
  } catch {
    // fall back to story city_name or slug
  }

  // Fetch related stories from the same city
  let relatedStories: Awaited<ReturnType<typeof listPublicFeedStories>>["stories"] = [];
  try {
    const feedRes = await listPublicFeedStories({
      city_id: story.city_id,
      limit: 10,
      order_by: "published_at",
    });
    relatedStories = (feedRes.stories ?? [])
      .filter((s) => s.id !== story!.id)
      .slice(0, 3);
  } catch {
    // Non-critical, just skip related stories
  }

  const backHref = `/c/${slug}`;
  const districtHref =
    story.district && story.district > 0
      ? `/c/${slug}/district/${story.district}`
      : null;

  const storyDate = story.published_at
    ? new Date(story.published_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : story.story_date
      ? new Date(story.story_date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;
  const renderPrimaryInline =
    !!story.article_html &&
    articleUsesPrimaryVisualizationShortcode(story.article_html, story);
  const shortcodeConfig = buildPrimaryVisualizationShortcodeConfig(story);
  const interactiveShortcodeConfig = {
    ...shortcodeConfig,
    staticVisualizations: undefined,
  };

  const pvRecord = story.primary_visualization as Record<string, unknown> | null;
  const fallbackVizType = (story.visualization_type ?? "").toLowerCase();
  let primaryFallbackIframeSrc: string | null = null;
  if (pvRecord && fallbackVizType) {
    const vizId = pvRecord.id != null ? Number(pvRecord.id) : null;
    const vizHash = typeof pvRecord.short_hash === "string" ? pvRecord.short_hash : null;
    if (
      (fallbackVizType === "anomaly" || fallbackVizType === "anomaly_chart") &&
      vizId != null
    ) {
      primaryFallbackIframeSrc = `/a/${vizId}?embedded=true`;
    } else if (fallbackVizType === "chart" && vizId != null) {
      primaryFallbackIframeSrc = `/t/${vizId}?embedded=true`;
    } else if (fallbackVizType === "map" && vizHash) {
      primaryFallbackIframeSrc = `/m/${vizHash}?embedded=true`;
    } else if (fallbackVizType === "map" && vizId != null) {
      primaryFallbackIframeSrc = `/m/${vizId}?embedded=true`;
    }
  }

  const heroImageSrc = (story.image_url ?? "").trim();
  const isGeneratedSocialCard = heroImageSrc.startsWith("/api/feed/public/story-image/");

  const fallbackImageWithDeferredInteractive =
    !story.article_html &&
    !!primaryFallbackIframeSrc &&
    !!heroImageSrc &&
    !isGeneratedSocialCard;

  const showHeroImage =
    !!heroImageSrc &&
    !isGeneratedSocialCard &&
    !renderPrimaryInline &&
    !fallbackImageWithDeferredInteractive;

  return (
    <SignupEmailProvider>
      <PublicNavBar>
        <CitySignupButton citySlug={slug} cityName={story.city_name ?? slug} />
      </PublicNavBar>

      <article
        className="story-article-container"
      >
        {/* Breadcrumb */}
        <Breadcrumb items={[
          { label: cityDisplay, href: backHref },
          ...(districtHref ? [{ label: `District ${story.district}`, href: districtHref }] : []),
          { label: "Story" },
        ]} />

        {/* Story type badge */}
        <div className="story-badge-wrapper">
          <span
            className={`story-badge ${story.story_type === "traction" ? "story-badge-traction" : "story-badge-default"}`}
          >
            {(story.story_type ?? "story").replace(/_/g, " ")}
          </span>
        </div>

        {/* Headline */}
        <h1 className="story-headline">
          {headline.trim() || "Story"}
        </h1>

        {/* Meta */}
        <div className="story-meta">
          {storyDate && <span>{storyDate}</span>}
          <span>
            {story.city_emoji} {cityDisplay}
            {story.district && story.district > 0 ? ` · District ${story.district}` : ""}
          </span>
          <AdminStoryProvenance
            metadata={story.metadata ?? null}
            modelKey={story.job_model_key}
            sessionId={story.job_session_id}
          />
        </div>

        {/* Hero image */}
        {showHeroImage && (
          <figure className="story-hero-image">
            <SafeImage
              src={heroImageSrc}
              alt={story.image_alt || headline}
              className="story-hero-img"
            />
          </figure>
        )}

        {/* Short description / lede */}
        {(story.description ?? "").trim().length > 0 && (
          <p className="story-lede">
            {story.description}
          </p>
        )}

        {/* Long-form article body — shortcodes like [chart:N], [anomaly:N], [map:HASH] become iframes */}
        {story.article_html ? (
          <VisualizationDeferredInteractiveContainer
            className="story-article-body"
            html={processVisualizationShortcodes(story.article_html, {
              ...interactiveShortcodeConfig,
              showDebug: false,
              showStaticCaptions: false,
              chartHeight: "480px",
              mapHeight: "480px",
              anomalyHeight: "380px",
            })}
          />
        ) : (
          <>
            {story.summary && (
              <p className="story-summary">
                {story.summary}
              </p>
            )}
            {fallbackImageWithDeferredInteractive && story.image_url ? (
              <StoryFallbackVizEmbed
                imageUrl={story.image_url}
                imageAlt={story.image_alt}
                imageCaption={story.image_caption}
                showImageCaption={false}
                iframeSrc={primaryFallbackIframeSrc!}
                iframeTitle="Visualization"
                iframeHeight="420px"
              />
            ) : primaryFallbackIframeSrc ? (
              <div className="story-article-body story-fallback-viz">
                <div className="visualization-embed">
                  <iframe
                    src={primaryFallbackIframeSrc}
                    title="Visualization"
                    className="story-viz-iframe"
                    loading="lazy"
                  />
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* CTA — context stories link to the city dashboard; other types
             show detail_url (stripping #story-{hash} fragments to avoid
             redirect loops back to this canonical story page).
             Fallback: always link to the dashboard so no story is a dead end. */}
        {(() => {
          const dashboardHref = districtHref ?? backHref;
          const dashboardLabel = "See Data";

          if (story.story_type === "context") {
            return (
              <div className="story-cta-divider">
                <Link href={dashboardHref} className="btn btn-primary">
                  {dashboardLabel} {"\u2192"}
                </Link>
              </div>
            );
          }

          if (story.detail_url && !isSelfReferentialUrl(story.detail_url, slug, hash)) {
            const ctaUrl = story.detail_url.replace(/#story-[A-Za-z0-9_-]+$/, "");
            if (ctaUrl) {
              return (
                <div className="story-cta-divider">
                  <a
                    href={ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    {story.cta_label ?? "View source data"}
                  </a>
                </div>
              );
            }
          }

          // Fallback: link to dashboard so every story has a forward path
          return (
            <div className="story-cta-divider">
              <Link href={dashboardHref} className="btn btn-primary">
                {dashboardLabel} {"\u2192"}
              </Link>
            </div>
          );
        })()}

        {/* Divider + Share */}
        <hr className="story-hr" />

        <div className="story-share-row">
          <ShareButton
            title={headline.trim() || "Story"}
            url={`/c/${slug}/stories/${hash}`}
          />
        </div>

        {/* Related stories from the same city */}
        {relatedStories.length > 0 && (
          <>
            <hr className="story-hr" />
            <h2 className="story-related-heading">
              More from {story.city_name || "this city"}
            </h2>
            <div className="story-related-list">
              {relatedStories.filter(rs => rs.short_hash).map((rs) => (
                <Link
                  key={rs.id}
                  href={`/c/${slug}/stories/${rs.short_hash}`}
                  className="story-related-card"
                >
                  <span className="story-related-emoji">
                    {rs.story_type === "off_the_charts" ? "\u{1F92F}" : rs.story_type === "alert" ? "\u{1F6A8}" : rs.story_type === "trend" ? "\u{1F4C8}" : rs.story_type === "milestone" ? "\u{1F3C6}" : "\u{1F4CB}"}
                  </span>
                  <div className="story-related-text">
                    <span className="story-related-headline">
                      {improveGenericHeadline(rs.headline, { summary: rs.summary, description: rs.description, cityName: rs.city_name })}
                    </span>
                    <span className="story-related-date">
                      {rs.published_at
                        ? new Date(rs.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : rs.story_date
                          ? new Date(rs.story_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : ""}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* Newsletter signup CTA — only shown to logged-out users */}
        <div style={{
          margin: "32px 0",
          padding: "24px",
          borderRadius: 12,
          background: "var(--bg-secondary, #f5f5f5)",
        }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px", color: "var(--text-primary)" }}>
            Sign up now, get your first newsletter this week
          </p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
            {cityDisplay}&rsquo;s public data, explained. Crime trends, housing, city services, and more.
          </p>
          <CitySignupCTA citySlug={slug} cityName={cityDisplay} />
        </div>
      </article>

      <PublicFooter citySlug={slug} feedbackPageUrl={`/c/${slug}/stories/${hash}`} feedbackPageType="story" />

      {/* Inline styles for article body */}
      <style>{`
        .story-article-container {
          max-width: 760px;
          margin: 0 auto;
          padding: 96px 24px 80px;
        }
        @media (max-width: 640px) {
          .story-article-container {
            padding: 80px 16px 48px;
          }
        }

        /* ── Breadcrumb ─────────────────────────────────────────────── */
        .story-breadcrumb {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 24px;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .story-breadcrumb-link {
          color: var(--text-secondary);
          text-decoration: none;
          transition: color 0.15s;
        }
        .story-breadcrumb-link:hover {
          color: var(--brand-primary);
        }
        .story-breadcrumb-sep {
          opacity: 0.4;
        }

        /* ── Story type badge ───────────────────────────────────────── */
        .story-badge-wrapper {
          margin-bottom: 16px;
        }
        .story-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .story-badge-default {
          background: var(--accent-muted);
          color: var(--brand-primary);
        }
        .story-badge-traction {
          background: var(--success-muted);
          color: var(--success);
        }

        /* ── Headline ──────────────────────────────────────────────── */
        .story-headline {
          font-size: clamp(1.6rem, 4vw, 2.2rem);
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 16px;
          color: var(--text-primary);
        }

        /* ── Meta line ──────────────────────────────────────────────── */
        .story-meta {
          display: flex;
          align-items: center;
          gap: 10px 16px;
          flex-wrap: wrap;
          margin-bottom: 24px;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .story-meta-sep {
          color: #9a9a9f;
        }

        /* ── Hero image ─────────────────────────────────────────────── */
        .story-hero-image {
          margin-bottom: 32px;
          border-radius: 8px;
          overflow: hidden;
        }
        .story-hero-img {
          width: 100%;
          height: auto;
          display: block;
        }

        /* ── Lede / summary ────────────────────────────────────────── */
        .story-lede {
          font-size: 1.125rem;
          line-height: 1.7;
          margin-bottom: 32px;
          font-weight: 500;
          color: var(--text-primary);
        }
        .story-summary {
          line-height: 1.7;
          color: var(--text-secondary);
        }
        .story-fallback-viz {
          margin-top: 8px;
        }

        /* ── Share row ─────────────────────────────────────────────── */
        .story-share-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        /* ── CTA divider + horizontal rules ─────────────────────────── */
        .story-cta-divider {
          margin-top: 40px;
          padding-top: 24px;
          border-top: 1px solid var(--border-primary);
        }
        .story-hr {
          border: none;
          border-top: 1px solid var(--border-primary);
          margin: 24px 0;
        }

        /* ── Related stories ────────────────────────────────────────── */
        .story-related-heading {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 12px;
        }
        .story-related-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .story-related-card {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px;
          border-radius: 10px;
          background: var(--bg-secondary);
          text-decoration: none;
          color: inherit;
          transition: background 0.15s ease;
        }
        .story-related-card:hover {
          background: var(--bg-tertiary);
        }
        .story-related-card:focus-visible {
          outline: 2px solid var(--brand-primary);
          outline-offset: 2px;
        }
        .story-related-emoji {
          font-size: 20px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .story-related-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .story-related-headline {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .story-related-date {
          font-size: 12px;
          color: var(--text-tertiary);
        }

        /* ── Article body ───────────────────────────────────────────── */
        .story-article-body {
          line-height: 1.75;
          font-size: 1rem;
          color: var(--text-primary);
        }
        .story-article-body h2 {
          font-size: 1.25rem;
          font-weight: 700;
          margin: 2rem 0 0.75rem;
        }
        .story-article-body p {
          margin-bottom: 1.25rem;
          color: var(--text-primary);
        }
        .story-article-body a {
          color: var(--brand-primary);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .story-article-body a:hover {
          opacity: 0.75;
        }
        .story-article-body figure {
          margin: 2rem 0;
          padding: 24px;
          background: var(--bg-subtle);
          border-radius: 8px;
          text-align: center;
          color: var(--text-secondary);
          font-size: 0.9rem;
        }
        .story-viz-iframe {
          height: 420px;
        }
        @media (max-width: 640px) {
          .story-viz-iframe {
            height: 300px;
          }
        }
        /* Visualization embed blocks (chart / map / anomaly iframes) */
        .story-article-body .visualization-embed {
          margin: 2rem 0;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--border-primary);
          background: var(--bg-subtle);
        }
        .story-article-body .viz-embed-copy {
          padding: 12px 14px 10px;
          background: var(--bg-primary);
        }
        .story-article-body .viz-embed-title {
          font-size: 0.95rem;
          line-height: 1.35;
          font-weight: 700;
          color: var(--text-primary);
        }
        .story-article-body .viz-embed-subtitle {
          font-size: 0.8rem;
          line-height: 1.35;
          color: var(--text-secondary);
        }
        .story-article-body .viz-embed-caption {
          flex: 1 1 auto;
          min-width: 0;
          font-size: 0.78rem;
          line-height: 1.4;
          color: var(--text-secondary);
        }
        .story-article-body .viz-embed-footer {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 7px 10px 8px 12px;
          background: var(--bg-primary);
        }
        .story-article-body .visualization-embed iframe {
          display: block;
          border: none;
          width: 100%;
        }
        .story-article-body .visualization-static-image {
          width: 100%;
          display: block;
        }
        .story-article-body .visualization-static-caption {
          padding: 10px 12px 12px;
          font-size: 0.8125rem;
          line-height: 1.5;
          color: var(--text-secondary);
          border-top: 1px solid var(--border-primary);
          background: var(--bg-secondary);
        }
        .story-article-body .viz-embed-source-row {
          display: flex;
          justify-content: flex-end;
          flex: 0 0 auto;
          margin-left: auto;
        }
        .story-article-body .viz-embed-source-button {
          appearance: none;
          border: 0;
          background: transparent;
          color: var(--text-muted, #9ca3af);
          cursor: pointer;
          font-size: 0.72rem;
          font-weight: 500;
          padding: 2px 4px;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .story-article-body .viz-embed-source-button:hover {
          color: var(--brand-primary);
        }
        .viz-source-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(17, 24, 39, 0.5);
        }
        .viz-source-modal {
          position: relative;
          width: min(420px, 100%);
          padding: 22px;
          border-radius: 14px;
          background: var(--bg-primary);
          color: var(--text-primary);
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.22);
        }
        .viz-source-modal-close {
          position: absolute;
          top: 10px;
          right: 12px;
          border: 0;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 1.3rem;
          line-height: 1;
        }
        .viz-source-modal-eyebrow {
          margin: 0 0 4px;
          color: var(--brand-primary);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .viz-source-modal h2 {
          margin: 0 24px 8px 0;
          font-size: 1.05rem;
          line-height: 1.35;
        }
        .viz-source-modal p {
          margin: 0 0 14px;
          color: var(--text-secondary);
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .viz-source-modal-primary-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin: 0 0 16px;
          padding: 9px 12px;
          border-radius: 8px;
          background: var(--brand-primary);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 700;
          text-decoration: none;
        }
        .viz-source-modal-primary-link:hover {
          background: var(--brand-primary-hover);
        }
        .viz-source-modal-details {
          display: grid;
          gap: 10px;
          padding-top: 12px;
          border-top: 1px solid var(--border-primary);
        }
        .viz-source-modal-row {
          display: grid;
          grid-template-columns: 104px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          font-size: 0.85rem;
          line-height: 1.45;
        }
        .viz-source-modal-row span,
        .viz-source-modal-query span {
          color: var(--text-tertiary, #6b7280);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .viz-source-modal-row a,
        .viz-source-modal-row strong,
        .viz-source-modal-row code {
          min-width: 0;
          color: var(--text-primary);
          font-size: 0.85rem;
          font-weight: 600;
          word-break: break-word;
        }
        .viz-source-modal-row a {
          color: var(--brand-primary);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .viz-source-modal-query {
          display: grid;
          gap: 6px;
        }
        .viz-source-modal-query pre {
          max-height: 140px;
          overflow: auto;
          margin: 0;
          padding: 10px;
          border-radius: 8px;
          background: var(--bg-tertiary);
          color: var(--text-primary);
          font-size: 0.76rem;
          line-height: 1.45;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .viz-source-modal-link {
          display: inline-flex;
          color: var(--brand-primary);
          font-size: 0.9rem;
          font-weight: 700;
          text-decoration: none;
        }
        @media (max-width: 640px) {
          .story-article-body .visualization-embed {
            margin-left: -16px;
            margin-right: -16px;
            border-radius: 0;
            border-left: none;
            border-right: none;
          }
        }
        /* Source citation blocks written by Seymour */
        .story-article-body .sources {
          margin-top: 2rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border-primary);
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .story-article-body .sources a {
          font-size: 0.85rem;
        }
      `}</style>
    </SignupEmailProvider>
  );
}
