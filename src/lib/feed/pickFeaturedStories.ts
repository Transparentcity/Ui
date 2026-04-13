/**
 * Picks 10 diverse, interesting stories for the landing page.
 *
 * Only uses stories from the last 2 days. First fills slots with stories
 * that meet diversity guidelines (required types + variety across cities
 * and card types), then fills remaining slots with the most recent stories
 * regardless of diversity.
 */

import type { EnrichedFeedStory, CardType } from "./mockFeedData";

const TARGET_COUNT = 10;

/** Card types we require at least one of (in priority order). */
const REQUIRED_TYPES: CardType[] = ["context", "off_the_charts", "traction"];

/** Minimum headline length to consider a story "interesting". */
const MIN_HEADLINE_LENGTH = 30;

/** Stories older than this many days are excluded entirely. */
const MAX_AGE_DAYS = 2;

/**
 * Returns true if a story looks presentable on the landing page:
 * decent headline, non-empty description, and published within the last 2 days.
 */
function isPresent(story: EnrichedFeedStory): boolean {
  if ((story.headline ?? "").length < MIN_HEADLINE_LENGTH) return false;
  if (!story.cleaned_description || story.cleaned_description.length < 20) return false;

  // Exclude stories older than MAX_AGE_DAYS (or with no date at all)
  const published = story.published_at ?? story.story_date;
  if (!published) return false;
  const ageMs = Date.now() - new Date(published).getTime();
  if (ageMs > MAX_AGE_DAYS * 86400000) return false;

  return true;
}

/** Returns age in days (0 = today). */
function ageDays(story: EnrichedFeedStory): number {
  const published = story.published_at ?? story.story_date;
  if (!published) return MAX_AGE_DAYS + 1;
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

  // Recency: prefer newer stories (0-2 days maps to +2 to 0 points)
  score += Math.max(0, MAX_AGE_DAYS - ageDays(candidate));

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
 *
 * Uses only stories from the last 2 days. First picks diverse stories
 * (required types + greedy diversity scoring), then fills any remaining
 * slots with the most recent stories regardless of diversity rules.
 */
export function pickFeaturedStories(
  pool: EnrichedFeedStory[],
  count: number = TARGET_COUNT,
): EnrichedFeedStory[] {
  // Filter to presentable stories (includes the 2-day recency check)
  const candidates = pool.filter(isPresent);

  const picked: EnrichedFeedStory[] = [];
  const usedIds = new Set<number>();

  // If we have fewer presentable stories than needed, take them all
  // and fall through to Phase 3 which relaxes quality checks
  if (candidates.length <= count) {
    picked.push(...candidates);
    for (const c of candidates) usedIds.add(c.id);
  }

  // Phase 1: fill required type slots (diversity-aware)
  for (const requiredType of REQUIRED_TYPES) {
    if (picked.length >= count) break;

    const ofType = candidates.filter(
      (c) => c.card_type === requiredType && !usedIds.has(c.id),
    );
    if (ofType.length === 0) continue;

    ofType.sort((a, b) => diversityScore(b, picked) - diversityScore(a, picked));
    const best = ofType[0];
    picked.push(best);
    usedIds.add(best.id);
  }

  // Phase 2: greedily fill with most-diverse candidates
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

  // Phase 3: if we still don't have enough, fill with most recent stories
  // from the full pool (only recency filter, skip presentability checks)
  if (picked.length < count) {
    const recentPool = pool
      .filter((s) => {
        const published = s.published_at ?? s.story_date;
        if (!published) return false;
        const ageMs = Date.now() - new Date(published).getTime();
        return ageMs <= MAX_AGE_DAYS * 86400000;
      })
      .sort((a, b) => {
        const aTime = new Date(a.published_at ?? a.story_date ?? 0).getTime();
        const bTime = new Date(b.published_at ?? b.story_date ?? 0).getTime();
        return bTime - aTime;
      });

    for (const s of recentPool) {
      if (picked.length >= count) break;
      if (usedIds.has(s.id)) continue;
      picked.push(s);
      usedIds.add(s.id);
    }
  }

  return picked;
}
