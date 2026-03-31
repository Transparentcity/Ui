import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../landing.css";
import { getCityFixture } from "@/lib/evergreen/fixtures";
import { getLaunchCity } from "@/lib/evergreen/cities";
import { getSiteOrigin } from "@/lib/siteUrl";
import CitySafePage from "./CitySafePage";

export const revalidate = 86400; // 24 hours

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = getCityFixture(slug);

  if (!data) {
    return { title: "Not Found" };
  }

  const year = new Date().getFullYear();
  const title = `Is ${data.city} Safe in ${year}? Crime Data & Safety Trends | Transparent City`;
  const description = `${data.safetyData.verdictSummary.split(".").slice(0, 2).join(".")}. Updated ${new Date(data.lastUpdated).toLocaleDateString("en-US", { month: "long", year: "numeric" })} with crime and 311 data.`;
  const origin = getSiteOrigin();

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${origin}/c/${slug}/safe`,
      siteName: "Transparent City",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: `${origin}/c/${slug}/safe`,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;

  // TODO: Replace fixture lookup with real API call
  const data = getCityFixture(slug);

  if (!data) {
    notFound();
  }

  const city = getLaunchCity(slug);

  return <CitySafePage {...data} policeDashboardUrl={city?.policeDashboardUrl} />;
}
