/**
 * Staff controls for whether a feed story is on the public site.
 *
 * `active`, `published`, and a missing status are what the public feed and
 * public story page serve. Anything else (hidden, draft, archived) is off
 * the public site.
 */

export function storyIsPubliclyListed(
  status: string | null | undefined
): boolean {
  const value = (status ?? "").trim().toLowerCase();
  return value === "" || value === "active" || value === "published";
}

export function nextPublicVisibility(
  status: string | null | undefined
): "active" | "hidden" {
  return storyIsPubliclyListed(status) ? "hidden" : "active";
}

export function visibilitySuccessMessage(next: "active" | "hidden"): string {
  return next === "hidden"
    ? "Hidden from the public site."
    : "This story is public again.";
}

/** Canonical story pages are the ones Next can revalidate by path. */
export function isCanonicalStoryPath(path: string): boolean {
  return /^\/c\/[^/]+\/stories\/[^/]+$/.test(path);
}
