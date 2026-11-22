import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import "../../../landing.css";

import styles from "@/components/activities/ActivityPage.module.css";
import PublicFooter from "@/components/PublicFooter";
import PublicNavBar from "@/components/PublicNavBar";
import { ACTIVITIES_LABEL, activitiesEnabled, type ActivityListItem } from "@/lib/activities";
import { listPublicCityActivities } from "@/lib/publicApiClient";

import CitySignupButton from "../CitySignupButton";
import CityViewTracker from "../CityViewTracker";
import { SignupEmailProvider } from "../SignupEmailContext";
import ActivityHero, { findActivityCity } from "./ActivityHero";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const city = await findActivityCity(slug);
  return {
    title: `${ACTIVITIES_LABEL} | ${city?.display ?? slug}`,
    alternates: { canonical: `/c/${slug}/activities` },
    robots: { index: false, follow: false },
  };
}

export default async function CityActivitiesIndex({ params }: PageProps) {
  if (!activitiesEnabled()) notFound();
  const { slug } = await params;
  const city = await findActivityCity(slug);
  if (!city) notFound();
  let items: ActivityListItem[] = [];
  try {
    items = (await listPublicCityActivities(slug)).activities;
  } catch {
    notFound();
  }
  if (!items.length) notFound();

  return (
    <SignupEmailProvider>
      <CityViewTracker citySlug={slug} cityId={city.id} />
      <PublicNavBar>
        <CitySignupButton citySlug={slug} cityName={city.display} />
      </PublicNavBar>
      <ActivityHero
        city={city}
        slug={slug}
        title={`${city.display}: ${ACTIVITIES_LABEL}`}
        description="What you can do about it. Each activity starts from the city’s own records for your area."
      />
      <section className="dashboard-section">
        <div className="container">
          <div className={styles.wrap}>
            <ul className={styles.activityList}>
              {items.map((a) => (
                <li key={a.slug}>
                  <Link
                    className={styles.activityCard}
                    href={`/c/${slug}/activities/${a.slug}${a.example_area ? `?area=${a.example_area}` : ""}`}
                  >
                    <span className={styles.activityCardTitle}>{a.title}</span>
                    <span className={styles.meta}>{a.short_title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <PublicFooter citySlug={slug} feedbackPageUrl={`/c/${slug}/activities`} feedbackPageType="category" />
    </SignupEmailProvider>
  );
}
