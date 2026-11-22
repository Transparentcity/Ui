import type { ReactNode } from "react";
import Link from "next/link";

import { ACTIVITIES_LABEL } from "@/lib/activities";
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

import CitySignupCTA from "../CitySignupCTA";
import DistrictFollowClaimBlock from "../district/DistrictFollowClaimBlock";

export type ActivityCity = PublicCitySitemapItem & { display: string };

function cityDisplay(city: PublicCitySitemapItem): string {
  return city.state && city.country && city.country !== "United States"
    ? `${city.name}, ${city.state}, ${city.country}`
    : city.state
      ? `${city.name}, ${city.state}`
      : city.country && city.country !== "United States"
        ? `${city.name}, ${city.country}`
        : city.name;
}

/** The city for a /c/[slug] route, or null. Same lookup as the mandates page. */
export async function findActivityCity(slug: string): Promise<ActivityCity | null> {
  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => (c.slug || slugify(c.name)) === slug);
    return match ? { ...match, display: cityDisplay(match) } : null;
  } catch {
    return null;
  }
}

/**
 * The city sub-page hero used by the category and mandates pages: badge,
 * title, mayor and follow row, signup, then the category chips with
 * Activities marked current. Each fetch swallows its own failure.
 */
export default async function ActivityHero({
  city,
  slug,
  title,
  description,
  children,
}: {
  city: ActivityCity;
  slug: string;
  title: string;
  description: ReactNode;
  /** Shown under the description (the area picker). */
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
            <span className="badge">{ACTIVITIES_LABEL}</span>
            <h1 className="hero-title">
              {city.emoji || "🏙️"} {title}
            </h1>
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
              <Link
                href={`/c/${slug}/activities`}
                className="hero-category-link hero-category-link-active"
                aria-current="page"
              >
                {ACTIVITIES_LABEL}
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
