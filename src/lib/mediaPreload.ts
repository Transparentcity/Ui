/**
 * Shared image-URL health cache for map media galleries.
 *
 * Many 311 media URLs are expired or broken even though they look valid.
 * This module remembers which URLs actually loaded ("ok") or failed
 * ("failed") for the lifetime of the page, so galleries can:
 *  - hide items whose image is known to be broken,
 *  - preload nearby images so next/previous always lands on a viewable photo,
 *  - avoid re-checking the same URL twice.
 */

export type MediaUrlStatus = "unknown" | "loading" | "ok" | "failed";

const statusByUrl = new Map<string, MediaUrlStatus>();
const listeners = new Set<() => void>();
let version = 0;

function setStatus(url: string, status: MediaUrlStatus): void {
  if (statusByUrl.get(url) === status) return;
  statusByUrl.set(url, status);
  version++;
  listeners.forEach((listener) => listener());
}

export function getMediaUrlStatus(url: string): MediaUrlStatus {
  return statusByUrl.get(url) ?? "unknown";
}

export function markMediaUrlOk(url: string): void {
  setStatus(url, "ok");
}

export function markMediaUrlFailed(url: string): void {
  setStatus(url, "failed");
}

/** Subscribe to any status change. Returns an unsubscribe function. */
export function subscribeMediaUrlStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic counter, bumped on every status change (for useSyncExternalStore). */
export function getMediaStatusVersion(): number {
  return version;
}

/** Start loading a URL in the background (no-op if already checked/loading). */
export function preloadMediaUrl(url: string): void {
  if (typeof window === "undefined" || typeof window.Image === "undefined") return;
  if (getMediaUrlStatus(url) !== "unknown") return;
  setStatus(url, "loading");
  const img = new window.Image();
  img.onload = () => setStatus(url, "ok");
  img.onerror = () => setStatus(url, "failed");
  img.src = url;
}

/**
 * Preload the URLs in a window around `index` so stepping through the gallery
 * never lands on an image we could have known was broken.
 */
export function preloadMediaWindow(
  items: Array<{ url: string }>,
  index: number,
  radius = 10
): void {
  const start = Math.max(0, index - radius);
  const end = Math.min(items.length - 1, index + radius);
  for (let i = start; i <= end; i++) {
    preloadMediaUrl(items[i].url);
  }
}

/** Drop items whose image URL is already known to be broken. */
export function filterKnownFailedMedia<T extends { url: string }>(items: T[]): T[] {
  return items.filter((item) => getMediaUrlStatus(item.url) !== "failed");
}

/**
 * Prepare a gallery opening: drop known-broken items, resolve the start index
 * from the clicked photo's URL, and kick off preloading around it.
 */
export function prepareGalleryOpen<T extends { url: string }>(
  items: T[],
  clickedUrl: string | null
): { items: T[]; startIndex: number } {
  const viewable = filterKnownFailedMedia(items);
  const startIndex = clickedUrl
    ? Math.max(0, viewable.findIndex((item) => item.url === clickedUrl))
    : 0;
  preloadMediaWindow(viewable, startIndex);
  return { items: viewable, startIndex };
}

/** Test-only: clear the cache between tests. */
export function __resetMediaUrlStatusForTests(): void {
  statusByUrl.clear();
  version++;
  listeners.forEach((listener) => listener());
}
