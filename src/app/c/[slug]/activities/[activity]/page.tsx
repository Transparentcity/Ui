import type { Metadata } from "next";
import { notFound } from "next/navigation";

import "../../../../landing.css";

import ActivityPage from "@/components/activities/ActivityPage";
import AreaPicker from "@/components/activities/AreaPicker";
import PublicFooter from "@/components/PublicFooter";
import PublicNavBar from "@/components/PublicNavBar";
import { activitiesEnabled, normalizeArea, type ActivityPayload } from "@/lib/activities";
import { getPublicCityActivity } from "@/lib/publicApiClient";

import CitySignupButton from "../../CitySignupButton";
import CityViewTracker from "../../CityViewTracker";
import { SignupEmailProvider } from "../../SignupEmailContext";
import ActivityHero, { findActivityCity } from "../ActivityHero";

type PageProps = {
  params: Promise<{ slug: string; activity: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug, activity } = await params;
  const area = normalizeArea((await searchParams).area);
  const city = await findActivityCity(slug);
  let title = "What you can do";
  try {
    title = (await getPublicCityActivity(slug, activity, area)).title;
  } catch {
    // Keep the fallback; the page itself decides between 404 and "no data".
  }
  return {
    title: `${title} | ${city?.display ?? slug}`,
    alternates: { canonical: `/c/${slug}/activities/${activity}${area ? `?area=${area}` : ""}` },
    // Dark launch: keep out of search until Activities is public.
    robots: { index: false, follow: false },
  };
}

export default async function CityActivityPage({ params, searchParams }: PageProps) {
  if (!activitiesEnabled()) notFound();
  const { slug, activity } = await params;
  const area = normalizeArea((await searchParams).area);

  const city = await findActivityCity(slug);
  if (!city) notFound();

  let payload: ActivityPayload | null = null;
  try {
    payload = await getPublicCityActivity(slug, activity, area);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404 || status === 403) notFound();
  }

  const basePath = `/c/${slug}/activities/${activity}`;
  const areaLabel = payload?.area.district_label
    ? `${payload.area.label}, ${payload.area.district_label}`
    : (payload?.area.label ?? city.name);

  return (
    <SignupEmailProvider>
      <CityViewTracker citySlug={slug} cityId={city.id} />
      <PublicNavBar>
        <CitySignupButton citySlug={slug} cityName={city.display} />
      </PublicNavBar>

      <ActivityHero
        city={city}
        slug={slug}
        title={payload?.title ?? "What you can do"}
        description={
          payload ? (
            <>
              {areaLabel}. Built from {city.name}&rsquo;s own 311 records.
            </>
          ) : (
            <>
              We could not read {city.name}&rsquo;s open data portal just now, so this page has no numbers.
              Try again later.
            </>
          )
        }
      >
        {payload && (
          <AreaPicker
            basePath={basePath}
            current={payload.area.slug}
            cityName={city.name}
            neighborhoods={payload.areas.neighborhoods}
            districts={payload.areas.districts}
          />
        )}
      </ActivityHero>

      {payload && <ActivityPage payload={payload} />}

      <PublicFooter citySlug={slug} feedbackPageUrl={basePath} feedbackPageType="category" />
    </SignupEmailProvider>
  );
}
