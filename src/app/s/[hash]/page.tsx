import { redirect, notFound } from "next/navigation";
import { getPublicFeedStoryByHash, listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ hash: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function querySuffix(
  searchParams: Record<string, string | string[] | undefined> | undefined
): string {
  if (!searchParams) return "";
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && item !== "") qs.append(key, item);
      }
    } else if (value != null && value !== "") {
      qs.set(key, value);
    }
  }
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : "";
}

/**
 * /s/[hash] — public short-URL for feed stories.
 *
 * Server-side redirect to the canonical /c/[slug]/stories/[hash] page.
 * Query params (utm_*, nl) must be forwarded or newsletter click tracking
 * and the landing banner never see the visit.
 */
export default async function StoryShortUrlPage({ params, searchParams }: PageProps) {
  const { hash } = await params;
  if (!hash) notFound();
  const suffix = querySuffix((await searchParams) || {});

  let story: Awaited<ReturnType<typeof getPublicFeedStoryByHash>>["story"] | null = null;
  try {
    const res = await getPublicFeedStoryByHash(hash);
    story = res.story;
  } catch {
    notFound();
  }

  if (!story) notFound();

  // Try to resolve city slug for the canonical URL
  let citySlug: string | null = null;
  if (story.city_id) {
    try {
      const cities = await listPublicCitiesForSitemap();
      const match = cities.find((c) => c.id === story!.city_id);
      citySlug = match?.name ? slugify(match.name) : null;
    } catch {
      // fall through to legacy path
    }
  }

  if (citySlug && hash) {
    redirect(`/c/${citySlug}/stories/${hash}${suffix}`);
  }

  // Legacy fallback: redirect to /feed/{id}
  redirect(`/feed/${story.id}${suffix}`);
}
