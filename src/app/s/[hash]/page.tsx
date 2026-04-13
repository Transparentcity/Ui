import { redirect, notFound } from "next/navigation";
import { getPublicFeedStoryByHash, listPublicCitiesForSitemap } from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ hash: string }>;
};

/**
 * /s/[hash] — public short-URL for feed stories.
 *
 * Performs a server-side 308 permanent redirect to the canonical
 * /c/[slug]/stories/[hash] page so search engines index the right URL.
 * Falls back to /feed/[id] for legacy stories without a city slug.
 */
export default async function StoryShortUrlPage({ params }: PageProps) {
  const { hash } = await params;
  if (!hash) notFound();

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
    redirect(`/c/${citySlug}/stories/${hash}`);
  }

  // Legacy fallback: redirect to /feed/{id}
  redirect(`/feed/${story.id}`);
}
