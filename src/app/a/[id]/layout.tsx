import { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

// Fetch anomaly metadata server-side for SEO
async function getAnomalyMetadata(id: string): Promise<{
  title: string;
  description: string;
  metricName: string;
} | null> {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
    const response = await fetch(`${apiBase}/api/anomalies/public/result/${id}`, {
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!response.ok) {
      // Try transparentSF API format
      const transparentSFBase = process.env.NEXT_PUBLIC_TRANSPARENTSF_API_BASE_URL || "";
      if (transparentSFBase) {
        const sfResponse = await fetch(
          `${transparentSFBase}/anomaly-analyzer/api/anomaly-details/${id}`,
          { next: { revalidate: 60 } }
        );
        if (!sfResponse.ok) return null;
        const sfData = await sfResponse.json();
        if (sfData.status === "error" || !sfData.anomaly) return null;
        const anomaly = sfData.anomaly;
        const metricName =
          anomaly.metadata?.object_name ||
          anomaly.metadata?.field_name ||
          "Anomaly";
        return {
          title: `${metricName} Anomaly`,
          description: `Anomaly detection chart for ${metricName}`,
          metricName,
        };
      }
      return null;
    }

    const data = await response.json();
    
    // Handle different response formats
    let metricName = "Anomaly";
    let groupField = null;
    let groupValue = null;
    let cityName = null;
    
    if (data.anomaly) {
      // TransparentSF format
      metricName =
        data.anomaly.metadata?.object_name ||
        data.anomaly.metadata?.field_name ||
        "Anomaly";
      groupField = data.anomaly.metadata?.group_field_name || data.anomaly.group_field;
      groupValue = data.anomaly.metadata?.group_value || data.anomaly.group_value;
      cityName = data.anomaly.metadata?.city_name;
    } else if (data.object_name) {
      // TransparentCity platform format
      metricName = data.object_name;
      groupField = data.group_field;
      groupValue = data.group_value;
      cityName = data.city_name;
    } else if (data.field_name) {
      metricName = data.field_name;
      groupField = data.group_field;
      groupValue = data.group_value;
      cityName = data.city_name;
    }
    
    if (!data || (data.status === "error" && !data.id)) return null;

    // Build title with city, group info, and date if available
    const parts: string[] = [];
    
    if (cityName) {
      parts.push(cityName);
    }
    
    if (groupField && groupValue) {
      parts.push(`${metricName} - ${groupField}: ${groupValue}`);
    } else {
      parts.push(metricName);
    }
    
    const title = `${parts.join(" • ")} Anomaly`;

    return {
      title,
      description: `Anomaly detection chart for ${metricName}${cityName ? ` in ${cityName}` : ""}${groupField && groupValue ? ` - ${groupField}: ${groupValue}` : ""}`,
      metricName,
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
          url: "/images/og-anomaly-default.png", // Default anomaly OG image
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
      images: ["/images/og-anomaly-default.png"],
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

