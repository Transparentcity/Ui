/**
 * Default feed-producer instructions when job_config has no custom prompt/question.
 * Must stay aligned with custom_scheduled_jobs_service.py (feed_producer / feed_stories).
 *
 * This text is not merely cosmetic: ScheduledJobsPanel prefills it for feed jobs
 * with no stored prompt, and saving the form persists it. If it drifts behind the
 * backend, an admin opening a job can silently downgrade its instructions.
 *
 * EXPLANATION_PASS mirrors services/feed_depth_prompt.py — keep both in step.
 */
const DEFAULT_INSTRUCTIONS = `For each city:
1. Use search_city if you need to resolve city names to city_id
2. Check list_feed_stories(city_id=X, limit=20) — avoid duplicating today's stories
3. Use get_anomalies(city_id=X) → significant spikes/drops → 'alert' stories
4. Use get_dashboard_comparisons(city_id=X) → period trends → 'trend'/'multi_metric'
5. Research with tools: set_dataset (SoQL drill-downs) and web_search for incident context and external sources.
6. For each story:
   - Validate metric freshness (validate_metric_freshness or get_metric_status) before emphasizing drops or spikes.
   - show_time_series(chart_id=X) or run_anomaly_detection + show_anomaly(result_id=X) — embed [chart:N] or [anomaly:N] in article_html.
   - generate_map (map_type='delta' for period comparisons, or point/heatmap) then show_map — embed [map:HASH] in article_html.
   - web_search for incident details or agency context; cite every off-platform claim with <a href="URL"> in article_html.
7. Use create_feed_story with:
   - newsletter_frequency='weekly' (REQUIRED — stories without it won't appear in the feed)
   - article_html: 3-5 paragraphs with at least one visual shortcode ([chart:N], [anomaly:N], or [map:HASH]) on its own <p> line
   - visualization_type + visualization_ref_id/visualization_short_hash matching the primary visual
   - detail_url: SECONDARY "read more" link only (external source, /r/hash report). Do NOT set to a /stories/ or /s/ URL.

IMPORTANT — canonical URLs:
- Every story automatically gets its own public page at /c/{city-slug}/stories/{hash}. Do NOT pass a canonical URL as detail_url.
- detail_url is for a SECONDARY "read more" link only (e.g. a research report /r/hash, an external source). Leave it null when there is no meaningful secondary destination.

Aim for 2-4 high-quality stories per city. Specific headlines, real numbers. Only publish text-only if tools return no usable chart/anomaly/map id.`;

/**
 * Mirrors EXPLANATION_PASS in services/feed_depth_prompt.py.
 */
const EXPLANATION_PASS = `EXPLANATION PASS (mandatory for every story candidate, before writing)

A metric total is a lead, not a finding. The city-wide scan ranks candidates; it does not say
why any one metric moved. Re-query scoped to the metric you intend to publish, and take every
rung that applies:

  - get_metric_change_breakdown(metric_id=X) — which category drove the change and its share.
    Do this first; most metrics have configured dimensions. Check \`reconciles\` before quoting a
    share, and check \`offsetting_movement\`: large moves in opposite directions inside a small net
    change mean the composition shift is the story, not the total.
  - get_metric_change_shape(metric_id=X) — when the level moved, and whether it was a step, a
    drift, or noise. Available for every metric, so no candidate lacks a depth pass. Do not call
    a change a step when \`shape\` is \`noisy\`, never cite a period listed in
    \`incomplete_periods_excluded\`, and never present a flagged collection artifact as real.
  - get_anomalies(metric_id=X) — grouped anomaly rows for this metric, not the city-wide top N.
  - get_chain_for_metric / get_chain_decomposition — only a small minority of metrics sit in a
    process chain, but when one does this separates "fewer cases arrived" from "the same cases
    were handled differently". Check once and move on if there is no chain.

PUBLISHABLE means the story names what moved beneath the total: a category and its contribution,
a timing shift, a geographic concentration, or a conversion-rate change. A story that only
restates a total is not publishable however large the number.

HONESTY ABOUT LIMITS: never write that the data cannot explain a change until you have run this
pass and a tool reported the limitation. A metric with no configured dimensions is a gap in our
configuration, not a fact about the world — say nothing rather than telling readers the data is
silent.

Tool caveats are instructions to you, not sentences for the story. When a tool flags a limit,
either express it as a concrete fact a reader can use (a date: "through May 25"; a count: "the
last three weeks are still being counted") or drop the claim. Never paraphrase our machinery into
copy, and never hedge in public: "should be treated as preliminary", "not yet confirmed", "sits
near the edge of the data" are all worse than silence. If a finding is not solid enough to state
plainly, write the smaller true thing instead.`;

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
    DEFAULT_INSTRUCTIONS +
    `\n\n${EXPLANATION_PASS}`
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
