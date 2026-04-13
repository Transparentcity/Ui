import { ImageResponse } from "next/og";
import { getPublicMetricByKey, listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";

export const runtime = "edge";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = {
  params: Promise<{ slug: string; metricKey: string }>;
};

export default async function MetricOgImage({ params }: Props) {
  const { slug, metricKey } = await params;

  let metricName = metricKey.replace(/-/g, " ");
  let cityName = slug;
  let category = "";

  try {
    const [metric, cities] = await Promise.all([
      getPublicMetricByKey(metricKey),
      listPublicCitiesForSitemap(),
    ]);
    metricName = metric.metric_name;
    category = metric.category;
    const match = cities.find((c) => slugify(c.name) === slug);
    if (match) {
      cityName = match.state
        ? `${match.name}, ${match.state}`
        : match.name;
    } else {
      cityName = metric.city_name ?? slug;
    }
  } catch {
    // Fall back to slug-derived values
  }

  const year = new Date().getFullYear();

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0f1117",
          padding: "60px 72px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#3b82f6",
            }}
          />
          <span style={{ color: "#6b7280", fontSize: 18, letterSpacing: "0.05em" }}>
            transparent.city
          </span>
          {category && (
            <>
              <span style={{ color: "#374151", fontSize: 18 }}>/</span>
              <span
                style={{
                  color: "#3b82f6",
                  fontSize: 16,
                  backgroundColor: "#1e3a5f",
                  padding: "4px 12px",
                  borderRadius: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {category}
              </span>
            </>
          )}
        </div>

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 58,
              fontWeight: 700,
              color: "#f9fafb",
              lineHeight: 1.1,
              maxWidth: 900,
            }}
          >
            {metricName}
          </div>
          <div
            style={{
              fontSize: 30,
              color: "#6b7280",
              fontWeight: 400,
            }}
          >
            {cityName} &middot; {year}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ color: "#4b5563", fontSize: 16 }}>
            Public data, source-linked
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#f9fafb",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: "#3b82f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                color: "#fff",
              }}
            >
              T
            </div>
            Transparent.city
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
