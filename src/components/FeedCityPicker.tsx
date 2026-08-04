"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CityTypeahead from "@/components/CityTypeahead";
import Loader from "@/components/Loader";
import {
  listPublicFeedStories,
  type PublicFeedStory,
} from "@/lib/publicApiClient";
import { slugify } from "@/lib/utils";
import styles from "./BriefingHome.module.css";

const STORIES_LIMIT = 8;

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function storyExcerpt(story: PublicFeedStory): string {
  const raw = story.summary || story.description || "";
  return raw.replace(/\s+/g, " ").trim();
}

/** Public story URL (mirrors resolveCanonicalUrl's short-hash path). */
function publicStoryUrl(story: PublicFeedStory): string {
  const slug = story.city_name ? slugify(story.city_name) : null;
  if (story.short_hash) {
    return slug ? `/c/${slug}/stories/${story.short_hash}` : `/s/${story.short_hash}`;
  }
  return slug ? `/c/${slug}` : "/";
}

function PublicStoryRow({ story }: { story: PublicFeedStory }) {
  const [imgFailed, setImgFailed] = useState(false);
  const excerpt = storyExcerpt(story);
  const imageUrl = story.image_url || null;
  const showImage = !!imageUrl && !imgFailed;
  return (
    <li>
      <Link href={publicStoryUrl(story)} className={styles.storyRow} prefetch={false}>
        <span className={styles.storyActor}>
          <span className={styles.storyActorAvatar} aria-hidden="true">
            <span className={styles.storyActorEmoji}>{story.city_emoji || "🏛️"}</span>
          </span>
          <span className={styles.storyActorName}>
            {story.city_name?.trim() || "Citywide"}
          </span>
        </span>
        <span className={styles.storyTitleRow}>
          <span className={styles.storyHeadline}>{story.headline}</span>
          <span className={styles.storyDate}>
            {formatShortDate(story.published_at ?? story.story_date)}
          </span>
        </span>
        {excerpt && <span className={styles.storyExcerpt}>{excerpt}</span>}
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element -- feed images are proxied, sizes vary
          <img
            className={styles.storyImage}
            src={imageUrl}
            alt={story.image_alt || ""}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        )}
      </Link>
    </li>
  );
}

/**
 * Landing for users without a resolved city scope (the feed view was removed
 * for non-admins). Inline city search plus recent stories from across the
 * service, in the same compact row style as the city overview.
 */
export default function FeedCityPicker({
  onCitySelect,
}: {
  onCitySelect: (cityId: number) => void;
}) {
  const [stories, setStories] = useState<PublicFeedStory[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listPublicFeedStories({ limit: STORIES_LIMIT, order_by: "published_at" })
      .then((res) => {
        if (!cancelled) setStories(res.stories || []);
      })
      .catch(() => {
        if (!cancelled) setStories([]);
      })
      .finally(() => {
        if (!cancelled) setStoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px 64px" }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 6px",
          }}
        >
          Pick your city to get started
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          Search by city, ZIP code, or address to open its briefing.
        </p>
      </div>

      <div style={{ marginBottom: 40 }}>
        <CityTypeahead
          onCitySelect={onCitySelect}
          placeholder="Search city, ZIP code, or address…"
          onGPSLocation={() => {
            /* enables the "Use my location" option in the dropdown */
          }}
        />
      </div>

      <div>
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
            margin: "0 0 10px",
          }}
        >
          Recent stories from around transparent.city
        </p>
        {storiesLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
            <Loader size="md" color="purple" />
          </div>
        ) : stories.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            No recent stories available right now.
          </p>
        ) : (
          <ul className={styles.storyList}>
            {stories.map((story) => (
              <PublicStoryRow key={story.id} story={story} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
