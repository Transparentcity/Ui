import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import "../../../../landing.css";
import "@/app/newsletter-inline-theme.css";

import { getNewsletterEdition } from "@/lib/newsletter";
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import CitySignupButton from "../../CitySignupButton";
import CitySignupCTA from "../../CitySignupCTA";
import { SignupEmailProvider } from "../../SignupEmailContext";
import Breadcrumb from "@/components/Breadcrumb";

// Render on each request so newly generated editions are immediately viewable.
// The underlying fetch uses `revalidate: 3600` so responses are still cached.
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string; date: string }>;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/** Extract a fallback headline from the first <h2> in the body HTML. */
function extractFirstH2(html: string): string {
  const match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  return match ? stripHtml(match[1]) : "";
}

/** Rough word count from HTML for the "N-min read" estimate. */
function estimateReadMinutes(html: string): number {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, date: hash } = await params;
  try {
    const edition = await getNewsletterEdition(slug, hash);
    const cityName = edition.city_name ?? slug;
    const districtLabel = edition.district > 0 ? ` — District ${edition.district}` : "";
    const headline = edition.summary_headline || edition.subject || extractFirstH2(edition.body_html) || "Newsletter";
    const title = `${headline} — ${cityName}${districtLabel} Newsletter`;
    const introText = edition.intro_html ? stripHtml(edition.intro_html) : "";
    const description = introText.slice(0, 160);
    const canonicalSlug = edition.city_slug ?? slug;
    const canonical = `/c/${canonicalSlug}/newsletter/${edition.short_hash}`;
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title,
        description,
        url: canonical,
        type: "article",
      },
      twitter: {
        card: "summary",
        title,
        description,
      },
      other: {
        "article:section": cityName,
        "article:published_time": edition.edition_date,
      },
    };
  } catch {
    return { title: "Newsletter — Transparent.city" };
  }
}

