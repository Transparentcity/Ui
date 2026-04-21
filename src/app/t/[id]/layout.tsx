import type { Metadata } from "next";
import { getSiteOrigin } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function absoluteApiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001").replace(
    /\/$/,
    ""
  );
  return new URL(path, `${base}/`).href;
}

async function fetchPublicTimeSeries(chartId: string) {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001").replace(
    /\/$/,
    ""
  );
  const res = await fetch(`${base}/api/time-series/public/${chartId}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ metadata?: Record<string, unknown> }>;
}

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const canonical = `${getSiteOrigin()}/t/${id}`;
  if (!/^\d+$/.test(id)) {
    return { title: "Chart | TransparentCity", alternates: { canonical } };
  }
  const data = await fetchPublicTimeSeries(id);
  const meta = data?.metadata;
  const titleBase =
    (typeof meta?.chart_title === "string" && meta.chart_title) ||
    (typeof meta?.object_name === "string" && meta.object_name) ||
    (typeof meta?.field_name === "string" && meta.field_name) ||
    "Time series chart";
  const city = typeof meta?.city_name === "string" ? meta.city_name : "";
  const title = city ? `${city} — ${titleBase}` : titleBase;
  const cap = meta?.caption;
  const description =
    typeof cap === "string" && cap
      ? stripHtml(cap)
      : `Time series: ${titleBase}${city ? ` (${city})` : ""}`;
  const seoPath =
    typeof meta?.seo_og_image_url === "string" && meta.seo_og_image_url.startsWith("/")
      ? meta.seo_og_image_url
      : null;
  const ogImage = seoPath ? absoluteApiUrl(seoPath) : undefined;
  return {
    title: `${title} | TransparentCity`,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "TransparentCity",
      type: "article",
      ...(ogImage
        ? {
            images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default function TimeSeriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
