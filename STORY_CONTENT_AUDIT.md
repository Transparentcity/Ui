# Story Content Audit

A separable, deep QA process focused on what an automated chrome-driver
or curl health-check can never tell you: whether the words and visuals on
each story page actually hold up to a careful read.

This audit runs **outside** the launch-day runbook (`QA_CLAUDE_RUNBOOK.md`).
It produces its own findings file and is meant to run on a regular cadence
(weekly, or after every prompt change to a story producer).

## Rationale

The May 2026 audit found a recurring pattern of failure modes in published
feed stories that the mechanical Charter checks (`scripts/qa/check_*.py`)
do not catch. They require reading the story, looking at the visual, and
asking "does this make sense?"

The failure modes:

1. **Date-range bug**: a chart or map is built from a metric query that
   silently falls back to "all time" when the requested window is missing
   or empty. The story header implies "last 30 days" but the visual shows
   every data point ever. Only acceptable if the story explicitly says so.
2. **Conflicting numbers for the same metric**: two stories cite different
   values for what looks like the same metric and overlapping window with
   no explanation of why they differ (different geo, different cohort,
   different cut). Charter 5.5.3 covers this mechanically but only when
   the metric name matches verbatim.
3. **Missing source attribution**: a chart or map without a "Source: ..."
   label, an axis without a label, a map without a legend.
4. **Map dot density**: a map with 1000+ markers is unreadable. The
   producer should either cluster, sample, or filter.
5. **Unsupported claims**: prose says "this is happening because X" or
   "this trend reflects Y" without an in-body citation.
6. **Duplicate or near-duplicate stories**: same idea published twice with
   minor wording changes. Charter 5.5.3 cross-story consistency catches
   number conflicts; this catches the prose-clone case.
7. **Illogical or impossible claims**: ">100% of total", "1,200%
   increase", "negative incidents".
8. **Imprecise hedging**: "almost 1500", "a bunch of locations". Charter
   5.5.8 covers small-sample percentages; this covers the non-numeric
   hedge.
9. **Data-gap visuals without disclosure**: a time-series chart that dips
   at the right edge because the source dataset has not yet shipped this
   month's records, with no caveat in the body. The story implies a real
   decline. This is the most subtle failure and the most damaging to
   trust.

## Additional failure modes to watch for

These are the LLM-specific patterns that show up in civic-data writing.
Some are caught by the existing Charter rules and the script. Most need
a careful read.

10. **Hallucinated specifics.** Named people, named officers, named
    meetings, direct quotes, or named studies that don't exist in any
    cited source. The model invents a name because it makes the prose
    feel grounded. Watch for "Officer Martinez said," "according to a
    2023 study," "Mayor Lurie noted last week." If it's not in the
    body's data source, it shouldn't appear.

11. **Causation laundered as correlation.** Charter 5.5.6 forbids
    causal framing without a cited source, but the more insidious
    variant is "this is happening *because* X" or "X *is driving* Y"
    where the prose tone implies the model did an analysis it didn't
    do. Look for "is reshaping," "is pushing," "may be driving,"
    "appears to be a response to."

