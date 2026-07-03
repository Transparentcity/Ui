import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import "../../landing.css";
import styles from "./get-landing.module.css";

import {
  listPublicCitiesForSitemap,
  getPublicCityDetail,
  getPublicMetricComparisonsBatch,
} from "@/lib/publicApiClient";
import {
  getFeaturedPendingNewsletter,
  listNewsletterEditionsForSitemap,
  pickLatestNewsletterEdition,
} from "@/lib/newsletter";
import { slugify } from "@/lib/utils";

import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import GetLandingClient from "./GetLandingClient";
import HeroNewsletterEmbed from "./components/HeroNewsletterEmbed";
import HeroEmailSignup from "./components/HeroEmailSignup";
import HeroSignupTrigger from "./components/HeroSignupTrigger";
import HowItWorks from "./components/HowItWorks";
import PersonalizationSection from "./components/PersonalizationSection";
import PricingSection from "./components/PricingSection";
import GetLandingMobileCTA from "./components/GetLandingMobileCTA";
import GetLandingNavSignup from "./components/GetLandingNavSignup";
import FeaturedStoriesAsync from "@/app/c/[slug]/FeaturedStoriesAsync";
import FeaturedStoriesSkeleton from "@/app/c/[slug]/FeaturedStoriesSkeleton";

export const revalidate = 3600;

/** Hardcoded marketing samples on /get/{slug} hero (pending newsletter id). */
const FEATURED_PENDING_BY_SLUG: Record<string, number> = {
  cincinnati: 266,
  chicago: 551,
};

function getCanonicalCitySlug(
  city: Awaited<ReturnType<typeof listPublicCitiesForSitemap>>[number]
): string {
  return city.slug || slugify(city.name);
}

