import { listPublicFeedStories } from "@/lib/publicApiClient";
import FeaturedStories from "./FeaturedStories";

type Props = {
  cityId: number;
  slug: string;
  cityDisplayName: string;
};

/**
 * Async server component that fetches and renders featured stories.
 * Designed to be wrapped in <Suspense> so the rest of the page can
 * stream without waiting for the feed stories API.
 */
export default async function FeaturedStoriesAsync({ cityId, slug, cityDisplayName }: Props) {
  const feedRes = await listPublicFeedStories({
    city_id: cityId,
    district: 0,
    limit: 6,
    order_by: "published_at",
  }).catch(() => ({ stories: [], count: 0 }));

  const stories = feedRes.stories ?? [];
  if (stories.length === 0) return null;

  return (
    <FeaturedStories
      slug={slug}
      cityDisplayName={cityDisplayName}
      stories={stories}
    />
  );
}