export default async function NewsletterEditionPage({ params }: PageProps) {
  const { slug, date: hash } = await params;

  let edition: Awaited<ReturnType<typeof getNewsletterEdition>> | null = null;
  try {
    edition = await getNewsletterEdition(slug, hash);
  } catch {
    notFound();
  }

  if (!edition) notFound();

  // Resolve city display name from slug
  let cityDisplay = edition.city_name ?? slug;
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
    // fall back to edition.city_name or slug
  }

  const backHref = `/c/${slug}`;
  const districtHref =
    edition.district > 0 ? `/c/${slug}/district/${edition.district}` : null;

  const editionDateStr = edition.edition_date
    ? new Date(edition.edition_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  const districtLabel = edition.district > 0 ? ` — District ${edition.district}` : "";
  const scopeLabel = edition.district > 0 ? `District ${edition.district}` : "Citywide";
  const readMinutes = estimateReadMinutes(edition.body_html);
  const metaParts = [editionDateStr, cityDisplay, scopeLabel, `${readMinutes}-min read`].filter(
    Boolean
  );

  return (
    <SignupEmailProvider>
      <PublicNavBar>
        <CitySignupButton citySlug={slug} cityName={edition.city_name ?? slug} />
      </PublicNavBar>

      <article
        className="newsletter-article-container"
      >
        {/* Breadcrumb */}
        <Breadcrumb items={[
          { label: cityDisplay, href: backHref },
          ...(districtHref ? [{ label: `District ${edition.district}`, href: districtHref }] : []),
          { label: "Newsletter" },
        ]} />

        {/* Masthead: mirrors the place-level email header — brand lockup,
            product title, issue meta, and dashboard shortcuts. Replaces the
            old label + headline + intro stack, which duplicated the lead
            story's own headline and lede already present in the body. */}
        <header className="newsletter-masthead">
          <Link href={backHref} className="newsletter-brand">
            <span className="newsletter-brand-name">transparent</span>
            <span className="newsletter-brand-tld">.city</span>
          </Link>
          <h1 className="newsletter-title">The Spotlight</h1>
          {metaParts.length > 0 && (
            <p className="newsletter-meta">{metaParts.join(" · ")}</p>
          )}

          <div className="newsletter-dashcards">
            {districtHref && (
              <Link href={districtHref} className="newsletter-dashcard">
                <span className="newsletter-dashcard-label">Your district</span>
                <span className="newsletter-dashcard-name">District {edition.district}</span>
                <span className="newsletter-dashcard-link">
                  District {edition.district} dashboard&nbsp;&rarr;
                </span>
              </Link>
            )}
            <Link href={backHref} className="newsletter-dashcard">
              <span className="newsletter-dashcard-label">Your city</span>
              <span className="newsletter-dashcard-name">{cityDisplay}</span>
              <span className="newsletter-dashcard-link">
                {cityDisplay} dashboard&nbsp;&rarr;
              </span>
            </Link>
          </div>
        </header>

        {/* Purple accent rule separating the masthead from the body */}
        <div className="newsletter-masthead-rule" aria-hidden="true" />

        {/* Edition body (still leads with the headline + lede, so no separate
            intro_html render — that was the duplicate). */}
        <div
          className="newsletter-edition-body newsletter-inline-theme"
          style={{ lineHeight: 1.75, fontSize: "1rem" }}
          dangerouslySetInnerHTML={{ __html: edition.body_html }}
        />

        {/* Newsletter signup CTA — only shown to logged-out users */}
        <div style={{
          margin: "32px 0",
          padding: "24px",
          borderRadius: 12,
          background: "var(--bg-secondary, #f5f5f5)",
        }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px", color: "var(--text-primary)" }}>
            Get this in your inbox every week
          </p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
            Sign up to receive {cityDisplay}&rsquo;s weekly briefing{districtLabel ? ` for District ${edition.district}` : ""}.
          </p>
          <CitySignupCTA citySlug={slug} cityName={cityDisplay} />
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border-primary, #e5e7eb)", margin: "32px 0" }} />

        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          <Link href={backHref} style={{ color: "var(--brand-primary, #ad35fa)", textDecoration: "none" }}>
            ← Back to {cityDisplay}
          </Link>
        </div>
      </article>

      <PublicFooter citySlug={slug} feedbackPageUrl={`/c/${slug}/newsletter/${hash}`} feedbackPageType="newsletter" />

      <style>{`
        .newsletter-article-container {
          max-width: 760px;
          margin: 0 auto;
          padding: 96px 24px 80px;
          font-family: "IBM Plex Sans", Inter, -apple-system, sans-serif;
        }
        @media (max-width: 640px) {
          .newsletter-article-container {
            padding: 80px 16px 48px;
          }
        }

        /* Masthead (mirrors place-level email header) */
        .newsletter-masthead { margin-bottom: 24px; }
        .newsletter-brand {
          display: inline-block;
          text-decoration: none;
          font-size: 11px;
          line-height: 14px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }
        .newsletter-brand-name { color: var(--text-primary); }
        .newsletter-brand-tld { color: var(--brand-primary, #ad35fa); }
        .newsletter-title {
          margin: 8px 0 0;
          font-size: clamp(1.6rem, 4vw, 2.2rem);
          line-height: 1.15;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text-primary);
        }
        .newsletter-meta {
          margin: 10px 0 0;
          font-size: 13px;
          line-height: 1.5;
          color: var(--text-secondary);
        }
        .newsletter-dashcards {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 20px;
        }
        .newsletter-dashcard {
          flex: 1 1 220px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 14px 16px;
          border-radius: 12px;
          text-decoration: none;
          background: var(--accent-muted, rgba(173, 53, 250, 0.07));
          border: 1px solid rgba(173, 53, 250, 0.2);
          transition: background 0.12s, border-color 0.12s;
        }
        .newsletter-dashcard:hover {
          background: rgba(173, 53, 250, 0.12);
          border-color: rgba(173, 53, 250, 0.35);
        }
        .newsletter-dashcard-label {
          font-size: 10px;
          line-height: 14px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--brand-primary, #ad35fa);
        }
        .newsletter-dashcard-name {
          font-size: 15px;
          line-height: 20px;
          font-weight: 700;
          color: var(--text-primary);
        }
        .newsletter-dashcard-link {
          font-size: 10px;
          line-height: 14px;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: var(--brand-primary, #ad35fa);
        }
        .newsletter-masthead-rule {
          border-top: 2px solid var(--brand-primary, #ad35fa);
          margin: 0 0 28px;
        }

        /* Body */
        .newsletter-edition-body h1 {
          font-size: 1.35rem;
          font-weight: 700;
          margin: 0 0 1rem;
          color: var(--text-primary);
        }
        .newsletter-edition-body h2 {
          font-weight: 700;
          margin: 1.5rem 0 0.5rem;
          color: var(--text-primary);
        }
        .newsletter-edition-body h3 {
          font-size: 0.95rem;
          font-weight: 600;
          margin: 1.25rem 0 0.25rem;
          color: var(--text-primary);
        }
        .newsletter-edition-body p {
          margin-bottom: 1rem;
          color: var(--text-secondary);
        }
        .newsletter-edition-body strong { color: var(--text-primary); }
        .newsletter-edition-body a {
          color: var(--brand-primary);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .newsletter-edition-body hr {
          border: none;
          border-top: 1px solid var(--border-primary);
          margin: 24px 0;
        }
        .newsletter-edition-body ul,
        .newsletter-edition-body ol { padding-left: 1.5rem; margin-bottom: 1rem; }
        .newsletter-edition-body li { margin-bottom: 0.25rem; color: var(--text-secondary); }
        .newsletter-edition-body blockquote {
          border-left: 3px solid var(--brand-primary);
          margin: 1rem 0;
          padding: 4px 16px;
          color: var(--text-muted);
        }
        /* Inline hex remaps live in newsletter-inline-theme.css */
      `}</style>
    </SignupEmailProvider>
  );
}
