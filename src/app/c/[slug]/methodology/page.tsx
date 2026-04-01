import type { Metadata } from "next";
import Link from "next/link";

import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import { getDataPortalForCity } from "@/lib/dataPortals";
import CitySignupButton from "../CitySignupButton";

import "../../../landing.css";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let cityName = slug;
  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => c.slug === slug);
    if (match) {
      cityName =
        match.state && match.country && match.country !== "United States"
          ? `${match.name}, ${match.state}, ${match.country}`
          : match.state
            ? `${match.name}, ${match.state}`
            : match.country && match.country !== "United States"
              ? `${match.name}, ${match.country}`
              : match.name;
    }
  } catch {
    // fallback to slug
  }
  return {
    title: `Methodology | ${cityName}`,
    description: `How Transparent.city uses ${cityName}'s public data: sources, independence, and our mission to center local discussion on shared facts.`,
  };
}

export default async function MethodologyPage({ params }: PageProps) {
  const { slug } = await params;

  let city:
    | (Awaited<ReturnType<typeof listPublicCitiesForSitemap>>[number] & {
        display: string;
      })
    | null = null;

  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => c.slug === slug);
    if (match) {
      const display =
        match.state && match.country && match.country !== "United States"
          ? `${match.name}, ${match.state}, ${match.country}`
          : match.state
            ? `${match.name}, ${match.state}`
            : match.country && match.country !== "United States"
              ? `${match.name}, ${match.country}`
              : match.name;
      city = { ...match, display };
    }
  } catch {
    // noop
  }

  const cityDisplay = city?.display ?? slug.replace(/-/g, " ");
  const cityName = city?.name ?? slug.replace(/-/g, " ");
  const dataPortal = getDataPortalForCity(slug, city?.name);

  return (
    <>
      <nav className="navbar">
        <div className="container">
          <div className="nav-content">
            <Link href="/" className="logo" style={{ textDecoration: "none" }}>
              <span className="logo-text">
                <span className="logo-transparent">transparent</span>
                <span className="logo-city">.city</span>
              </span>
            </Link>
            <div className="nav-links">
              <Link href={`/c/${slug}`} className="nav-link">
                ← {cityDisplay}
              </Link>
              <a
                href="https://www.transparent.city"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link"
              >
                Newsletter
              </a>
              <Link href="/sitemap" className="nav-link">
                Site map
              </Link>
              <Link href="/" className="nav-link">
                Home
              </Link>
              <CitySignupButton />
            </div>
          </div>
        </div>
      </nav>

      <main className="methodology-main">
        <div className="container">
          <header className="methodology-header">
            <span className="badge">Methodology</span>
            <h1 className="hero-title">How we use {cityName}&apos;s data</h1>
            <p className="hero-description">
              Data sources, independence, and our commitment to making public
              information genuinely useful.
            </p>
          </header>

          <section className="methodology-section">
            <h2>Our mission</h2>
            <p>
              Transparent.city makes each city&apos;s civic landscape legible,
              understandable, and actionable. We turn official public records
              into clear, source-linked insights so residents, advocates, and
              local leaders can share the same picture of what&apos;s changing
              and focus on fixing what isn&apos;t. Our mission is to shift local
              discourse from anecdote to evidence so communities can make
              smarter, more accountable decisions.
            </p>
          </section>

          <section className="methodology-section">
            <h2>Independent and objective</h2>
            <p>
              We are independent of any government. We are not affiliated with
              the City or County of {cityDisplay}, or with any other city we
              cover. We do not take government funding to build or run this
              platform. Our goal is objectivity: we present the numbers as they
              come from official sources, with documented methods and direct
              links so you can verify everything yourself. We do not lobby,
              endorse candidates, or advocate for specific policies. We advocate
              for transparency and for conversations grounded in shared facts.
            </p>
          </section>

          <section className="methodology-section">
            <h2>Data sources</h2>
            <p>
              All of our data comes from official public sources, primarily each
              city&apos;s own open data portal and published government records.
              For {cityDisplay}, we work with hundreds of public datasets
              spanning dozens of categories. Every metric on Transparent.city
              links back to the original dataset so you can see exactly where the
              numbers come from and verify them yourself.
            </p>
            {dataPortal ? (
              <p>
                <strong>Open data portal for {cityDisplay}:</strong>{" "}
                <a
                  href={dataPortal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="methodology-link"
                >
                  {dataPortal.name} →
                </a>
              </p>
            ) : (
              <p>
                <strong>Open data portal:</strong> Each metric page includes a
                link to the specific dataset it uses. You can also search your
                city&apos;s official open data site for the source datasets we
                reference.
              </p>
            )}
          </section>

          <section className="methodology-section">
            <h2>How we work with the data</h2>
            <p>
              Municipal data is complex. Datasets are published on different
              schedules, structured differently across departments, and riddled
              with gaps, inconsistencies, and format changes. Making this data
              genuinely useful requires far more than downloading a spreadsheet.
            </p>
            <p>
              We normalize raw public records across temporal, geographic, and
              categorical dimensions. That means aligning data that arrives
              daily with data that arrives quarterly, matching records to the
              right neighborhoods and districts, and tracking completeness so
              you know whether a number reflects a real trend or a reporting
              lag. We build time series at multiple levels of granularity,
              from individual neighborhoods to citywide, so patterns are visible
              at every scale.
            </p>
            <p>
              Data quality assurance is not a one-time step. We continuously
              monitor freshness, detect gaps in reporting, and track whether
              each dataset&apos;s update patterns are holding steady. We do not
              alter the underlying counts. We structure and contextualize them so
              trends and comparisons are easy to see. Our definitions and logic
              are documented on each metric&apos;s detail page.
            </p>
          </section>

          <section className="methodology-section">
            <h2>Why this matters</h2>
            <p>
              Most city data is technically public but practically inaccessible.
              The gap between a raw government dataset and a usable insight is
              enormous. It requires domain knowledge, sustained engineering, and
              a commitment to rigor that goes well beyond what any single
              resident, journalist, or council member can maintain on their own.
            </p>
            <p>
              We believe civic data infrastructure should meet the same
              standards as the best data practices in any field: reproducible
              methods, transparent sourcing, continuous quality monitoring, and
              documentation at every step. That is what we build, and it is why
              the picture you see on Transparent.city is one you can trust.
            </p>
          </section>

          <section className="methodology-section methodology-cta">
            <Link href={`/c/${slug}`} className="btn btn-primary">
              Back to {cityDisplay}
            </Link>
          </section>
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-column">
              <div className="logo">
                <span className="logo-text">
                  <span className="logo-transparent">transparent</span>
                  <span className="logo-city">.city</span>
                </span>
              </div>
              <p className="footer-description">
                Maps, metrics, and research built from public city data—so
                residents and elected officials can share the same picture of
                what’s happening.
              </p>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">Resources</h4>
              <Link href={`/c/${slug}/methodology`} className="footer-link">
                Methodology
              </Link>
              <Link href="/sitemap" className="footer-link">
                Site Map
              </Link>
            </div>
          </div>
          <div className="footer-bottom">
            <p>
              &copy; 2026 Transparent.city.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
