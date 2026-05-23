import type { Metadata } from "next";
import "../../landing.css";
import {
  getPublicCityDetail,
  getPublicMetricComparisonsBatch,
  listPublicCitiesForSitemap,
} from "@/lib/publicApiClient";
import CincinnatiLanding from "./CincinnatiLanding";
import {
  CINCY_ROW_CONFIG,
  buildLiveRows,
  type LiveRow,
  type NumbersMeta,
} from "./cincinnatiMetrics";

export const revalidate = 3600;

/** Short codes resolve to a city slug. Today every code points to Cincinnati.
 * Add new entries here as we ship more paid-acquisition landings. */
const CODE_TO_CITY_SLUG: Record<string, string> = {
  // default fallback handled in resolveCode()
};

const DEFAULT_CITY_SLUG = "cincinnati";

function resolveCitySlug(code: string): string {
  return CODE_TO_CITY_SLUG[code.toLowerCase()] ?? DEFAULT_CITY_SLUG;
}

type PageProps = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const title = "What's actually changing in Cincinnati this week | Transparent.city";
  const description =
    "One Sunday-morning email. Real numbers from Cincinnati open data: permits, 311s, crime stats, restaurant openings, and the changes that actually affect your neighborhood.";
  return {
    title,
    description,
    alternates: { canonical: `/L/${code}` },
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `/L/${code}`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ShortLinkLandingPage({ params }: PageProps) {
  const { code } = await params;
  const citySlug = resolveCitySlug(code);

  let cityId: number | null = null;
  let cityName = "Cincinnati";
  try {
    const cities = await listPublicCitiesForSitemap();
    const match = cities.find(
      (c) => (c.slug || "").toLowerCase() === citySlug.toLowerCase()
    );
    if (match) {
      cityId = match.id;
      cityName = match.name;
    }
  } catch {
    /* render gracefully if backend is unreachable */
  }

  // Pull live YTD comparisons for the 12 metrics shown in the Numbers table.
  // If anything fails we pass null and the client falls back to the static rows.
  let liveRows: LiveRow[] | null = null;
  let numbersMeta: NumbersMeta | null = null;
  if (cityId != null) {
    try {
      const detail = await getPublicCityDetail(cityId, { includeMetrics: true });
      const wantedKeys = new Set(CINCY_ROW_CONFIG.map((c) => c.metricKey));
      const idToKey: Record<number, string> = {};
      for (const m of detail.metrics ?? []) {
        if (wantedKeys.has(m.metric_key)) idToKey[m.id] = m.metric_key;
      }
      const metricIds = Object.keys(idToKey).map((s) => Number(s));
      if (metricIds.length > 0) {
        const comps = await getPublicMetricComparisonsBatch({
          metric_ids: metricIds,
          district: 0,
          comparison_types: ["ytd"],
        });
        const byKey: Record<
          string,
          { curr: number | null; prev: number | null; end: string | null }
        > = {};
        for (const id of metricIds) {
          const entry = comps[id];
          const ytd = entry?.comparisons?.ytd;
          const key = idToKey[id];
          if (ytd && key) {
            byKey[key] = {
              curr: ytd.current_period_value,
              prev: ytd.comparison_period_value,
              end: ytd.current_period_end,
            };
          }
        }
        const built = buildLiveRows(byKey);
        if (built.rows.length > 0) {
          liveRows = built.rows;
          numbersMeta = built.meta;
        }
      }
    } catch {
      /* keep liveRows = null → client falls back to static rows */
    }
  }

  return (
    <CincinnatiLanding
      shortCode={code}
      citySlug={citySlug}
      cityName={cityName}
      cityId={cityId}
      liveRows={liveRows}
      numbersMeta={numbersMeta}
    />
  );
}
