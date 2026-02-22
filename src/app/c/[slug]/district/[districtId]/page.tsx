import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import "../../../../landing.css";

import {
  listPublicCitiesForSitemap,
  getPublicCityDetail,
  getPublicMetricComparisonsBatch,
  getPublicMetricDistrictComparisons,
} from "@/lib/publicApiClient";
import CitySignupButton from "../../CitySignupButton";
import NewsletterSignup from "@/components/NewsletterSignup";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ slug: string; districtId: string }>;
};

function formatValue(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "k";
  return String(Math.round(v * 100) / 100);
}

function pctChange(current: number | null, prior: number | null): string | null {
  if (current == null || prior == null || prior === 0) return null;
  const pct = ((current - prior) / prior) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${Math.round(pct)}%`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, districtId } = await params;
  const d = parseInt(districtId, 10);
  if (!Number.isFinite(d) || d < 1) {
    return { title: "District not found – Transparent.city" };
  }
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
            : match.name;
    }
  } catch {
    // use slug
  }
  return {
    title: `District ${d} – ${cityName}`,
    description: `District ${d} dashboard and newsletter for ${cityName}. Metrics, charts, and monthly updates.`,
  };
}

export default async function DistrictPage({ params }: PageProps) {
  const { slug, districtId } = await params;
  const d = parseInt(districtId, 10);
  if (!Number.isFinite(d) || d < 1) notFound();

  let city: (Awaited<ReturnType<typeof listPublicCitiesForSitemap>>[number] & { display: string }) | null = null;
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

  if (!city?.id) notFound();

  let cityDetail: Awaited<ReturnType<typeof getPublicCityDetail>> | null = null;
  const comparisonsMap: Record<
    number,
    Awaited<ReturnType<typeof getPublicMetricComparisonsBatch>>[number]
  > = {};
  let districtValid = false;

  try {
    cityDetail = await getPublicCityDetail(city.id);
    const metrics = cityDetail?.metrics ?? [];
    if (metrics.length > 0) {
      const dc = await getPublicMetricDistrictComparisons(metrics[0].id, "ytd").catch(() => null);
      if (dc?.districts) {
        districtValid = dc.districts.some((x) => x.district === d);
      }
      const toFetch = metrics.slice(0, 8);
      const batch = await getPublicMetricComparisonsBatch({
        metric_ids: toFetch.map((m) => m.id),
        district: d,
        comparison_types: ["ytd"],
      }).catch(() => ({}));
      Object.assign(comparisonsMap, batch);
    }
  } catch {
    // leave districtValid false, comparisonsMap empty
  }

  if (!districtValid && (cityDetail?.metrics?.length ?? 0) > 0) notFound();

  const cityDisplayName = city.display;
  const base = `/c/${slug}`;
  const metrics = cityDetail?.metrics ?? [];

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
              <Link href={`${base}/methodology`} className="nav-link">
                Methodology
              </Link>
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

      <section className="features" style={{ paddingTop: 100, paddingBottom: 48 }}>
        <div className="container">
          <div className="section-header">
            <span className="section-badge">District {d}</span>
            <h1 className="section-title">District {d} – {cityDisplayName}</h1>
            <p className="section-description">
              Dashboard and newsletter for District {d}. Sign up below for
              monthly updates; tap any metric for detail and charts.
            </p>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link href={base} className="btn btn-outline">
                ← Back to citywide
              </Link>
            </div>
          </div>

          {/* District newsletter signup */}
          <div style={{ marginBottom: 32, maxWidth: 480 }}>
            <NewsletterSignup
              cityName={`${cityDisplayName} – District ${d}`}
              citySlug={slug}
              district={d}
            />
          </div>

          {/* District metric cards */}
          <div className="section-header" style={{ marginTop: 24 }}>
            <span className="section-badge">Metrics</span>
            <h2 className="section-title">District {d} metrics</h2>
          </div>
          <div
            className="features-grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
          >
            {metrics.slice(0, 8).map((m) => {
              const comp = comparisonsMap[m.id];
              const ytd = comp?.comparisons?.ytd;
              const val = ytd?.current_period_value;
              const prior = ytd?.comparison_period_value;
              const change = pctChange(val ?? null, prior ?? null);
              return (
                <Link
                  key={m.id}
                  href={`${base}/metrics/${m.metric_key}?district=${d}`}
                  className="feature-card"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="feature-icon">📈</div>
                  <h3 className="feature-title">{m.metric_name}</h3>
                  <p className="feature-description">
                    {formatValue(val ?? null)}
                    {change != null && (
                      <span style={{ marginLeft: 6, fontSize: "0.9em", opacity: 0.9 }}>
                        {change}
                      </span>
                    )}
                  </p>
                </Link>
              );
            })}
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
                residents and elected officials can share the same picture of
                what’s happening.
              </p>
            </div>
            <div className="footer-column">
              <h4 className="footer-title">Resources</h4>
              <Link href={`${base}/methodology`} className="footer-link">
                Methodology
              </Link>
              <Link href={base} className="footer-link">
                {cityDisplayName} (citywide)
              </Link>
              <Link href="/sitemap" className="footer-link">
                Site Map
              </Link>
            </div>
          </div>
          <div className="footer-bottom">
            <p>
              &copy; 2026 Transparent.city. The difference between knowing and
              guessing is agency.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
