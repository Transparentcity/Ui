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

  const districtLabel = edition.district > 0 ? ` · District ${edition.district}` : "";

  return (
    <>
      <article className="embed-article">
        {/* Slim edition header */}
        <div className="embed-header">
          <span className="embed-badge">Weekly{districtLabel}</span>
          {editionDateStr && <span className="embed-date">{editionDateStr}</span>}
        </div>

        {/* Intro section */}
        {edition.intro_html && (
          <div
            className="embed-intro"
            dangerouslySetInnerHTML={{ __html: edition.intro_html }}
          />
        )}

        {/* Edition body */}
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

        /* ── Header row ─────────────────────────────────── */
        .embed-header {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--c-border);
        }

        .embed-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: rgba(173, 53, 250, 0.12);
          color: var(--c-brand);
        }

        .embed-date {
          font-size: 12px;
          color: var(--c-muted);
        }

        /* ── Intro section ──────────────────────────────── */
        .embed-intro {
          font-size: 0.9375rem;
          line-height: 1.75;
          color: var(--c-text2);
          margin-bottom: 24px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--c-border);
        }
        .embed-intro p { margin: 0 0 0.75rem; }
        .embed-intro p:last-child { margin-bottom: 0; }
        .embed-intro a { color: var(--c-brand); }

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
