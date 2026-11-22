import type { ReactNode } from "react";
import Link from "next/link";

import { isLegalMandateCategory } from "@/lib/mandates";
import { resolveDisplayCategory } from "@/lib/metricOrderingDisplay";
import {
  getPublicCityDetail,
  getPublicCityMetricOrdering,
  listPublicCitiesForSitemap,
  type PublicCitySitemapItem,
  type PublicMetricOrderingResponse,
} from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";

import CitySignupCTA from "./CitySignupCTA";
import DistrictFollowClaimBlock from "./district/DistrictFollowClaimBlock";

export type SubpageCity = PublicCitySitemapItem & { display: string };

export function cityDisplay(city: PublicCitySitemapItem): string {
  return city.state && city.country && city.country !== "United States"
    ? `${city.name}, ${city.state}, ${city.country}`
    : city.state
      ? `${city.name}, ${city.state}`
      : city.country && city.country !== "United States"
        ? `${city.name}, ${city.country}`
        : city.name;
}

/** The city for a /c/[slug] route, or null. */
export async function findSubpageCity(slug: string): Promise<SubpageCity | null> {
  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => (c.slug || slugify(c.name)) === slug);
    return match ? { ...match, display: cityDisplay(match) } : null;
  } catch {
    return null;
  }
}

/**
 * Hero for a city sub-page that sits beside the category pages (legal
 * standards, activities): badge, title, mayor and follow row, signup, then
 * the category chips with this page's chip marked current. Each fetch
 * swallows its own failure; the page still renders without the chips.
 */
export default async function CitySubpageHero({
  city,
  slug,
  badge,
  title,
  description,
  current,
  children,
}: {
  city: SubpageCity;
  slug: string;
  badge: string;
  title: ReactNode;
  description: ReactNode;
  /** This page's chip, shown last and marked current. */
  current: { href: string; label: string };
  /** Shown under the description (e.g. an area picker). */
  children?: ReactNode;
}) {
  const [cityDetail, cityOrdering] = await Promise.all([
    getPublicCityDetail(city.id).catch(() => null),
    getPublicCityMetricOrdering(city.id).catch((): PublicMetricOrderingResponse | null => null),
  ]);
  const orderingByMetricId = new Map(
    (cityOrdering?.orderings ?? [])
      .filter((o) => o.metric_id != null)
      .map((o) => [o.metric_id!, o] as const)
  );
  const categories = Array.from(
    new Set(
      (cityDetail?.metrics ?? [])
        .filter((m) => !isLegalMandateCategory(m.category))
        .map((m) => resolveDisplayCategory(orderingByMetricId.get(m.id)?.category_name, m.category))
    )
  ).sort((a, b) => a.localeCompare(b));

  return (
    <section className="hero" style={{ paddingTop: 96 }}>
      <div className="container">
        <div className="hero-content">
          <div className="hero-text">
            <span className="badge">{badge}</span>
            <h1 className="hero-title">{title}</h1>
            <p className="hero-description">{description}</p>
            {children}

            {(cityDetail?.mayor || cityDetail?.mayor_subscriber_count != null) && (
              <div className="hero-mayor-subscribers hero-official-row">
                <span className="hero-mayor-name">Mayor {cityDetail?.mayor?.name ?? "Citywide"}</span>
                <DistrictFollowClaimBlock cityId={city.id} district={0} slug={slug} cityDisplayName={city.name} />
              </div>
            )}

            <div className="hero-newsletter">
              <CitySignupCTA citySlug={slug} cityName={city.display} label={`Sign up for ${city.display} updates`} />
            </div>

            <div className="hero-category-links">
              <Link href={`/c/${slug}`} className="hero-category-link">
                Dashboard
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat}
                  href={`/c/${slug}/category/${encodeURIComponent(cat)}`}
                  className="hero-category-link"
                >
                  {cat}
                </Link>
              ))}
              <Link href={current.href} className="hero-category-link hero-category-link-active" aria-current="page">
                {current.label}
              </Link>
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
  );
}
