"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { revalidatePublicStory } from "@/app/actions/revalidateStory";
import { getMyPermissions, opsDeleteStory, opsSetStoryVisibility } from "@/lib/apiClient";
import { useImpersonationCacheKey } from "@/lib/impersonation";
import { isCanonicalStoryPath, visibilitySuccessMessage } from "@/lib/stories/staffModeration";

type StoryStaffControlsProps = {
  storyId: number;
  cityId: number;
  /** Canonical path, e.g. /c/oakland/stories/abc12345 */
  path: string;
  cityHref: string;
  headline: string;
};

/**
 * Hide / show and delete controls on a public story page.
 * Renders only for an admin or a city lead of this story's city.
 * The page itself is already public; hiding takes it off the public site.
 */
export default function StoryStaffControls({
  storyId,
  cityId,
  path,
  cityHref,
  headline,
}: StoryStaffControlsProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0();
  const identityKey = useImpersonationCacheKey();
  const [listed, setListed] = useState(true);
  const [busy, setBusy] = useState<"visibility" | "delete" | null>(null);

  const permissionsQuery = useQuery({
    queryKey: ["admin", "me", "permissions", identityKey],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return getMyPermissions(token);
    },
    enabled: !isLoading && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const permissions = permissionsQuery.data;
  const isAdmin = Boolean(permissions?.is_admin);
  const canManage =
    isAdmin || (permissions?.city_lead_city_ids ?? []).includes(cityId);

  if (!canManage) return null;

  const refreshPublicPage = () => {
    if (isCanonicalStoryPath(path)) void revalidatePublicStory(path);
  };

  const hideOrShow = async () => {
    const next = listed ? "hidden" : "active";
    setBusy("visibility");
    try {
      const token = await getAccessTokenSilently();
      await opsSetStoryVisibility(cityId, storyId, next, token);
      refreshPublicPage();
      setListed(next === "active");
      toast.success(visibilitySuccessMessage(next));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update visibility");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const label = headline.trim() || "this story";
    if (
      !window.confirm(
        `Delete "${label}"? This removes it from the public site and cannot be undone.`
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const token = await getAccessTokenSilently();
      await opsDeleteStory(cityId, storyId, token);
      refreshPublicPage();
      toast.success("Story deleted.");
      router.push(cityHref);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete story");
      setBusy(null);
    }
  };

  return (
    <div className="story-staff-controls">
      <button
        type="button"
        className="story-staff-btn"
        disabled={busy != null}
        onClick={() => void hideOrShow()}
      >
        {busy === "visibility" ? "Saving…" : listed ? "Hide from public" : "Make public"}
      </button>
      {isAdmin && (
        <button
          type="button"
          className="story-staff-btn story-staff-btn-danger"
          disabled={busy != null}
          onClick={() => void remove()}
        >
          {busy === "delete" ? "Deleting…" : "Delete story"}
        </button>
      )}
      {!listed && (
        <span className="story-staff-note">Readers can no longer open this page.</span>
      )}
    </div>
  );
}
