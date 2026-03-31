/**
 * Default feed-producer instructions when job_config has no custom prompt/question.
 * Must stay aligned with custom_scheduled_jobs_service.py (feed_producer / feed_stories).
 */
const DEFAULT_INSTRUCTIONS = `For each city:
1. Use search_city if you need to resolve city names to city_id
2. Check list_feed_stories(city_id=X, limit=20) — avoid duplicating today's stories
3. Use get_anomalies(city_id=X) → significant spikes/drops → 'alert' stories
4. Use get_dashboard_comparisons(city_id=X) → period trends → 'trend'/'multi_metric'
5. IMPORTANT: You must research the stories using your tools especially set_dataset and web search.
6. For each story: show the relevant chart (show_time_series or show_anomaly) and generate a map if the data is geographic
7. Use create_feed_story for each with proper story_type, article_html (3-5 paragraphs of long-form context for the canonical page), and visualization refs

IMPORTANT — canonical URLs:
- Every story automatically gets its own public page at /c/{city-slug}/stories/{hash}. Do NOT pass a canonical URL as detail_url.
- detail_url is for a SECONDARY "read more" link only (e.g. a research report /r/hash, an external source, or a specific chart). Leave it null when there is no meaningful secondary destination.

Aim for 2-4 high-quality stories per city. Specific headlines, real numbers.`;

/**
 * Build the same default prompt the API uses when prompt/question are unset.
 */
export function buildStandardFeedProducerDefaultPrompt(
  cityIds: number[],
  storyTypes: string[],
): string | null {
  if (cityIds.length === 0) {
    return null;
  }
  const city_list = cityIds.join(", ");
  const types_list =
    storyTypes.length > 0 ? storyTypes.join(", ") : "alert, trend, multi_metric";
  return (
    `Generate feed stories for cities: [${city_list}].\n` +
    `Story types to generate: ${types_list}.\n\n` +
    DEFAULT_INSTRUCTIONS
  );
}

export function parseCityIdsFromCsv(csv: string): number[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

export function parseStoryTypesFromCsv(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Read city_ids / city_id from API job_config (same as backend). */
export function cityIdsFromJobConfig(
  cfg: Record<string, unknown>,
): number[] {
  const raw = cfg.city_ids;
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === "number" ? x : Number(x)))
      .filter((n) => !Number.isNaN(n));
  }
  const single = cfg.city_id;
  if (single != null && single !== "") {
    const n = typeof single === "number" ? single : Number(single);
    return Number.isNaN(n) ? [] : [n];
  }
  return [];
}

export function storyTypesFromJobConfig(
  cfg: Record<string, unknown>,
): string[] {
  const raw = cfg.story_types;
  if (Array.isArray(raw)) {
    return raw.filter((s): s is string => typeof s === "string");
  }
  return [];
}
