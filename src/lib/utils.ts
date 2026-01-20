/**
 * Utility functions for the transparentcity-ui application.
 */

/**
 * Convert a string to a URL-friendly slug.
 */
export function slugify(text: string): string {
  const slug = text.trim().toLowerCase();
  return slug
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
