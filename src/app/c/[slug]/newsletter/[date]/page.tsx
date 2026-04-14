import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import "../../../../landing.css";

import { getNewsletterEdition } from "@/lib/newsletter";
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import NavEmailSignup from "../../NavEmailSignup";
import CityHeroNewsletter from "../../CityHeroNewsletter";
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

  return (
    <SignupEmailProvider>
      <PublicNavBar>
        <NavEmailSignup citySlug={slug} cityName={edition.city_name ?? slug} />
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

        {/* Edition label */}
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
              background: "var(--accent-muted, rgba(173,53,250,0.1))",
              color: "var(--brand-primary, #ad35fa)",
            }}
          >
            Newsletter{districtLabel}
          </span>
        </div>

        {/* Summary headline */}
        <h1
          style={{
            fontSize: "clamp(1.6rem, 4vw, 2.2rem)",
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: 16,
          }}
        >
          {edition.summary_headline || edition.subject || extractFirstH2(edition.body_html)}
        </h1>

        {/* Meta */}
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 32,
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          {editionDateStr && <span>{editionDateStr}</span>}
          <span>
            {cityDisplay}
            {edition.district > 0 ? ` · District ${edition.district}` : ""}
          </span>
        </div>

        {/* Edition body */}
        <div
          className="newsletter-edition-body"
          style={{ lineHeight: 1.75, fontSize: "1rem" }}
          dangerouslySetInnerHTML={{ __html: edition.body_html }}
        />

        {/* Newsletter signup CTA — only shown to logged-out users */}
        <CityHeroNewsletter
          cityName={cityDisplay}
          citySlug={slug}
          withContainer
          containerHeading="Get this in your inbox every week"
          containerSubtitle={`Sign up to receive ${cityDisplay}\u2019s weekly briefing${districtLabel ? ` for District ${edition.district}` : ""}.`}
        />

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
        }
        @media (max-width: 640px) {
          .newsletter-article-container {
            padding: 80px 16px 48px;
          }
        }
        .newsletter-edition-body h1 {
          font-size: 1.35rem;
          font-weight: 700;
          margin: 0 0 1rem;
          color: var(--text-primary, #111827);
        }
        .newsletter-edition-body h2 {
          font-weight: 700;
          margin: 0 0 0.5rem;
          color: var(--text-primary, #111827);
        }
        .newsletter-edition-body p {
          margin-bottom: 1rem;
          color: var(--text-primary, #111);
        }
        .newsletter-edition-body strong {
          color: var(--text-primary, #111827);
        }
        .newsletter-edition-body a {
          color: var(--brand-primary, #ad35fa);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .newsletter-edition-body hr {
          border: none;
          border-top: 1px solid var(--border-subtle, #e5e7eb);
          margin: 24px 0;
        }
        .newsletter-edition-body div[style*="background:#f3f4f6"] {
          background: var(--bg-subtle, #f3f4f6) !important;
        }
      `}</style>
    </SignupEmailProvider>
  );
}
