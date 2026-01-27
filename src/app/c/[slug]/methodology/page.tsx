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
            <h1 className="hero-title">How we use {cityDisplay}’s data</h1>
            <p className="hero-description">
              Data sources, independence, and our mission to center the local
              discussion on shared facts.
            </p>
          </header>

          <section className="methodology-section">
            <h2>Our mission</h2>
            <p>
              Transparent.city uses AI and public data to make each city’s civic
              landscape legible, understandable, and actionable. We turn official
              records into clear, source-linked insights so residents, advocates,
              and local leaders can share the same picture of what’s changing—and
              focus on fixing what isn’t. Our mission is to shift local discourse
              from anecdote to evidence so communities can make smarter, more
              accountable decisions.
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
              links so you can verify everything yourself. We do not lobby, endorse
              candidates, or advocate for specific policies—we advocate for
              transparency and for conversations grounded in shared facts.
            </p>
          </section>

          <section className="methodology-section">
            <h2>Data sources</h2>
            <p>
              All of our data comes from each city’s own official open data
              portal. For {cityDisplay}, we pull from public datasets published
              by the city—crime, 311, permits, budgets, and more—and normalize
              them into consistent metrics, time series, and maps. Every metric
              on Transparent.city links back to the original dataset so you can
              see exactly where the numbers come from.
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
                city’s official open data site for the source datasets we
                reference.
              </p>
            )}
          </section>

          <section className="methodology-section">
            <h2>What we do with the data</h2>
            <p>
              We ingest, clean, and aggregate public records into metrics (e.g.,
              counts by month or year, by district or citywide). We run automated
              checks for notable changes and anomalies. We do not alter the underlying
              counts; we structure and visualize them so trends and comparisons
              are easy to see. Our definitions and logic are documented on each
              metric’s detail page.
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
              &copy; 2025 Transparent.city. The difference between knowing and
              guessing is agency.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
