import { Metadata } from "next";
import { getSiteOrigin } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ hash: string }>;
  children: React.ReactNode;
};

function absoluteApiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001").replace(
    /\/$/,
    ""
  );
  return new URL(path, `${base}/`).href;
}

// Fetch map data server-side for metadata (no auth required)
async function getMapMetadata(hash: string): Promise<{
  title: string;
  description: string;
  pointCount: number;
  seoOgImagePath: string | null;
} | null> {
  try {
    const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001").replace(
      /\/$/,
      ""
    );
    const response = await fetch(`${apiBase}/api/maps/public/${hash}`, {
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!response.ok) return null;

    const data = await response.json();
    const rawSeo = data.map_config?.seo_og_image_url;
    const seoOgImagePath =
      typeof rawSeo === "string" && rawSeo.startsWith("/") ? rawSeo : null;
    return {
      title: data.title,
      description:
        data.description ||
        `Interactive map with ${data.location_data?.length || 0} locations`,
      pointCount: data.location_data?.length || 0,
      seoOgImagePath,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  const mapData = await getMapMetadata(hash);
  
  if (!mapData) {
    return {
      title: "Map Not Found | TransparentCity",
      description: "This map could not be found or may be private.",
    };
  }
  
  const title = `${mapData.title} | TransparentCity Maps`;
  const description = mapData.description;
  const url = `${getSiteOrigin()}/m/${hash}`;
  const ogImageUrl = mapData.seoOgImagePath
    ? absoluteApiUrl(mapData.seoOgImagePath)
    : `${getSiteOrigin()}/images/og-map-default.png`;

  return {
    title,
    description,
    openGraph: {
      title: mapData.title,
      description,
      url,
      siteName: "TransparentCity",
      type: "article",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: mapData.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: mapData.title,
      description,
      images: [ogImageUrl],
    },
    alternates: {
      canonical: url,
    },
    keywords: [
      "civic data",
      "interactive map",
      "public data",
      "data visualization",
      "TransparentCity",
    ],
  };
}

export default async function MapLayout({ children, params }: Props) {
  await params; // Ensure params is resolved
  return children;
}

