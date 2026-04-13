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
import NavEmailSignup from "../../NavEmailSignup";
import { processVisualizationShortcodes } from "@/lib/visualizationShortcodes";
import ShareButton from "./ShareButton";
import CityHeroNewsletter from "../../CityHeroNewsletter";
import { SignupEmailProvider } from "../../SignupEmailContext";
import { improveGenericHeadline } from "@/lib/feed/headlineCleanup";
import { slugify } from "@/lib/utils";

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

  return (
    <SignupEmailProvider>
      <PublicNavBar>
        <NavEmailSignup citySlug={slug} cityName={story.city_name ?? slug} />
      </PublicNavBar>

      <article
        className="story-article-container"
      >
        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" style={{ marginBottom: 24, fontSize: 13 }}>
          <Link href={backHref} style={{ color: "var(--text-secondary)", textDecoration: "none" }}>
            {cityDisplay}
          </Link>
          {districtHref && (
            <>
              {" / "}
              <Link href={districtHref} style={{ color: "var(--text-secondary)", textDecoration: "none" }}>
                District {story.district}
              </Link>
            </>
          )}
          {" / "}
          <span style={{ color: "var(--text-secondary)" }}>Story</span>
        </nav>

        {/* Story type badge */}
        <div style={{ marginBottom: 16 }}>
          <span
            style={{
              display: "inline-block",
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: story.story_type === "traction"
                ? "rgba(16, 185, 129, 0.1)"
                : "var(--accent-muted, rgba(173,53,250,0.1))",
              color: story.story_type === "traction"
                ? "#10b981"
                : "var(--brand-primary, #ad35fa)",
            }}
          >
            {(story.story_type ?? "story").replace(/_/g, " ")}
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontSize: "clamp(1.6rem, 4vw, 2.2rem)",
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: 16,
          }}
        >
          {headline.trim() || "Story"}
        </h1>

        {/* Meta */}
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 24,
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          {storyDate && <span>{storyDate}</span>}
          <span>
            {story.city_emoji} {cityDisplay}
            {story.district && story.district > 0 ? ` · District ${story.district}` : ""}
          </span>
        </div>

        {/* Hero image */}
        {story.image_url && (
          <div style={{ marginBottom: 32, borderRadius: 8, overflow: "hidden" }}>
            <SafeImage
              src={story.image_url}
              alt={headline}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>
        )}

        {/* Short description / lede */}
        {(story.description ?? "").trim().length > 0 && (
          <p
            style={{
              fontSize: "1.125rem",
              lineHeight: 1.7,
              marginBottom: 32,
              fontWeight: 500,
            }}
          >
            {story.description}
          </p>
        )}

        {/* Long-form article body — shortcodes like [chart:N], [anomaly:N], [map:HASH] become iframes */}
        {story.article_html ? (
          <div
            className="story-article-body"
            style={{
              lineHeight: 1.75,
              fontSize: "1rem",
            }}
            dangerouslySetInnerHTML={{
              __html: processVisualizationShortcodes(story.article_html, {
                showDebug: false,
                chartHeight: "420px",
                mapHeight: "480px",
                anomalyHeight: "380px",
              }),
            }}
          />
        ) : (
          <>
            {story.summary && (
              <p style={{ lineHeight: 1.7, color: "var(--text-secondary)" }}>
                {story.summary}
              </p>
            )}
            {/* Fallback: embed primary visualization when no article_html */}
            {story.primary_visualization && story.visualization_type && (() => {
              const vizType = story.visualization_type.toLowerCase();
              const pv = story.primary_visualization as Record<string, unknown>;
              const vizId = pv.id != null ? Number(pv.id) : null;
              const vizHash = typeof pv.short_hash === "string" ? pv.short_hash : null;
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
              return iframeSrc ? (
                <div
                  className="story-article-body"
                  style={{ marginTop: 8 }}
                >
                  <div className="visualization-embed">
                    <iframe
                      src={iframeSrc}
                      title="Visualization"
                      className="story-viz-iframe"
                      style={{ width: "100%", border: "none", display: "block" }}
                      loading="lazy"
                    />
                  </div>
                </div>
              ) : null;
            })()}
          </>
        )}

        {/* CTA — strip #story-{hash} fragments so the report page doesn't
             redirect right back to this canonical story page. */}
        {story.detail_url && !isSelfReferentialUrl(story.detail_url, slug, hash) && (() => {
          const ctaUrl = story.detail_url!.replace(/#story-[A-Za-z0-9_-]+$/, "");
          return ctaUrl ? (
            <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid var(--border-subtle, #e5e7eb)" }}>
              <a
                href={ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                {story.cta_label ?? "View source data"}
              </a>
            </div>
          ) : null;
        })()}

        {/* Divider + Share */}
        <hr style={{ border: "none", borderTop: "1px solid var(--border-primary, #e5e7eb)", margin: "24px 0" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ShareButton
            title={headline.trim() || "Story"}
            url={`/c/${slug}/stories/${hash}`}
          />
        </div>

        {/* Related stories from the same city */}
        {relatedStories.length > 0 && (
          <>
            <hr style={{ border: "none", borderTop: "1px solid var(--border-primary, #e5e7eb)", margin: "24px 0" }} />
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}>
              More from {story.city_name || "this city"}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {relatedStories.filter(rs => rs.short_hash).map((rs) => (
                <Link
                  key={rs.id}
                  href={`/c/${slug}/stories/${rs.short_hash}`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: 12,
                    borderRadius: 10,
                    background: "var(--bg-secondary, #f5f5f5)",
                    textDecoration: "none",
                    color: "inherit",
                    transition: "background 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>
                    {rs.story_type === "off_the_charts" ? "\u{1F92F}" : rs.story_type === "alert" ? "\u{1F6A8}" : rs.story_type === "trend" ? "\u{1F4C8}" : rs.story_type === "milestone" ? "\u{1F3C6}" : "\u{1F4CB}"}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      lineHeight: 1.3,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}>
                      {improveGenericHeadline(rs.headline, { summary: rs.summary, description: rs.description, cityName: rs.city_name })}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary, #999)" }}>
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
        <CityHeroNewsletter cityName={cityDisplay} citySlug={slug} cityDisplay={cityDisplay} withContainer />
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
        .story-article-body h2 {
          font-size: 1.25rem;
          font-weight: 700;
          margin: 2rem 0 0.75rem;
        }
        .story-article-body p {
          margin-bottom: 1.25rem;
          color: var(--text-primary, #111);
        }
        .story-article-body a {
          color: var(--brand-primary, #ad35fa);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .story-article-body a:hover {
          opacity: 0.75;
        }
        .story-article-body figure {
          margin: 2rem 0;
          padding: 24px;
          background: var(--bg-subtle, #f9f9f9);
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
          border: 1px solid var(--border-subtle, #e5e7eb);
          background: var(--bg-subtle, #f9f9f9);
        }
        .story-article-body .visualization-embed iframe {
          display: block;
          border: none;
          width: 100%;
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
          border-top: 1px solid var(--border-subtle, #e5e7eb);
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
