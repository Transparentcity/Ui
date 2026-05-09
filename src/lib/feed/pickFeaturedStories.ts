/**
 * Picks 10 diverse, interesting stories for the landing page.
 *
 * Only uses stories from the last 36 hours. First fills slots with stories
 * that meet diversity guidelines (required types + variety across cities
 * and card types), then fills remaining slots with the most recent stories
 * regardless of diversity. At most one cold-case story is ever included.
 */

import type { EnrichedFeedStory, CardType } from "./mockFeedData";

const TARGET_COUNT = 10;

/** Card types we require at least one of (in priority order). */
const REQUIRED_TYPES: CardType[] = ["context", "off_the_charts", "traction"];

/** Minimum headline length to consider a story "interesting". */
const MIN_HEADLINE_LENGTH = 30;

/** Stories older than this many hours are excluded entirely. */
const MAX_AGE_HOURS = 36;

const HOUR_MS = 3600000;

/**
 * Cold-case stories are tagged in the backend agent via metadata.cold_case.
 * Falls back to a headline prefix check because not every cold-case story
 * gets the metadata flag set today.
 */
function isColdCase(story: EnrichedFeedStory): boolean {
  if (story.metadata?.cold_case === true) return true;
  return /^\s*cold case\b/i.test(story.headline ?? "");
}

/** Normalize a headline so we can dedupe re-published rows with identical titles. */
function headlineKey(story: EnrichedFeedStory): string {
  return (story.headline ?? "").trim().toLowerCase();
}

/**
 * Returns true if a story looks presentable on the landing page:
 * decent headline, non-empty description, and published within MAX_AGE_HOURS.
 */
function isPresent(story: EnrichedFeedStory): boolean {
  if ((story.headline ?? "").length < MIN_HEADLINE_LENGTH) return false;
  if (!story.cleaned_description || story.cleaned_description.length < 20) return false;

  const published = story.published_at ?? story.story_date;
  if (!published) return false;
  const ageMs = Date.now() - new Date(published).getTime();
  if (ageMs > MAX_AGE_HOURS * HOUR_MS) return false;

  return true;
}

/** Returns age in hours (0 = just now). */
function ageHours(story: EnrichedFeedStory): number {
  const published = story.published_at ?? story.story_date;
  if (!published) return MAX_AGE_HOURS + 1;
  return Math.max(0, (Date.now() - new Date(published).getTime()) / HOUR_MS);
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

  // Recency: strongly prefer newer stories. Inside the 36-hour window this
  // contributes up to ~9 points (newest) and decays linearly to 0 at the cutoff.
  score += Math.max(0, (MAX_AGE_HOURS - ageHours(candidate)) / 4);

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
 * From a pool of enriched stories, pick up to `count` with guaranteed variety.
 *
 * Uses only stories from the last 36 hours, with strong recency preference.
 * Phases: fill required types, fill greedily by diversity, then top up with
 * the most recent stories. At most one cold-case story is ever included.
 */
export function pickFeaturedStories(
  pool: EnrichedFeedStory[],
  count: number = TARGET_COUNT,
): EnrichedFeedStory[] {
  const candidates = pool.filter(isPresent);

  const picked: EnrichedFeedStory[] = [];
  const usedIds = new Set<number>();
  const usedHeadlines = new Set<string>();
  const hasColdCase = () => picked.some(isColdCase);
  const isDuplicate = (s: EnrichedFeedStory) => usedHeadlines.has(headlineKey(s));
  const take = (s: EnrichedFeedStory) => {
    picked.push(s);
    usedIds.add(s.id);
    usedHeadlines.add(headlineKey(s));
  };

  // If we have fewer presentable stories than needed, take them all
  // (respecting the cold-case cap and headline dedupe) and fall through to Phase 3.
  if (candidates.length <= count) {
    for (const c of candidates) {
      if (isColdCase(c) && hasColdCase()) continue;
      if (isDuplicate(c)) continue;
      take(c);
    }
  }

  // Phase 1: fill required type slots (diversity-aware)
  for (const requiredType of REQUIRED_TYPES) {
    if (picked.length >= count) break;

    const ofType = candidates.filter(
      (c) =>
        c.card_type === requiredType &&
        !usedIds.has(c.id) &&
        !isDuplicate(c) &&
        !(isColdCase(c) && hasColdCase()),
    );
    if (ofType.length === 0) continue;

    ofType.sort((a, b) => diversityScore(b, picked) - diversityScore(a, picked));
    take(ofType[0]);
  }

  // Phase 2: greedily fill with most-diverse candidates
  while (picked.length < count) {
    let bestScore = -Infinity;
    let bestCandidate: EnrichedFeedStory | null = null;

    for (const c of candidates) {
      if (usedIds.has(c.id)) continue;
      if (isDuplicate(c)) continue;
      if (isColdCase(c) && hasColdCase()) continue;
      const score = diversityScore(c, picked);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = c;
      }
    }

    if (!bestCandidate) break;
    take(bestCandidate);
  }

  // Phase 3: if we still don't have enough, fill with most recent stories
  // from the full pool (only recency filter, skip presentability checks)
  if (picked.length < count) {
    const recentPool = pool
      .filter((s) => {
        const published = s.published_at ?? s.story_date;
        if (!published) return false;
        const ageMs = Date.now() - new Date(published).getTime();
        return ageMs <= MAX_AGE_HOURS * HOUR_MS;
      })
      .sort((a, b) => {
        const aTime = new Date(a.published_at ?? a.story_date ?? 0).getTime();
        const bTime = new Date(b.published_at ?? b.story_date ?? 0).getTime();
        return bTime - aTime;
      });

    for (const s of recentPool) {
      if (picked.length >= count) break;
      if (usedIds.has(s.id)) continue;
      if (isDuplicate(s)) continue;
      if (isColdCase(s) && hasColdCase()) continue;
      take(s);
    }
  }

  return picked;
}
