import type { Metadata } from "next";
import NewsletterLandingClient from "./NewsletterLandingClient";
import "../landing.css";
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "The Transparent.city Newsletter — Civic Data, Clearly Explained",
  description:
    "A free weekly briefing on what's actually changing in your city. Sourced from official public data, delivered to your inbox every week.",
  alternates: {
    canonical: "https://transparent.city/newsletter",
  },
  openGraph: {
    title: "The Transparent.city Newsletter — Civic Data, Clearly Explained",
    description:
      "A free weekly briefing on what's actually changing in your city. Sourced from official public data, delivered to your inbox every week.",
    url: "https://transparent.city/newsletter",
  },
};

export default async function NewsletterLandingPage() {
  const cities = await listPublicCitiesForSitemap().catch(() => []);
  const launched = cities
    .filter((c) => c.is_launched === true)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);

  return <NewsletterLandingClient launchedCities={launched} />;
}
