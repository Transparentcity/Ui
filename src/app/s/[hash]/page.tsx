"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPublicFeedStoryByHash } from "@/lib/api/feed";

/**
 * /s/[hash] — public short-URL for feed stories.
 *
 * Looks up the story by its short_hash via the public API,
 * then redirects to /feed/{id} for the full detail view.
 */
export default function StoryShortUrlPage() {
  const params = useParams();
  const router = useRouter();
  const hash = params.hash as string;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hash) return;

    getPublicFeedStoryByHash(hash)
      .then((res) => {
        router.replace(`/feed/${res.story.id}`);
      })
      .catch(() => {
        setError("Story not found or no longer available.");
      });
  }, [hash, router]);

  if (error) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Story Not Found</h1>
        <p style={{ color: "var(--text-secondary)" }}>{error}</p>
        <a href="/" style={{ color: "var(--brand-primary, #ad35fa)", marginTop: 16, display: "inline-block" }}>
          Go to homepage
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: "48px 24px", textAlign: "center" }}>
      <p style={{ color: "var(--text-secondary)" }}>Loading story...</p>
    </div>
  );
}
