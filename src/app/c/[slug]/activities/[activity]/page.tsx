import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import "../../../../landing.css";

import ActivityPage from "@/components/activities/ActivityPage";
import AreaPicker from "@/components/activities/AreaPicker";
import PublicFooter from "@/components/PublicFooter";
import PublicNavBar from "@/components/PublicNavBar";
import {
  ACTIVITIES_LABEL,
  ActivityFetchError,
  activitiesEnabled,
  getPublicActivity,
  normalizeArea,
  type ActivityPayload,
} from "@/lib/activities";
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";

type PageProps = {
  params: Promise<{ slug: string; activity: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function cityName(slug: string): Promise<string | null> {
  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => (c.slug || slugify(c.name)) === slug);
    return match?.name ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug, activity } = await params;
  const area = normalizeArea((await searchParams).area);
  return {
    title: `What you can do: ${activity} | ${slug}`,
    alternates: { canonical: `/c/${slug}/activities/${activity}${area ? `?area=${area}` : ""}` },
    // Dark launch: keep out of search until Activities is public.
    robots: { index: false, follow: false },
  };
}

export default async function CityActivityPage({ params, searchParams }: PageProps) {
  if (!activitiesEnabled()) notFound();
  const { slug, activity } = await params;
  const area = normalizeArea((await searchParams).area);

  const name = await cityName(slug);
  if (!name) notFound();

  let payload: ActivityPayload | null = null;
  let unavailable = false;
  try {
    payload = await getPublicActivity(slug, activity, area);
  } catch (e) {
    if (e instanceof ActivityFetchError && (e.status === 404 || e.status === 403)) notFound();
    unavailable = true;
  }

  const basePath = `/c/${slug}/activities/${activity}`;
  const areaLabel = payload
    ? payload.area.district_label
      ? `${payload.area.label}, ${payload.area.district_label}`
      : payload.area.label
    : name;

  return (
    <>
      <PublicNavBar>{null}</PublicNavBar>
      <section className="hero" style={{ paddingTop: 96 }}>
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <span className="badge">{ACTIVITIES_LABEL}</span>
              <h1 className="hero-title">{payload?.title ?? "What you can do"}</h1>
              <p className="hero-description">{areaLabel}</p>
              {payload && (
                <AreaPicker
                  basePath={basePath}
                  current={payload.area.slug}
                  cityName={name}
                  neighborhoods={payload.areas.neighborhoods}
                  districts={payload.areas.districts}
                />
              )}
              <div className="hero-category-links">
                <Link href={`/c/${slug}`} className="hero-category-link">
                  Dashboard
                </Link>
                <Link href={`/c/${slug}/activities`} className="hero-category-link">
                  {ACTIVITIES_LABEL}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {payload ? (
        <ActivityPage payload={payload} />
      ) : (
        unavailable && (
          <div className="container" style={{ padding: "32px 16px" }}>
            <p>
              We could not read {name}&rsquo;s open data portal just now, so this page has no numbers.
              Try again later.
            </p>
          </div>
        )
      )}

      <PublicFooter citySlug={slug} feedbackPageUrl={basePath} feedbackPageType="category" />
    </>
  );
}
