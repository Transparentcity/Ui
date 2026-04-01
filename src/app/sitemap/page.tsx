import type { Metadata } from "next";
import Link from "next/link";

import "../landing.css";
import styles from "./sitemap.module.css";

import PublicFooter from "@/components/PublicFooter";
import SitemapHeader from "@/components/SitemapHeader";
import { listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import { API_BASE } from "@/lib/apiBase";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Site Map – Transparent.city",
  description:
    "Transparent.city site map: browse all available cities and key resources.",
  alternates: {
    canonical: "/sitemap",
  },
};

type CityGroup = {
  country: string;
  state: string;
  cities: Array<{
    id: number;
    name: string;
    slug: string;
    emoji: string;
    state?: string | null;
    country?: string | null;
    datasetsCount: number;
  }>;
};

function normalizeCountryLabel(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "Other";
  const upper = raw.toUpperCase();
  if (upper === "US" || upper === "USA" || upper === "UNITED STATES") {
    return "United States";
  }
  return raw;
}

function countrySortKey(country: string): string {
  // Make US always appear first.
  if (country === "United States") return `0-${country}`;
  return `1-${country}`;
}

function groupCitiesByCountryAndState(
  cities: Awaited<ReturnType<typeof listPublicCitiesForSitemap>>,
): CityGroup[] {
  const byCountryState = new Map<string, Map<string, CityGroup["cities"]>>();

  for (const city of cities) {
    const country = normalizeCountryLabel(city.country);
    const state = city.state || (country === "United States" ? "Other" : "—");

    const byState = byCountryState.get(country) || new Map<string, CityGroup["cities"]>();
    const list = byState.get(state) || [];
    list.push({
      id: city.id,
      name: city.name,
      slug: city.slug,
      emoji: city.emoji || "🏙️",
      state: city.state,
      country: city.country,
      datasetsCount: city.datasets_count,
    });
    byState.set(state, list);
    byCountryState.set(country, byState);
  }

  const countries = Array.from(byCountryState.entries()).sort(([a], [b]) =>
    countrySortKey(a).localeCompare(countrySortKey(b)),
  );

  const groups: CityGroup[] = [];
  for (const [country, byState] of countries) {
    const states = Array.from(byState.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [state, groupedCities] of states) {
      groups.push({
        country,
        state,
        cities: groupedCities.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
  }

  return groups;
}

export default async function SiteMapPage() {
  let cities = [] as Awaited<ReturnType<typeof listPublicCitiesForSitemap>>;
  let error: string | null = null;

  try {
    cities = await listPublicCitiesForSitemap();
  } catch (e) {
    if (e instanceof Error) {
      error = e.message;
      // Log error details for debugging (only in server-side, won't expose to client)
      console.error(
        `[SiteMap] Failed to load cities from ${API_BASE}/api/public/cities/sitemap:`,
        e.message
      );
    } else {
      error = `Unknown error: ${String(e)}`;
      console.error("[SiteMap] Unexpected error:", e);
    }
  }

  const groups = groupCitiesByCountryAndState(cities);

  return (
    <>
      <SitemapHeader />

      <section className={styles.sitemapSection}>
        <div className="container">
          <div className="section-header">
            <h1 className="section-title">Site Map</h1>
            <p className="section-description">
              Browse the cities currently indexed on Transparent.city.
            </p>
          </div>

          {error ? (
            <div className={styles.errorBox}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Couldn’t load cities
              </div>
              <div style={{ fontSize: "0.95rem" }}>{error}</div>
            </div>
          ) : groups.length ? (
            (() => {
              const byCountry = new Map<string, CityGroup[]>();
              for (const group of groups) {
                const list = byCountry.get(group.country) || [];
                list.push(group);
                byCountry.set(group.country, list);
              }

              const countries = Array.from(byCountry.keys()).sort((a, b) =>
                countrySortKey(a).localeCompare(countrySortKey(b)),
              );

              return countries.map((country) => {
                const countryGroups = byCountry.get(country) || [];
                return (
                  <div key={country} className={styles.countryGroup}>
                    <h2 className={styles.countryTitle}>{country}</h2>
                    {countryGroups.map((group) => (
                      <div
                        key={`${country}-${group.state}`}
                        className={styles.stateGroup}
                      >
                        <h3 className={styles.stateTitle}>
                          {country === "United States" ? group.state : group.state === "—" ? "Cities" : group.state}
                        </h3>
                        <div className={styles.citiesGrid}>
                          {group.cities.map((city) => {
                            const meta =
                              country === "United States"
                                ? city.state || "United States"
                                : city.country || country;
                            return (
                              <Link
                                key={city.id}
                                href={`/c/${city.slug}?id=${city.id}`}
                                className={styles.cityCard}
                              >
                                <span className={styles.cityEmoji}>
                                  {city.emoji}
                                </span>
                                <div>
                                  <div className={styles.cityName}>
                                    {city.name}
                                  </div>
                                  <div className={styles.cityMeta}>
                                    {city.datasetsCount} datasets
                                    {meta ? ` · ${meta}` : ""}
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              });
            })()
          ) : (
            <div className="text-center">
              <p>No cities available yet.</p>
            </div>
          )}
        </div>
      </section>

      <PublicFooter />
    </>
  );
}


