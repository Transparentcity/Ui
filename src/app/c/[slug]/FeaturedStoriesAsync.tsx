import {
  listPublicFeedStories,
  type PublicCityMetricItem,
  type PublicMetricComparisons,
} from "@/lib/publicApiClient";
import FeaturedStories from "./FeaturedStories";

type Props = {
  cityId: number;
  slug: string;
  cityDisplayName: string;
  cityEmoji?: string;
  metrics?: PublicCityMetricItem[];
  comparisonsMap?: Record<number, PublicMetricComparisons>;
};

/**
 * Async server component that fetches and renders featured stories.
 * Designed to be wrapped in <Suspense> so the rest of the page can
 * stream without waiting for the feed stories API.
 */
export default async function FeaturedStoriesAsync({
  cityId,
  slug,
  cityDisplayName,
  cityEmoji,
  metrics,
  comparisonsMap,
}: Props) {
  const feedRes = await listPublicFeedStories({
    city_id: cityId,
    district: 0,
    limit: 6,
    order_by: "published_at",
  }).catch(() => ({ stories: [], count: 0 }));

  const stories = feedRes.stories ?? [];

  return (
    <FeaturedStories
      slug={slug}
      cityDisplayName={cityDisplayName}
      cityEmoji={cityEmoji}
      stories={stories}
      metrics={metrics}
      comparisonsMap={comparisonsMap}
    />
  );
}
