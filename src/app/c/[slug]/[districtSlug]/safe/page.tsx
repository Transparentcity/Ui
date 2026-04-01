import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../../landing.css";
import {
  listEvergreenCityDistricts,
  getEvergreenDistrictSafety,
} from "@/lib/publicApiClient";
import { getLaunchCity } from "@/lib/evergreen/cities";
import { getSiteOrigin } from "@/lib/siteUrl";
import DistrictSafePage from "./DistrictSafePage";

export const revalidate = 86400; // 24 hours

type PageProps = {
  params: Promise<{ slug: string; districtSlug: string }>;
};

async function resolveDistrictNumber(
  citySlug: string,
  districtSlug: string
): Promise<number | null> {
  try {
    const { districts } = await listEvergreenCityDistricts(citySlug);
    const match = districts.find((d) => d.districtSlug === districtSlug);
    return match?.districtNumber ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, districtSlug } = await params;

  try {
    const districtNumber = await resolveDistrictNumber(slug, districtSlug);
    if (districtNumber === null) {
      return { title: "Not Found" };
    }

    const data = await getEvergreenDistrictSafety(slug, districtNumber);
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
  } catch {
    return { title: "Safety – Transparent.city" };
  }
}

export default async function Page({ params }: PageProps) {
  const { slug, districtSlug } = await params;

  const districtNumber = await resolveDistrictNumber(slug, districtSlug);
  if (districtNumber === null) {
    notFound();
  }

  let data: Awaited<ReturnType<typeof getEvergreenDistrictSafety>>;
  try {
    data = await getEvergreenDistrictSafety(slug, districtNumber);
  } catch {
    notFound();
  }

  const city = getLaunchCity(slug);

  return (
    <DistrictSafePage
      city={data.city}
      citySlug={data.citySlug}
      state={data.state ?? ""}
      district={data.district}
      districtSlug={data.districtSlug}
      districtNumber={data.districtNumber}
      lastUpdated={data.lastUpdated}
      dataAvailability={data.dataAvailability}
      safetyData={data.safetyData}
      crimeMapMetricIds={data.crimeMapMetricIds}
      relatedDistricts={data.relatedDistricts}
      policeDashboardUrl={city?.policeDashboardUrl}
    />
  );
}