12. **Percent vs. percentage points.** Unemployment fell from 6% to 4%
    is a 2-point drop, not a 2 percent drop (it's 33%). Story
    headlines that say "fell 2%" when the underlying change is 2
    points are wrong by an order of magnitude. Especially common in
    crime-rate, response-time, and budget-share stories.

13. **Hidden denominator.** "47 incidents at this address" — out of
    what? A neighborhood with 50 buildings or a district with 50,000?
    Numbers without a denominator or comparable peer feel substantive
    but tell the reader nothing.

14. **Reporting-lag artifacts misread as trends.** A dataset that
    drops daily can show a 60% "drop" in the last 7 days that's
    entirely the lag pipeline. The model writes "calls fell sharply"
    when the records simply haven't been ingested. The
    `possible-incomplete-period` review flag covers prose-level
    references; the underlying chart/map is harder. Always confirm
    the right edge of any time series is real data, not an ingestion
    boundary.

15. **Single-event drives the entire trend.** Charter 5.5.7 covers
    single-address dominance. The human variant: one multi-call
    event (a single shooting generates 30 911 calls; one multi-victim
    crash generates 12 collision records) produces what looks like a
    cluster. The story implies a pattern; the data is one event.

16. **Spurious precision.** "3.7% of residents" when the underlying
    sample is 47 records with a ±5 point margin. Decimal places that
    exceed the resolution of the data. Cite ranges, not point values,
    on small samples.

17. **Chart-headline mismatch.** Chart shows monthly counts; headline
    talks about the rate. Chart axis is log; prose treats it linear.
    Map shows incidents; story summarizes complaints. Always read the
    chart label and confirm it matches the prose claim.

18. **Stale entity lookups.** Officials' names, district numbers,
    neighborhood boundaries, and dataset URLs change. The model's
    training data ages. A story that names a former mayor as the
    current one, or cites a deprecated dataset endpoint, is wrong
    even if the underlying numbers are right.

19. **"As expected" / "Not surprisingly" / "Predictably."** These
    phrases imply a prior forecast or expectation that the model did
    not actually establish. Treat as smoke for an unsupported claim.

20. **Pluralization of singletons.** "Incidents have been reported"
    when there was one incident. "Residents are complaining" when one
    person filed one 311 ticket. The model rounds singular events up
    into a plural to make the story feel weighty.

21. **Story-shaped noise.** A 12% week-over-week jump on a metric
    that has ±15% weekly variance is noise. The model writes a story
    about it because the prompt said "find a trend." Without a
    statistical-significance check or a longer baseline, any single
    week's change is suspect on small-volume datasets.

22. **Geography/agency mismatch.** "SFPD reports" when the data is
    actually 311 (resident-filed). "The Health Department says" when
    the data came from an open-data portal scraped from elsewhere.
    The agency named in the prose should match the agency that
    published the data.

23. **Imputed values reported as fact.** When a metric is missing for
    a period and the pipeline fills it with a forecast or
    last-known-value, the chart shows it as a real point. If the
    story doesn't disclose the imputation, the reader thinks they're
    seeing observed data.

## Tooling

The mechanical part runs as
[`scripts/qa/audit_recent_stories.py`](../scripts/qa/audit_recent_stories.py)
in the platform repo (`~/Documents/Coding/TransparentCITY`). It scrapes
the public site (no auth), so it works against staging or production
without setup.

```bash
cd ~/Documents/Coding/TransparentCITY
python scripts/qa/audit_recent_stories.py \
  --site https://transparent.city \
  --per-city 10 \
  --report /tmp/story_audit_report.md
```

Heuristic checks the script runs:

| rule | detects | confidence |
|---|---|---|
| `pii-personalization-in-headline` | "My Block / My Place / Adam's Place" in `<h1>` | high |
| `imprecise-language` | "almost N", "a bunch of locations", "dozens of incidents" | medium |
| `impossible-claim` | ">100% of", "1,200%", "negative N" | high |
| `headline-number-missing` | headline number not derivable from body | medium |
| `no-source-attribution` | substantive body with no source/data hint | medium (false positives on opinion-style "Week Ahead" pieces) |
| `near-duplicate` | identical headline OR identical body[:200] within city | high |
| `no-headline` | no `<h1>` in SSR HTML | high |
| `date-range-disclosure` | headline mentions "this year/this month" but body lacks date range | review |
| `visual-no-source` | story has chart/map marker but body has no source | review |
| `possible-incomplete-period` | references current month with no completeness caveat | review |

Things the script CANNOT do (require human eyes):

- Read a chart and tell whether it shows the right window.
- Count the dots on a rendered Mapbox layer.
- Tell whether two stories about "drug crime" are about the same metric.
- Tell whether a claim is supported by the chart shown, vs. just placed
  near it.
- Decide whether a hedge phrase is actually imprecise or a normal usage.

So the script flags candidates. A human resolves them.

## Cadence

- **Weekly**: run `--per-city 10` across all launched cities. ~90 stories.
  ~3 minutes of script time, ~30 minutes of human review.
- **After any producer prompt change**: run `--per-city 5` against the
  affected story type only. Verify the rate of new violations does not
  exceed baseline.
- **Before any newsletter ships**: run against the city, manually read the
  top-10 stories that will appear in the newsletter.

## Severity rubric

| severity | what it means | example |
|---|---|---|
| **P0** | Privacy leak, factually wrong, story body is empty | "My Block" in public headline; -100% drop on stale data; body is 8 words |
| **P1** | Trust-undermining: claim without evidence, visual without source, near-duplicate published, hedge phrase | "roughly 1500 incidents", chart with no axis |
| **P2** | Minor polish: imprecise wording, missing date-range disclosure, missing data-gap caveat | "in April" without "data through April 19" |
| **P3** | Worth thinking about: no source on a non-data piece (Week Ahead), borderline near-dup | "The Week Ahead" with no citations |

## Workflow

1. Run the script. Get a report at `/tmp/story_audit_report.md`.
2. For each rule with violations, click into 3-5 examples. Decide:
   - Real bug? File a ticket against the producer prompt.
   - False positive? Note the pattern and tighten the regex in the script.
   - One-off? Hide or revise the story.
3. For REVIEW items, sample 5 per rule. Same triage.
4. For map/chart issues: open the story page in a browser, confirm the
   visual issue, screenshot, file.

## Open producer-side problems flagged so far

These are patterns the May 2026 run surfaced that need a producer-prompt
fix (not a script tightening):

- "Citywide This Week — 4 Metrics Moving" template ships across multiple
  cities without the body restating the "4". It also fires the
  near-duplicate check across cities because the boilerplate is identical.
- Multiple stories reference April or May without disclosing whether the
  month is complete in the source dataset.
- Several stories have substantive prose but no source line. The producer
  should append a "Source: data.sfgov.org / 311 service requests" line by
  default.

## Where this fits

- This doc lives in the Ui repo because the QA process is part of the
  publishing surface, not the platform internals.
- The script lives in the platform repo because it shares the QA toolkit
  conventions (CSV schema, exit codes, REVIEW vs VIOLATION) with
  `scripts/qa/check_*.py`.
- The launch-day runbook (`QA_CLAUDE_RUNBOOK.md`) Phase 7.4 references
  this audit but does not embed it. The runbook is for "is the site up
  and not embarrassing?" This audit is for "is the journalism any good?"
