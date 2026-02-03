/**
 * Utility functions for the transparentcity-ui application.
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merge Tailwind CSS classes with clsx.
 * Required for shadcn/ui components.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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

/**
 * Check if a template has variations enabled.
 */
export function hasVariations(template: any): boolean {
  return template?.variation_enabled === true || 
         (template?.variations && template.variations.length > 0) ||
         (template?.subject_variations && template.subject_variations.length > 0)
}

/**
 * Get the count of variations for a template.
 */
export function getVariationCount(template: any): number {
  let count = 0
  if (template?.variations) count += template.variations.length
  if (template?.subject_variations) count += template.subject_variations.length
  return count
}