export async function generateStaticParams() {
  try {
    const cities = await listPublicCitiesForSitemap();
    return cities
      .filter((c) => c.is_launched)
      .map((c) => ({ slug: getCanonicalCitySlug(c) }));
  } catch {
    return [];
  }
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let name = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  let state: string | null = null;

  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find((c) => getCanonicalCitySlug(c) === slug);
    if (match) {
      name = match.name;
      state = match.state ?? null;
    }
  } catch {
    /* keep fallback */
  }

  const display = state ? `${name}, ${state}` : name;
  const title = `Get the ${display} Weekly | Free for the first month | Transparent.city`;
  const description = `A plain-language weekly briefing built from ${display}'s official open data. New businesses, 311, crime and safety, housing, and more, with every number linked to its source. Free for the first month, then $5 a month.`;

  return {
    title,
    description,
    alternates: { canonical: `/get/${slug}` },
    openGraph: {
      title,
      description,
      url: `/get/${slug}`,
      images: [
        {
          url: "https://transparent.city/images/app-screenshot-dashboard.png",
          width: 1200,
          height: 630,
          alt: `${display} weekly data briefing`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function GetLandingPage({ params }: PageProps) {
  const { slug } = await params;

  // Resolve slug → city
  let city:
    | (Awaited<ReturnType<typeof listPublicCitiesForSitemap>>[number] & {
        display: string;
      })
    | null = null;
  let citiesFetched = false;
  let redirectTo: string | null = null;

  try {
    const cities = await listPublicCitiesForSitemap();
    citiesFetched = true;
    const match = cities.find((c) => getCanonicalCitySlug(c) === slug);
    if (match) {
      const canonicalSlug = getCanonicalCitySlug(match);
      if (canonicalSlug && slug !== canonicalSlug) {
        redirectTo = `/get/${canonicalSlug}`;
      } else {
        const display = match.state
          ? `${match.name}, ${match.state}`
          : match.name;
        city = { ...match, display };
      }
    }
  } catch {
    /* render gracefully if backend is down */
  }

  if (redirectTo) {
    redirect(redirectTo);
  }

  if (citiesFetched && !city) notFound();

  const cityDisplayName =
    city?.display ??
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  const cityNameOnly = city?.name ?? cityDisplayName.split(",")[0].trim();

  // Parallel: city detail + comparisons + newsletter editions
  let cityDetail: Awaited<ReturnType<typeof getPublicCityDetail>> | null = null;
  let comparisonsMap: Awaited<ReturnType<typeof getPublicMetricComparisonsBatch>> = {};
  let latestEdition: ReturnType<typeof pickLatestNewsletterEdition> = null;
  let featuredPending: Awaited<ReturnType<typeof getFeaturedPendingNewsletter>> | null =
    null;

  const featuredPendingId = FEATURED_PENDING_BY_SLUG[slug];

  const [detailResult, editionsResult, featuredResult] = await Promise.allSettled([
    city?.id
      ? getPublicCityDetail(city.id)
      : Promise.resolve(null),
    featuredPendingId ? Promise.resolve([]) : listNewsletterEditionsForSitemap(),
    featuredPendingId
      ? getFeaturedPendingNewsletter(featuredPendingId)
      : Promise.resolve(null),
  ]);

  if (detailResult.status === "fulfilled") {
    cityDetail = detailResult.value;
  }
  if (editionsResult.status === "fulfilled" && !featuredPendingId) {
    latestEdition = pickLatestNewsletterEdition(editionsResult.value, slug);
  }
  if (featuredResult.status === "fulfilled" && featuredResult.value) {
    featuredPending = featuredResult.value;
  }

  if (cityDetail && city?.id) {
    const metrics = cityDetail.metrics ?? [];
    if (metrics.length > 0) {
      comparisonsMap = await getPublicMetricComparisonsBatch({
        metric_ids: metrics.map((m) => m.id),
        district: 0,
        comparison_types: ["ytd"],
      }).catch(() => ({}));
    }
  }

  // Build return-to URL for post-auth redirect (lands on onboarding, not get landing)
  const returnToParams = new URLSearchParams({
    signup: "resident",
    follow_city_slug: slug,
    follow_city_name: cityNameOnly,
  });
  if (city?.id) returnToParams.set("follow_city_id", String(city.id));
  const overrideReturnPath = `/home?${returnToParams.toString()}`;

  return (
    <GetLandingClient>
      <PublicNavBar>
        <GetLandingNavSignup
          citySlug={slug}
          cityName={cityNameOnly}
          cityId={city?.id}
          sourceSurface="city_get_landing_nav"
          overrideReturnPath={overrideReturnPath}
        />
      </PublicNavBar>

      <main id="main-content">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className={styles.heroSection}>
          <div className="container">
            <div className={styles.heroInner}>
              {/* Left: headline + signup */}
              <div className={styles.heroLeft}>
                <HeroSignupTrigger
                  className={styles.heroLeftCopy}
                  citySlug={slug}
                  cityName={cityNameOnly}
                  cityId={city?.id}
                  returnTo={overrideReturnPath}
                  sourceSurface="city_get_landing_hero_copy"
                >
                  <span className={styles.heroBadge}>Free weekly · {cityNameOnly}</span>

                  <h1 className={styles.heroTitle}>
                    See {cityNameOnly} clearly, every week.
                  </h1>

                  <p className={styles.heroSubtitle}>
                    A plain-language briefing built from {cityNameOnly}&rsquo;s official
                    open data. New businesses, 311 requests, crime and safety, housing,
                    and more, written so a resident can read it in five minutes. Every
                    number links back to the dataset it came from. Free for the first
                    month, then $5 a month.
                  </p>
                </HeroSignupTrigger>

                <HeroEmailSignup
                  citySlug={slug}
                  cityName={cityNameOnly}
                  cityId={city?.id}
                />
              </div>

              {/* Right: newsletter iframe or placeholder */}
              <div className={styles.heroRight}>
                {featuredPending && featuredPendingId ? (
                  <HeroNewsletterEmbed
                    slug={slug}
                    cityName={cityNameOnly}
                    cityId={city?.id}
                    returnTo={overrideReturnPath}
                    featuredPendingId={featuredPendingId}
                    editionDate={featuredPending.created_at ?? undefined}
                    captionLabel={
                      featuredPending.created_at
                        ? `Personalized sample · ${new Date(
                            featuredPending.created_at
                          ).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          })}`
                        : "Personalized sample"
                    }
                  />
                ) : latestEdition ? (
                  <HeroNewsletterEmbed
                    slug={slug}
                    cityName={cityNameOnly}
                    cityId={city?.id}
                    returnTo={overrideReturnPath}
                    shortHash={latestEdition.shortHash}
                    district={latestEdition.district}
                    editionDate={latestEdition.editionDate}
                  />
                ) : (
                  <HeroSignupTrigger
                    className={styles.newsletterPlaceholder}
                    ariaLabel="Sign up for the weekly briefing"
                    citySlug={slug}
                    cityName={cityNameOnly}
                    cityId={city?.id}
                    returnTo={overrideReturnPath}
                    sourceSurface="city_get_landing_hero_placeholder"
                  >
                    <span className={styles.newsletterPlaceholderIcon}>📬</span>
                    <p className={styles.newsletterPlaceholderTitle}>
                      Sample issue coming soon
                    </p>
                    <p className={styles.newsletterPlaceholderBody}>
                      The first {cityNameOnly} weekly is on its way. Sign up and
                      you&rsquo;ll be the first to get it.
                    </p>
                  </HeroSignupTrigger>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Personalization ───────────────────────────────────── */}
        <PersonalizationSection cityName={cityNameOnly} />

        {/* ── How it works + FAQ ────────────────────────────────── */}
        <HowItWorks cityName={cityNameOnly} />

        {/* ── Stories & metrics ─────────────────────────────────── */}
        {city?.id && (
          <div className={styles.storiesIntroSection}>
            <div className="container">
              <p className={styles.storiesIntroText}>
                Here&rsquo;s a sample of the stories and data your weekly will cover.
                Every item below appeared in a recent {cityNameOnly} data release.
              </p>
            </div>
            <Suspense fallback={<FeaturedStoriesSkeleton />}>
              <FeaturedStoriesAsync
                cityId={city.id}
                slug={slug}
                cityDisplayName={cityDisplayName}
                cityEmoji={city.emoji ?? undefined}
                metrics={cityDetail?.metrics}
                comparisonsMap={comparisonsMap}
              />
            </Suspense>
          </div>
        )}

        {/* ── Pricing ───────────────────────────────────────────── */}
        <PricingSection
          citySlug={slug}
          cityName={cityNameOnly}
          cityId={city?.id}
        />
      </main>

      <GetLandingMobileCTA
        citySlug={slug}
        cityName={cityNameOnly}
        cityId={city?.id}
      />

      <PublicFooter
        citySlug={slug}
        feedbackPageUrl={`/get/${slug}`}
        feedbackPageType="get_landing"
      />
    </GetLandingClient>
  );
}
