/**
 * Default robots directive for pages that should appear in web search.
 * Explicit index/follow avoids tools misreading noai/noimageai as noindex.
 */
export const DEFAULT_INDEXABLE_ROBOTS =
  "index, follow, max-image-preview:large, noai, noimageai";
