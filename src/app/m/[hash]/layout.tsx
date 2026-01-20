import { Metadata } from "next";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ hash: string }>;
  children: React.ReactNode;
};

// Fetch map data server-side for metadata (no auth required)
async function getMapMetadata(hash: string): Promise<{
  title: string;
  description: string;
  pointCount: number;
} | null> {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
    const response = await fetch(`${apiBase}/api/maps/public/${hash}`, {
      next: { revalidate: 60 }, // Cache for 1 minute
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      title: data.title,
      description: data.description || `Interactive map with ${data.location_data?.length || 0} locations`,
      pointCount: data.location_data?.length || 0,
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
  const url = `https://www.transparentcity.co/m/${hash}`;
  
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
          url: "/images/og-map-default.png", // Default map OG image
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
      images: ["/images/og-map-default.png"],
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

