"use client";

import type { FocusEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publishPlaceFeedStoryForSharing } from "@/lib/apiClient";
import { feedKeys, useTrackFeedEngagement } from "@/lib/hooks/useFeed";
import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { enrichStory } from "@/lib/feed/mockFeedData";
import { runSharePublicUrl } from "@/lib/feed/sharePublicUrl";
import {
  requiresPublishForPublicShare,
  resolveOutboundCanonicalPath,
} from "@/lib/feed/canonicalUrl";
import { slugify } from "@/lib/utils";

type FeedStoryShareDialogProps = {
  story: EnrichedFeedStory;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function previewPublicPathBeforePublish(s: EnrichedFeedStory): string | null {
  if (s.canonical_path) return s.canonical_path;
  if (s.short_hash && s.city_name) {
    return `/c/${slugify(s.city_name)}/stories/${s.short_hash}`;
  }
  if (s.short_hash) return `/s/${s.short_hash}`;
  return null;
}

/**
 * Saved-place share: show the public URL, publish on first "Share link" if needed,
 * then same native share / copy as other posts. List refetch runs when the dialog closes
 * so the card does not disappear while the dialog is open.
 */
export default function FeedStoryShareDialog({
  story,
  open,
  onOpenChange,
}: FeedStoryShareDialogProps) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();
  const trackEngagement = useTrackFeedEngagement();
  const [shareError, setShareError] = useState<string | null>(null);
  const [publishedSnapshot, setPublishedSnapshot] =
    useState<EnrichedFeedStory | null>(null);
  const [showPublicFootnote, setShowPublicFootnote] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPublishedSnapshot(null);
    setShareError(null);
    setShowPublicFootnote(false);
  }, [open, story.id]);

  const effectiveStory = publishedSnapshot ?? story;

  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const origin = window.location.origin;
    if (!requiresPublishForPublicShare(effectiveStory)) {
      return `${origin}${resolveOutboundCanonicalPath(effectiveStory)}`;
    }
    const preview =
      previewPublicPathBeforePublish(effectiveStory) ??
      previewPublicPathBeforePublish(story);
    return preview ? `${origin}${preview}` : "";
  }, [effectiveStory, story]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!isAuthenticated) throw new Error("Sign in to share this story.");
      const token = await getAccessTokenSilently();
      return publishPlaceFeedStoryForSharing(story.id, token);
    },
  });

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        queryClient.invalidateQueries({ queryKey: feedKeys.lists() });
        queryClient.invalidateQueries({ queryKey: feedKeys.places() });
        queryClient.invalidateQueries({ queryKey: feedKeys.detail(story.id) });
      }
      onOpenChange(next);
    },
    [onOpenChange, queryClient, story.id],
  );

  const handleShareLink = useCallback(async () => {
    setShareError(null);
    try {
      let next: EnrichedFeedStory = publishedSnapshot ?? story;
      if (requiresPublishForPublicShare(next)) {
        const res = await publishMutation.mutateAsync();
        next = enrichStory(res.story);
        setPublishedSnapshot(next);
        queryClient.setQueryData(feedKeys.detail(story.id), { story: res.story });
      }
      const path = resolveOutboundCanonicalPath(next);
      if (!path || path.startsWith("/feed/")) {
        throw new Error("Could not build a public link for this story.");
      }
      runSharePublicUrl(next, trackEngagement);
      setShowPublicFootnote(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not share this story.";
      setShareError(msg);
      toast.error(msg);
    }
  }, [
    publishMutation,
    publishedSnapshot,
    queryClient,
    story,
    trackEngagement,
  ]);

  const selectAll = useCallback((e: FocusEvent<HTMLInputElement>) => {
    e.currentTarget.select();
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => e.stopPropagation()}
        aria-describedby={undefined}
      >
        <DialogTitle className="text-base font-semibold leading-snug">
          Public link
        </DialogTitle>
        <div className="space-y-2">
          <Input
            readOnly
            value={displayUrl}
            placeholder="Tap Share link to create your public URL"
            onFocus={selectAll}
            className="font-mono text-xs"
            aria-label="Public story link"
          />
          {showPublicFootnote ? (
            <p className="text-xs text-gray-600 dark:text-slate-400">
              This post is now public. You can make it private again from the
              More (···) menu on this card.
            </p>
          ) : null}
          {shareError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {shareError}
            </p>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            onClick={handleShareLink}
            disabled={publishMutation.isPending || !isAuthenticated}
          >
            {publishMutation.isPending ? "Preparing…" : "Share link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
