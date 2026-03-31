import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../../landing.css";
import { getDistrictFixture } from "@/lib/evergreen/fixtures";
import { getLaunchCity } from "@/lib/evergreen/cities";
import { getSiteOrigin } from "@/lib/siteUrl";
import DistrictSafePage from "./DistrictSafePage";

export const revalidate = 86400; // 24 hours

type PageProps = {
  params: Promise<{ slug: string; districtSlug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, districtSlug } = await params;
  const data = getDistrictFixture(slug, districtSlug);

  if (!data) {
    return { title: "Not Found" };
  }

  const year = new Date().getFullYear();
  const title = `Is ${data.district} Safe in ${year}? Crime & Safety Data | Transparent City`;
  const description = `${data.safetyData.verdictSummary.split(".").slice(0, 2).join(".")}. Updated ${new Date(data.lastUpdated).toLocaleDateString("en-US", { month: "long", year: "numeric" })} with the latest crime incident and 311 data from ${data.city}.`;
  const origin = getSiteOrigin();

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${origin}/c/${slug}/${districtSlug}/safe`,
      siteName: "Transparent City",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: `${origin}/c/${slug}/${districtSlug}/safe`,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug, districtSlug } = await params;

  // TODO: Replace fixture lookup with real API call
  const data = getDistrictFixture(slug, districtSlug);

  if (!data) {
    notFound();
  }

  const city = getLaunchCity(slug);

  return (
    <DistrictSafePage
      {...data}
      policeDashboardUrl={city?.policeDashboardUrl}
    />
  );
}
