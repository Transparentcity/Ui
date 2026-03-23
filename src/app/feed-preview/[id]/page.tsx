"use client";

/**
 * feed-preview/[id] has been retired. Redirect to /feed/[id].
 */

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function FeedPreviewDetailRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    const id = params?.id;
    router.replace(id ? `/feed/${id}` : "/");
  }, [router, params]);
  return null;
}
