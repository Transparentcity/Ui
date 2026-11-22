import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import "../../../landing.css";

import PublicFooter from "@/components/PublicFooter";
import PublicNavBar from "@/components/PublicNavBar";
import { ACTIVITIES_LABEL, activitiesEnabled, listPublicActivities, type ActivityListItem } from "@/lib/activities";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${ACTIVITIES_LABEL} | ${slug}`,
    alternates: { canonical: `/c/${slug}/activities` },
    robots: { index: false, follow: false },
  };
}

export default async function CityActivitiesIndex({ params }: PageProps) {
  if (!activitiesEnabled()) notFound();
  const { slug } = await params;
  let items: ActivityListItem[] = [];
  try {
    items = (await listPublicActivities(slug)).activities;
  } catch {
    notFound();
  }
  if (!items.length) notFound();

  return (
    <>
      <PublicNavBar>{null}</PublicNavBar>
      <section className="hero" style={{ paddingTop: 96 }}>
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <span className="badge">{ACTIVITIES_LABEL}</span>
              <h1 className="hero-title">What you can do</h1>
              <p className="hero-description">Each activity starts from the city&rsquo;s own records for your area.</p>
              <div className="hero-category-links">
                <Link href={`/c/${slug}`} className="hero-category-link">
                  Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="container" style={{ padding: "24px 16px 64px" }}>
        <ol>
          {items.map((a) => (
            <li key={a.slug} style={{ margin: "0 0 12px" }}>
              <Link href={`/c/${slug}/activities/${a.slug}`}>{a.title}</Link>
              {a.example_area && (
                <>
                  {" "}
                  (<Link href={`/c/${slug}/activities/${a.slug}?area=${a.example_area}`}>example area</Link>)
                </>
              )}
            </li>
          ))}
        </ol>
      </div>
      <PublicFooter citySlug={slug} feedbackPageUrl={`/c/${slug}/activities`} feedbackPageType="category" />
    </>
  );
}
