/**
 * `?view=` deep links into the single-page app at /home.
 *
 * The admin field guide (/admin/guide) links to admin panels this way, since
 * those panels are view state rather than routes. Keeping the logic here means
 * it can be tested without booting the whole page.
 */

/** Views reachable via `?view=`. "inbox" is the shared rail's own destination. */
export const DEEP_LINKABLE_VIEWS = new Set<string>([
  "feed",
  "inbox",
  "chat",
  "city-data",
  "metrics-admin",
  "datasets-admin",
  "feed-admin",
  "feed-stories-admin",
  "newsletter-admin",
  "job-logs",
  "user-management",
  "system-stats",
]);

/** Of those, the ones that render nothing without the admin role. */
export const ADMIN_ONLY_VIEWS = new Set<string>([
  "city-data",
  "metrics-admin",
  "datasets-admin",
  "newsletter-admin",
  "job-logs",
  "user-management",
  "system-stats",
]);

/** True when `?view=<param>` names a view the app will honor. */
export function isDeepLinkableView(param: string | null | undefined): boolean {
  return !!param && DEEP_LINKABLE_VIEWS.has(param);
}

/** Admin views that city leads and analysts may also open (city-scoped there). */
export const OPS_VIEWS = new Set<string>(["system-stats"]);

/** True when the current view must be abandoned because the viewer lacks access. */
export function shouldLeaveAdminView(
  currentView: string,
  isAdmin: boolean,
  isOpsUser = false
): boolean {
  if (isAdmin) return false;
  if (isOpsUser && OPS_VIEWS.has(currentView)) return false;
  return ADMIN_ONLY_VIEWS.has(currentView);
}
