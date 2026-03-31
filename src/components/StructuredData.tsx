import { getSiteOrigin } from "@/lib/siteUrl";

// ============================================================================
// SITE-WIDE STRUCTURED DATA
// ============================================================================

/**
 * Emits Organization + WebSite + SearchAction JSON-LD for every page.
 * Place once in the root layout inside <body>.
 */
export function SiteStructuredData() {
  const origin = getSiteOrigin();

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: "Transparent.city",
        url: origin,
        logo: {
          "@type": "ImageObject",
          url: `${origin}/favicon.svg`,
        },
        sameAs: ["https://transparentcity.com"],
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: origin,
        name: "Transparent.city",
        description:
          "Transparent.city turns public city data into clear, source-linked insights so residents and public officials can see what's working and where to focus.",
        publisher: { "@id": `${origin}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${origin}/?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ============================================================================
// CITY PAGE STRUCTURED DATA
// ============================================================================

interface CityStructuredDataProps {
  cityName: string;
  citySlug: string;
  description: string;
  datasetsCount?: number | null;
  state?: string | null;
  country?: string | null;
}

/**
 * Emits GovernmentOrganization + Dataset JSON-LD for city pages.
 */
export function CityStructuredData({
  cityName,
  citySlug,
  description,
  datasetsCount,
  state,
  country,
}: CityStructuredDataProps) {
  const origin = getSiteOrigin();
  const cityUrl = `${origin}/c/${citySlug}`;

  const displayName =
    state && country && country !== "United States"
      ? `${cityName}, ${state}, ${country}`
      : state
        ? `${cityName}, ${state}`
        : country && country !== "United States"
          ? `${cityName}, ${country}`
          : cityName;

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "GovernmentOrganization",
        "@id": `${cityUrl}/#government`,
        name: displayName,
        url: cityUrl,
      },
      {
        "@type": "Dataset",
        "@id": `${cityUrl}/#dataset`,
        name: `${displayName} Public Data – Transparent.city`,
        description,
        url: cityUrl,
        ...(datasetsCount
          ? { measurementTechnique: `${datasetsCount} public datasets` }
          : {}),
        spatialCoverage: {
          "@type": "Place",
          name: displayName,
        },
        creator: {
          "@id": `${origin}/#organization`,
        },
        publisher: {
          "@id": `${origin}/#organization`,
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ============================================================================
// METRIC PAGE STRUCTURED DATA
// ============================================================================

interface MetricStructuredDataProps {
  metricName: string;
  metricKey: string;
  cityName: string;
  citySlug: string;
  description: string;
  category: string;
  dateModified?: string | null;
}

/**
 * Emits Article + Dataset JSON-LD for metric detail pages.
 */
export function MetricStructuredData({
  metricName,
  metricKey,
  cityName,
  citySlug,
  description,
  category,
  dateModified,
}: MetricStructuredDataProps) {
  const origin = getSiteOrigin();
  const metricUrl = `${origin}/c/${citySlug}/metrics/${metricKey}`;

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${metricUrl}/#article`,
        headline: `${metricName} in ${cityName}`,
        description,
        url: metricUrl,
        articleSection: category,
        ...(dateModified ? { dateModified } : {}),
        author: { "@id": `${origin}/#organization` },
        publisher: { "@id": `${origin}/#organization` },
        about: {
          "@type": "Place",
          name: cityName,
        },
        isPartOf: { "@id": `${origin}/#website` },
      },
      {
        "@type": "Dataset",
        "@id": `${metricUrl}/#dataset`,
        name: `${metricName} – ${cityName}`,
        description,
        url: metricUrl,
        spatialCoverage: {
          "@type": "Place",
          name: cityName,
        },
        creator: { "@id": `${origin}/#organization` },
        publisher: { "@id": `${origin}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
