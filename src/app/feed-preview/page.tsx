"use client";

/**
 * feed-preview has been retired. Redirect to the main feed.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FeedPreviewRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
