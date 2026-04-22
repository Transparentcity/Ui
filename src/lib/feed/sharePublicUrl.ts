import { toast } from "sonner";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { resolveOutboundCanonicalPath } from "@/lib/feed/canonicalUrl";

/** Any engagement mutation that accepts a share event (wider action unions are OK). */
export type ShareEngagement = {
  mutate: (variables: { storyId: number; action: "share" }) => void;
};

/**
 * Copy or native-share the public canonical URL for a story (already public scope).
 */
export function runSharePublicUrl(
  story: EnrichedFeedStory,
  trackEngagement: ShareEngagement,
): void {
  trackEngagement.mutate({ storyId: story.id, action: "share" });
  const path = resolveOutboundCanonicalPath(story);
  const url = `${window.location.origin}${path}`;

  if (typeof navigator.share === "function") {
    navigator.share({ title: story.headline, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied to clipboard"),
      () => toast.error("Could not copy link"),
    );
  }
}
