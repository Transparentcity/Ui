import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNewsletterEdition } from "@/lib/newsletter";

// Always render fresh so new editions are immediately embeddable.
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string; date: string }>;
};

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Prettify a city slug into a display name when the API omits city_name. */
function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Rough word count from HTML for the "N-min read" estimate. */
function estimateReadMinutes(html: string): number {
  const words = html
    .replace(/<[^>]+>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export default async function NewsletterEmbedPage({ params }: PageProps) {
  const { slug, date: hash } = await params;

  let edition: Awaited<ReturnType<typeof getNewsletterEdition>> | null = null;
  try {
    edition = await getNewsletterEdition(slug, hash);
  } catch {
    notFound();
  }

  if (!edition) notFound();

  const editionDateStr = edition.edition_date
    ? new Date(edition.edition_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  const cityDisplay = edition.city_name ?? prettifySlug(slug);
  const scopeLabel = edition.district > 0 ? `District ${edition.district}` : "Citywide";
  const readMinutes = estimateReadMinutes(edition.body_html);
  const metaParts = [editionDateStr, cityDisplay, scopeLabel, `${readMinutes}-min read`].filter(
    Boolean
  );

  const cityDashboardHref = `/c/${slug}`;
  const districtDashboardHref =
    edition.district > 0 ? `/c/${slug}/district/${edition.district}` : null;

  return (
    <>
      <article className="embed-article">
        {/* Masthead: mirrors the place-level email header — brand lockup,
            product title, issue meta, and dashboard shortcuts. */}
        <header className="embed-masthead">
          <a className="embed-brand" href={cityDashboardHref}>
            <span className="embed-brand-name">transparent</span>
            <span className="embed-brand-tld">.city</span>
          </a>
          <h1 className="embed-title">The Spotlight</h1>
          {metaParts.length > 0 && (
            <p className="embed-meta">{metaParts.join(" · ")}</p>
          )}

          <div className="embed-dashcards">
            {districtDashboardHref && (
              <a className="embed-dashcard" href={districtDashboardHref}>
                <span className="embed-dashcard-label">Your district</span>
                <span className="embed-dashcard-name">District {edition.district}</span>
                <span className="embed-dashcard-link">
                  District {edition.district} dashboard&nbsp;&rarr;
                </span>
              </a>
            )}
            <a className="embed-dashcard" href={cityDashboardHref}>
              <span className="embed-dashcard-label">Your city</span>
              <span className="embed-dashcard-name">{cityDisplay}</span>
              <span className="embed-dashcard-link">
                {cityDisplay} dashboard&nbsp;&rarr;
              </span>
            </a>
          </div>
        </header>

        {/* Purple accent rule separating the masthead from the body */}
        <div className="embed-rule" aria-hidden="true" />

        {/* Edition body (still leads with the headline + intro, so no need to
            render intro_html separately — that caused the duplicate title). */}
        <div
          className="embed-body"
          dangerouslySetInnerHTML={{ __html: edition.body_html }}
        />
      </article>

      <style>{`
        /* ── Reset & base ───────────────────────────────── */
        *, *::before, *::after { box-sizing: border-box; }

        :root {
          --c-bg:       #ffffff;
          --c-bg2:      #f8f9fa;
          --c-text:     #111827;
          --c-text2:    #374151;
          --c-muted:    #6b7280;
          --c-border:   #e5e7eb;
          --c-brand:    #ad35fa;
        }

        @media (prefers-color-scheme: dark) {
          :root {
            --c-bg:     #0f172a;
            --c-bg2:    #1e293b;
            --c-text:   #f1f5f9;
            --c-text2:  #cbd5e1;
            --c-muted:  #94a3b8;
            --c-border: #334155;
            --c-brand:  #ad35fa;
          }
        }

        /* Lock the iframe viewport and scroll inside the article wrapper.
           App globals set html/body { height: 100% }, which prevents the
           document from gaining scroll range; overflow on .embed-article
           gives the hero overlay wheel/touch forwarding a target. */
        html, body {
          margin: 0;
          height: 100% !important;
          overflow: hidden;
          background: var(--c-bg);
          color: var(--c-text);
          font-family: "IBM Plex Sans", Inter, -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 15px;
          line-height: 1.75;
          -webkit-font-smoothing: antialiased;
        }

        /* ── Article wrapper ────────────────────────────── */
        .embed-article {
          box-sizing: border-box;
          height: 100%;
          overflow-x: hidden;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 20px 24px 48px;
          max-width: 720px;
          margin: 0 auto;
        }

        /* ── Masthead (mirrors place-level email header) ── */
        .embed-masthead {
          margin-bottom: 20px;
        }

        .embed-brand {
          display: inline-block;
          text-decoration: none;
          font-size: 11px;
          line-height: 14px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }
        .embed-brand-name { color: var(--c-text); }
        .embed-brand-tld { color: var(--c-brand); }

        .embed-title {
          margin: 6px 0 0;
          font-size: 1.5rem;
          line-height: 1.15;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--c-text);
        }

        .embed-meta {
          margin: 8px 0 0;
          font-size: 12.5px;
          line-height: 1.5;
          color: var(--c-muted);
        }

        /* Dashboard shortcut cards — the citywide analog of the place-level
           "officials" cards, linking to the city / district dashboards. */
        .embed-dashcards {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 16px;
        }
        .embed-dashcard {
          flex: 1 1 200px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 12px 14px;
          border-radius: 10px;
          text-decoration: none;
          background: rgba(173, 53, 250, 0.07);
          border: 1px solid rgba(173, 53, 250, 0.2);
        }
        .embed-dashcard-label {
          font-size: 10px;
          line-height: 14px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--c-brand);
        }
        .embed-dashcard-name {
          font-size: 14px;
          line-height: 20px;
          font-weight: 700;
          color: var(--c-text);
        }
        .embed-dashcard-link {
          font-size: 10px;
          line-height: 14px;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: var(--c-brand);
        }

        /* Purple accent rule */
        .embed-rule {
          border-top: 2px solid var(--c-brand);
          margin: 0 0 24px;
        }

        /* ── Body typography ────────────────────────────── */
        .embed-body { color: var(--c-text2); }

        .embed-body h1 {
          font-size: 1.25rem;
          font-weight: 700;
          margin: 0 0 1rem;
          color: var(--c-text);
        }
        .embed-body h2 {
          font-size: 1.05rem;
          font-weight: 700;
          margin: 1.5rem 0 0.5rem;
          color: var(--c-text);
        }
        .embed-body h3 {
          font-size: 0.95rem;
          font-weight: 600;
          margin: 1.25rem 0 0.25rem;
          color: var(--c-text);
        }
        .embed-body p { margin-bottom: 1rem; }
        .embed-body strong { color: var(--c-text); }
        .embed-body a {
          color: var(--c-brand);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .embed-body hr {
          border: none;
          border-top: 1px solid var(--c-border);
          margin: 24px 0;
        }
        .embed-body ul,
        .embed-body ol { padding-left: 1.5rem; margin-bottom: 1rem; }
        .embed-body li { margin-bottom: 0.25rem; }
        .embed-body blockquote {
          border-left: 3px solid var(--c-brand);
          margin: 1rem 0;
          padding: 4px 16px;
          color: var(--c-muted);
        }

        /* Override inline-styled blocks from generated HTML */
        .embed-body [style*="background:#f3f4f6"],
        .embed-body [style*="background: #f3f4f6"] {
          background: var(--c-bg2) !important;
          color: var(--c-text) !important;
        }
        .embed-body [style*="background:#ffffff"],
        .embed-body [style*="background: #ffffff"],
        .embed-body [style*="background: white"] {
          background: var(--c-bg) !important;
        }
        .embed-body [style*="color:#111827"],
        .embed-body [style*="color: #111827"],
        .embed-body [style*="color:#374151"],
        .embed-body [style*="color: #374151"] {
          color: var(--c-text) !important;
        }
        .embed-body [style*="color:#6b7280"],
        .embed-body [style*="color: #6b7280"] {
          color: var(--c-muted) !important;
        }
        .embed-body [style*="border-color:#e5e7eb"],
        .embed-body [style*="border: 1px solid #e5e7eb"] {
          border-color: var(--c-border) !important;
        }
      `}</style>
    </>
  );
}
