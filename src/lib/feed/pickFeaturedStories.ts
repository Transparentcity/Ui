/**
 * Picks 10 diverse, interesting stories for the landing page.
 *
 * Guarantees at least 1 context, 1 off_the_charts, and 1 traction story
 * (when available), then fills remaining slots with maximum variety across
 * cities and card types.
 */

import type { EnrichedFeedStory, CardType } from "./mockFeedData";

const TARGET_COUNT = 10;

/** Card types we require at least one of (in priority order). */
const REQUIRED_TYPES: CardType[] = ["context", "off_the_charts", "traction"];

/** Minimum headline length to consider a story "interesting". */
const MIN_HEADLINE_LENGTH = 30;

/** Stories older than this many days are excluded entirely. */
const MAX_AGE_DAYS = 7;

/**
 * Returns true if a story looks presentable on the landing page:
 * decent headline, non-empty description, and published within the last week.
 */
function isPresent(story: EnrichedFeedStory): boolean {
  if ((story.headline ?? "").length < MIN_HEADLINE_LENGTH) return false;
  if (!story.cleaned_description || story.cleaned_description.length < 20) return false;

  // Exclude stories older than MAX_AGE_DAYS
  const published = story.published_at ?? story.story_date;
  if (published) {
    const ageMs = Date.now() - new Date(published).getTime();
    if (ageMs > MAX_AGE_DAYS * 86400000) return false;
  }

  return true;
}

/** Returns age in days (0 = today). */
function ageDays(story: EnrichedFeedStory): number {
  const published = story.published_at ?? story.story_date;
  if (!published) return 7;
  return Math.max(0, (Date.now() - new Date(published).getTime()) / 86400000);
}

/**
 * Score how much diversity a candidate adds to the current selection.
 * Higher is better.
 */
function diversityScore(
  candidate: EnrichedFeedStory,
  picked: EnrichedFeedStory[],
): number {
  let score = 0;

  // Recency: prefer newer stories (0-7 days maps to +7 to 0 points)
  score += Math.max(0, 7 - ageDays(candidate));

  // City diversity: strongly penalize repeats so we spread across launched cities
  const sameCityCount = picked.filter((p) => p.city_id === candidate.city_id).length;
  score -= sameCityCount * 20;

  // Card type diversity: penalize if we already have this card type
  const sameTypeCount = picked.filter((p) => p.card_type === candidate.card_type).length;
  score -= sameTypeCount * 8;

  // Prefer longer, more descriptive headlines
  score += Math.min((candidate.headline ?? "").length / 20, 3);

  // Prefer stories with descriptions
  score += Math.min((candidate.cleaned_description ?? "").length / 50, 2);

  return score;
}

/**
 * From a pool of enriched stories, pick up to 10 with guaranteed variety.
 */
export function pickFeaturedStories(
  pool: EnrichedFeedStory[],
  count: number = TARGET_COUNT,
): EnrichedFeedStory[] {
  // Filter to presentable stories only
  const candidates = pool.filter(isPresent);
  if (candidates.length <= count) return candidates;

  const picked: EnrichedFeedStory[] = [];
  const usedIds = new Set<number>();

  // Phase 1: fill required type slots
  for (const requiredType of REQUIRED_TYPES) {
    if (picked.length >= count) break;

    // Find best candidate of this type (most diverse relative to what's picked)
    const ofType = candidates.filter(
      (c) => c.card_type === requiredType && !usedIds.has(c.id),
    );
    if (ofType.length === 0) continue;

    // Pick the one that adds most diversity (or first if nothing picked yet)
    ofType.sort((a, b) => diversityScore(b, picked) - diversityScore(a, picked));
    const best = ofType[0];
    picked.push(best);
    usedIds.add(best.id);
  }

  // Phase 2: greedily fill remaining slots with most-diverse candidates
  while (picked.length < count) {
    let bestScore = -Infinity;
    let bestCandidate: EnrichedFeedStory | null = null;

    for (const c of candidates) {
      if (usedIds.has(c.id)) continue;
      const score = diversityScore(c, picked);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = c;
      }
    }

    if (!bestCandidate) break;
    picked.push(bestCandidate);
    usedIds.add(bestCandidate.id);
  }

  return picked;
}
