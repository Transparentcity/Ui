import { API_BASE } from "./apiBase";

async function requestPublic<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
      // Public SEO endpoints are safe to cache/revalidate at the route level.
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errorMessage = `API GET ${path} failed: ${res.status}`;
      if (text) {
        try {
          const errorJson = JSON.parse(text);
          errorMessage = errorJson.message || errorJson.detail || errorMessage;
        } catch {
          errorMessage = `${errorMessage} - ${text.substring(0, 200)}`;
        }
      }
      throw new Error(errorMessage);
    }

    return (await res.json()) as T;
  } catch (error) {
    // Handle network errors, CORS errors, and other fetch failures
    if (error instanceof TypeError && error.message.includes("fetch")) {
      // Network error - API might be unreachable
      throw new Error(
        `Failed to connect to API at ${API_BASE}. Please check if the API server is running and accessible.`
      );
    }
    // Re-throw if it's already an Error we created
    if (error instanceof Error) {
      throw error;
    }
    // Unknown error
    throw new Error(`Unexpected error fetching ${path}: ${String(error)}`);
  }
}

export type PublicCitySitemapItem = {
  id: number;
  name: string;
  state?: string | null;
  country?: string | null;
  emoji?: string | null;
  datasets_count: number;
  slug: string;
};

export function listPublicCitiesForSitemap(): Promise<PublicCitySitemapItem[]> {
  return requestPublic<PublicCitySitemapItem[]>("/api/public/cities/sitemap");
}

export type PublicCitySearchResult = {
  id: number;
  name: string;
  state?: string | null;
  country?: string | null;
  emoji?: string | null;
  display_name: string;
};

function isUnitedStates(value: string | null | undefined): boolean {
  const v = (value || "").trim().toLowerCase();
  return (
    v === "united states" ||
    v === "united states of america" ||
    v === "us" ||
    v === "usa"
  );
}

function sortUsCitiesFirst<T extends { country?: string | null }>(items: T[]): T[] {
  // Keep backend relevance ordering within each bucket; only bucket by country.
  return [...items].sort((a, b) => {
    const aUs = isUnitedStates(a.country);
    const bUs = isUnitedStates(b.country);
    if (aUs === bUs) return 0;
    return aUs ? -1 : 1;
  });
}

export function searchPublicCities(
  query: string,
  limit: number = 10,
): Promise<PublicCitySearchResult[]> {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", String(limit));
  return requestPublic<PublicCitySearchResult[]>(
    `/api/public/cities/search?${params.toString()}`,
  ).then(sortUsCitiesFirst);
}


