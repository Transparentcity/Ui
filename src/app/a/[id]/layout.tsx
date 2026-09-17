import { Metadata } from "next";
import { pickAnomalyLookup } from "@/lib/anomalyPageData";

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { next: { revalidate: 60 } });
  if (!response.ok) return null;
  return (await response.json()) as Record<string, unknown>;
}

// Fetch anomaly metadata server-side for SEO
async function getAnomalyMetadata(id: string): Promise<{
  title: string;
  description: string;
  metricName: string;
  imageUrl?: string;
} | null> {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
    const [result, stats] = await Promise.all([
      fetchJson(`${apiBase}/api/anomalies/public/result/${id}`),
      fetchJson(`${apiBase}/api/anomalies/public/stats/${id}`),
    ]);
    const picked = pickAnomalyLookup(result, stats);
    if (!picked) return null;
    const data = picked.row;

    const nested =
      data.anomaly && typeof data.anomaly === "object"
        ? (data.anomaly as Record<string, unknown>)
        : data;
    const nestedMeta =
      nested.metadata && typeof nested.metadata === "object"
        ? (nested.metadata as Record<string, unknown>)
        : {};

    const metricName = String(
      nested.metric_name ||
        nested.object_name ||
        nestedMeta.object_name ||
        nested.field_name ||
        nestedMeta.field_name ||
        "Anomaly",
    );
    const groupField =
      nested.group_field || nested.place_type || nestedMeta.group_field_name || null;
    const groupValue =
      nested.group_value || nested.place_key || nestedMeta.group_value || null;
    const cityName = nested.city_name || nestedMeta.city_name || null;

    const parts: string[] = [];
    if (typeof cityName === "string" && cityName) parts.push(cityName);
    if (groupField && groupValue && groupField !== "citywide") {
      parts.push(`${metricName} - ${groupField}: ${groupValue}`);
    } else {
      parts.push(metricName);
    }

    const title = `${parts.join(" • ")} Anomaly`;
    const imageUrl =
      picked.source === "stats"
        ? `${apiBase}/api/anomalies/public/stats/${id}/image`
        : `${apiBase}/api/anomalies/public/result/${id}/image`;

    return {
      title,
      description: `Anomaly detection chart for ${metricName}${cityName ? ` in ${cityName}` : ""}`,
      metricName,
      imageUrl,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const anomalyData = await getAnomalyMetadata(id);

  if (!anomalyData) {
    return {
      title: "Anomaly Not Found | TransparentCity",
      description: "This anomaly could not be found or may be private.",
    };
  }

  const title = `${anomalyData.title} | TransparentCity`;
  const description = anomalyData.description;
  const url = `https://transparent.city/a/${id}`;

  const imageUrl = anomalyData.imageUrl || "/images/og-anomaly-default.png";

  return {
    title,
    description,
    openGraph: {
      title: anomalyData.title,
      description,
      url,
      siteName: "TransparentCity",
      type: "article",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: anomalyData.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: anomalyData.title,
      description,
      images: [imageUrl],
    },
    alternates: {
      canonical: url,
    },
    keywords: [
      "anomaly detection",
      "data analysis",
      "civic data",
      "public data",
      "data visualization",
      "TransparentCity",
    ],
  };
}

export default async function AnomalyLayout({
  children,
  params,
}: Props) {
  await params; // Ensure params is resolved
  return children;
}

