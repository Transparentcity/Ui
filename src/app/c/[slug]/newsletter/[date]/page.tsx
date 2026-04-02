import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import "../../../../landing.css";

import { getNewsletterEdition } from "@/lib/newsletter";
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import NavEmailSignup from "../../NavEmailSignup";
import CityHeroNewsletter from "../../CityHeroNewsletter";
import { SignupEmailProvider } from "../../SignupEmailContext";

// Archive pages: cache permanently once rendered; never auto-revalidate.
// If an edition is regenerated, redeploy or manually purge the route cache.
export const dynamic = "force-static";

type PageProps = {
  params: Promise<{ slug: string; date: string }>;
  searchParams: Promise<{ district?: string }>;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug, date } = await params;
  const { district: districtParam } = await searchParams;
  const district = districtParam ? parseInt(districtParam, 10) : undefined;
  try {
    const edition = await getNewsletterEdition(slug, date, district);
    const cityName = edition.city_name ?? slug;
    const districtLabel = edition.district > 0 ? ` — District ${edition.district}` : "";
    const title = `${edition.summary_headline} — ${cityName}${districtLabel} Newsletter`;
    const introText = edition.intro_html ? stripHtml(edition.intro_html) : "";
    const description = introText.slice(0, 160);
    const canonical = `/c/${slug}/newsletter/${date}${district ? `?district=${district}` : ""}`;
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
        "article:published_time": date,
      },
    };
  } catch {
    return { title: "Newsletter — Transparent.city" };
  }
}

export default async function NewsletterEditionPage({ params, searchParams }: PageProps) {
  const { slug, date } = await params;
  const { district: districtParam } = await searchParams;
  const district = districtParam ? parseInt(districtParam, 10) : undefined;

  let edition: Awaited<ReturnType<typeof getNewsletterEdition>> | null = null;
  try {
    edition = await getNewsletterEdition(slug, date, district);
  } catch {
    notFound();
  }

  if (!edition) notFound();

  // Resolve city display name from slug
  let cityDisplay = edition.city_name ?? slug;
  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => c.slug === slug);
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
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "96px 24px 80px",
        }}
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
                District {edition.district}
              </Link>
            </>
          )}
          {" / "}
          <span style={{ color: "var(--text-secondary)" }}>Newsletter</span>
        </nav>

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
          {edition.summary_headline || edition.subject}
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

        {/* Newsletter signup CTA */}
        <div style={{
          margin: "32px 0",
          padding: "24px",
          borderRadius: 12,
          background: "var(--bg-secondary, #f5f5f5)",
        }}>
          <p style={{
            fontSize: 15,
            fontWeight: 600,
            margin: "0 0 4px",
            color: "var(--text-primary)",
          }}>
            Get this in your inbox every week
          </p>
          <p style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            margin: "0 0 8px",
          }}>
            Sign up to receive {cityDisplay}&rsquo;s weekly briefing{districtLabel ? ` for District ${edition.district}` : ""}.
          </p>
          <CityHeroNewsletter cityName={cityDisplay} citySlug={slug} />
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--border-primary, #e5e7eb)", margin: "32px 0" }} />

        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          <Link href={backHref} style={{ color: "var(--brand-primary, #ad35fa)", textDecoration: "none" }}>
            ← Back to {cityDisplay}
          </Link>
        </div>
      </article>

      <PublicFooter citySlug={slug} feedbackPageUrl={`/c/${slug}/newsletter/${date}`} feedbackPageType="newsletter" />

      <style>{`
        .newsletter-edition-body h1,
        .newsletter-edition-body h2 {
          font-size: 1.1rem;
          font-weight: 700;
          margin: 1.5rem 0 0.5rem;
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
          margin: 20px 0;
        }
        .newsletter-edition-body div[style*="background:#f3f4f6"] {
          background: var(--bg-subtle, #f3f4f6) !important;
        }
      `}</style>
    </SignupEmailProvider>
  );
}
