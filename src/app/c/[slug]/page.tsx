import type { Metadata } from "next";
import Link from "next/link";

import "../../landing.css";

import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import FollowCityButton from "./FollowCityButton";
import NewsletterSignup from "@/components/NewsletterSignup";
import CitySignupButton from "./CitySignupButton";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const sp = (await searchParams) || {};
  const idParam = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  const id = idParam ? Number(idParam) : null;

  let name = slug;
  let state: string | null | undefined = null;
  let country: string | null | undefined = null;
  let datasetsCount: number | null = null;

  try {
    const cities = await listPublicCitiesForSitemap();
    const match =
      typeof id === "number" && Number.isFinite(id)
        ? cities.find((c) => c.id === id)
        : cities.find((c) => c.slug === slug);
    if (match) {
      name = match.name;
      state = match.state;
      country = match.country;
      datasetsCount = match.datasets_count;
    }
  } catch {
    // Keep a reasonable fallback; crawlers will retry.
  }

  const display =
    state && country && country !== "United States"
      ? `${name}, ${state}, ${country}`
      : state
        ? `${name}, ${state}`
        : country && country !== "United States"
          ? `${name}, ${country}`
          : name;
  const description =
    datasetsCount !== null
      ? `${display} on Transparent.city. Browse ${datasetsCount} public datasets and source-linked civic context.`
      : `${display} on Transparent.city. Browse public datasets and source-linked civic context.`;

  return {
    title: `${display} – Transparent.city`,
    description,
    alternates: {
      canonical:
        typeof id === "number" && Number.isFinite(id)
          ? `/c/${slug}?id=${id}`
          : `/c/${slug}`,
    },
  };
}

export default async function CityLandingPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = (await searchParams) || {};
  const idParam = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  const id = idParam ? Number(idParam) : null;

  let city:
    | (Awaited<ReturnType<typeof listPublicCitiesForSitemap>>[number] & {
        display: string;
      })
    | null = null;

  try {
    const cities = await listPublicCitiesForSitemap();
    const match =
      typeof id === "number" && Number.isFinite(id)
        ? cities.find((c) => c.id === id)
        : cities.find((c) => c.slug === slug);
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

  const cityDisplayName = city?.display ?? slug;
  const cityLeadSubject = `City lead — ${cityDisplayName}`;
  const cityLeadBody = `Hi Transparent.city team,

I’m interested in becoming a city lead for ${cityDisplayName}.

Name:
Role/affiliation:
City:
What I want to help with:

Thanks!`;
  const cityLeadMailtoHref = `mailto:hello@transparentcity.com?subject=${encodeURIComponent(
    cityLeadSubject
  )}&body=${encodeURIComponent(cityLeadBody)}`;

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
              <a
                href="https://www.transparentsf.com"
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

      <section className="hero" style={{ paddingTop: 56 }}>
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <span className="badge">City page</span>
              <h1 className="hero-title">
                {city ? `${city.emoji || "🏙️"} ${city.display}` : slug}
              </h1>
              <p className="hero-description">
                {city
                  ? `Browse ${city.datasets_count} public datasets and source-linked civic context.`
                  : "Browse public datasets and source-linked civic context."}
              </p>
              
              {/* Newsletter Signup - Above the fold */}
              <div className="hero-newsletter">
                <NewsletterSignup cityName={city?.display ?? slug} />
              </div>

              <div className="hero-cta" style={{ gap: 12, flexWrap: "wrap" }}>
                <FollowCityButton
                  className="btn btn-primary btn-large"
                  cityId={city?.id ?? null}
                  citySlug={slug}
                  cityDisplayName={city?.display ?? slug}
                />
                <Link className="btn btn-outline btn-large" href="/sitemap">
                  Browse all cities
                </Link>
              </div>

              {/* City Lead CTA - Above the fold */}
              <div className="hero-city-lead">
                <h2 className="city-lead-title">
                  Become a city lead for {cityDisplayName}
                </h2>
                <p className="city-lead-description">
                  Help us launch better dashboards, briefs, and accountability tools
                  for your city. City leads help validate sources, prioritize what
                  matters locally, and connect us to the public context behind the
                  numbers.
                </p>
                <div className="city-lead-buttons" style={{ gap: 12, flexWrap: "wrap" }}>
                  <a className="btn btn-primary btn-large" href={cityLeadMailtoHref}>
                    Become a city lead
                  </a>
                  <Link className="btn btn-outline btn-large" href="/pro">
                    City staff? Get Pro tools
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="hero-background">
          <div className="gradient-orb orb-1" />
          <div className="gradient-orb orb-2" />
          <div className="gradient-orb orb-3" />
        </div>
      </section>

      <section className="features">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">What’s here</span>
            <h2 className="section-title">Public data, made legible</h2>
            <p className="section-description">
              A public city index page: datasets and civic context in one place,
              with a clear path to follow this city and get updates.
            </p>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📚</div>
              <h3 className="feature-title">Datasets</h3>
              <p className="feature-description">
                Browse the datasets we’ve indexed for this city.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📈</div>
              <h3 className="feature-title">Metrics</h3>
              <p className="feature-description">
                Track time series and meaningful changes by topic.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🗺️</div>
              <h3 className="feature-title">Maps</h3>
              <p className="feature-description">
                See where things are happening, by district and neighborhood.
              </p>
            </div>
          </div>
        </div>
      </section>


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
                residents and leaders can share the same picture of what’s
                happening.
              </p>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">Resources</h4>
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

