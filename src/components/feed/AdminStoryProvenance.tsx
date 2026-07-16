"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";
import JobSessionDebugLink from "@/components/JobSessionDebugLink";
import { getMyPermissions, type UserPermissions } from "@/lib/apiClient";

type PromptSource = {
  type?: string | null;
  version?: number | null;
};

type AdminStoryProvenanceProps = {
  /** Story metadata JSONB (feed_stories.metadata). */
  metadata?: Record<string, unknown> | null;
  /** Seymour session and model that generated the story. */
  sessionId?: string | null;
  modelKey?: string | null;
  className?: string;
};

/**
 * Admin-only provenance line for generated feed stories: which prompt
 * template version produced the story (metadata.prompt_source, stamped by
 * create_feed_story on scheduled runs) and which scheduled job ran it.
 * Renders nothing for non-admins or stories without provenance metadata.
 */
export default function AdminStoryProvenance({
  metadata,
  sessionId,
  modelKey,
  className,
}: AdminStoryProvenanceProps) {
  const { isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0();

  const permissionsQuery = useQuery<UserPermissions>({
    // Same key as AdminGuard so concurrent checks share one cached request.
    queryKey: ["admin", "me", "permissions"],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return getMyPermissions(token);
    },
    enabled: !isLoading && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const isAdmin = Boolean(permissionsQuery.data?.is_admin);

  const promptSource = (metadata?.prompt_source ?? null) as PromptSource | null;
  const jobName =
    typeof metadata?.scheduled_job_name === "string"
      ? metadata.scheduled_job_name
      : null;
  const cleanModelKey = typeof modelKey === "string" ? modelKey.trim() : "";
  const cleanSessionId = typeof sessionId === "string" ? sessionId.trim() : "";

  if (!isAdmin || (!promptSource && !jobName && !cleanModelKey && !cleanSessionId)) {
    return null;
  }

  const promptLabel = promptSource
    ? `Prompt v${promptSource.version ?? "?"} (${promptSource.type ?? "unknown"})`
    : null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-400 px-2 py-0.5 text-xs text-gray-500 dark:border-slate-500 dark:text-slate-400 ${className ?? ""}`}
      title="Visible to admins only: provenance for the generated story"
    >
      <span aria-hidden>🛠️</span>
      {promptLabel && <span>{promptLabel}</span>}
      {promptLabel && (jobName || cleanModelKey || cleanSessionId) && (
        <span aria-hidden>·</span>
      )}
      {jobName && <span>{jobName}</span>}
      {jobName && (cleanModelKey || cleanSessionId) && <span aria-hidden>·</span>}
      {cleanModelKey && <span>Model: {cleanModelKey}</span>}
      {cleanModelKey && cleanSessionId && <span aria-hidden>·</span>}
      {cleanSessionId && (
        <JobSessionDebugLink
          sessionId={cleanSessionId}
          label="View session"
          className="cursor-pointer border-0 bg-transparent p-0 text-inherit underline underline-offset-2"
        />
      )}
    </div>
  );
}
