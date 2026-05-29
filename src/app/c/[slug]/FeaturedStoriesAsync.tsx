import {
  listPublicFeedStories,
  type PublicCityMetricItem,
  type PublicMetricComparisons,
} from "@/lib/publicApiClient";
import { listNewsletterEditionsForSitemap } from "@/lib/newsletter";
import type { WelcomeNewsletterLink } from "@/components/feed/WelcomeFeedCard";
import FeaturedStories from "./FeaturedStories";

type Props = {
  cityId: number;
  slug: string;
  cityDisplayName: string;
  cityEmoji?: string;
  metrics?: PublicCityMetricItem[];
  comparisonsMap?: Record<number, PublicMetricComparisons>;
  /** Show the dismissible FTUX welcome card at the top. Defaults to true.
   * Set to false on landing-style routes (e.g. /get/[slug]) where this
   * feed appears as marketing content, not the user's inbox. */
  showWelcomeCard?: boolean;
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
  showWelcomeCard = true,
}: Props) {
  const [feedRes, newsletterEditions] = await Promise.all([
    listPublicFeedStories({
      city_id: cityId,
      district: 0,
      limit: 10,
      order_by: "published_at",
    }).catch(() => ({ stories: [], count: 0 })),
    showWelcomeCard ? listNewsletterEditionsForSitemap() : Promise.resolve([]),
  ]);

  const stories = (feedRes.stories ?? []).filter(
    (s) => !/^upcoming civic meetings\b/i.test(s.headline ?? "")
  );

  const welcomeNewsletters: WelcomeNewsletterLink[] = showWelcomeCard
    ? newsletterEditions
        .filter((e) => e.city_slug === slug && (e.district ?? 0) === 0)
        .sort((a, b) => b.edition_date.localeCompare(a.edition_date))
        .slice(0, 3)
        .map((e) => ({ shortHash: e.short_hash, editionDate: e.edition_date }))
    : [];

  return (
    <FeaturedStories
      slug={slug}
      cityDisplayName={cityDisplayName}
      cityEmoji={cityEmoji}
      stories={stories}
      metrics={metrics}
      comparisonsMap={comparisonsMap}
      showWelcomeCard={showWelcomeCard}
      welcomeNewsletters={welcomeNewsletters}
    />
  );
}
