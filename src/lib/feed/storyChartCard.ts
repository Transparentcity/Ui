/**
 * Chart data for a story's social card, cut to the window the story is about.
 *
 * The backend's story image plots a chart's full history (often ten years),
 * which buries a "this year vs last year" story in noise when it lands on X
 * or Slack. This module picks the window from the story itself and the
 * card-image route draws it:
 *
 * - Year-to-date stories (period `ytd`, or a `metadata.window` starting
 *   Jan 1 with a `comparison_window`) on a count metric: cumulative daily
 *   totals, this year against last year, through the story's end date. The
 *   totals match the story's own numbers.
 * - Everything else: the recent stretch of the chart's period (25 months,
 *   53 weeks, 91 days, 10 years), with the same period a year earlier
 *   marked for comparison.
 *
 * Only social cards use this. The story page keeps the full-history chart.
 * Any doubt (no chart, grouped series, missing sibling, too little data)
 * returns null and the route falls back to the backend image.
 */

import type {
  PublicFeedStory,
  PublicTimeSeriesChartPoint,
  PublicTimeSeriesChartResponse,
} from "@/lib/publicApiClient";

export type CardPeriod = "day" | "week" | "month" | "year";

export type StoryChartTarget = {
  chartId: number;
  /** Story's chart period: day/week/month/year/ytd. */
  period: string;
  /** Last date the story covers (YYYY-MM-DD), or null when unknown. */
  end: string | null;
  /** True when the story compares year-to-date against the prior year. */
  ytd: boolean;
};

export type YtdChartCard = {
  kind: "ytd";
  year: number;
  priorYear: number;
  /** Last day included (YYYY-MM-DD) in the current year. */
  endDate: string;
  /** Running totals from Jan 1, one per day. */
  current: number[];
  prior: number[];
  currentTotal: number;
  priorTotal: number;
};

export type TrendChartCard = {
  kind: "trend";
  period: CardPeriod;
  points: { date: string; value: number }[];
  /** Index of the same period a year before the last point, when present. */
  compareIndex: number | null;
};

export type StoryChartCard = YtdChartCard | TrendChartCard;

export type LoadedStoryChartCard = {
  card: StoryChartCard;
  /** Metric name without emoji, for the card title. */
  metricName: string;
};

type StoryChartSource = Pick<
  PublicFeedStory,
  "article_html" | "primary_visualization" | "visualization_type" | "metadata" | "story_date"
>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WINDOW_RE = /^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/;
const SHORTCODE_RE = /\[chart:(\d+)(?::([a-z]+))?\]/i;

/** How many points of each period the trend card shows. */
const TREND_POINTS: Record<CardPeriod, number> = { month: 25, week: 53, day: 91, year: 10 };
/** Points between the last one and the same period a year earlier. */
const YEAR_BACK: Record<CardPeriod, number | null> = { month: 12, week: 52, day: null, year: 1 };

/** Averages, rates and shares can't be summed into a running total. */
const NON_ADDITIVE_RE = /\b(avg|average|median|mean|rate|ratio|percent|per|share|days to|time to)\b|%/i;

/** A YTD card this early in January says little; use the trend instead. */
const MIN_YTD_DAYS = 14;

function parseWindow(value: unknown): { start: string; end: string } | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(WINDOW_RE);
  return m ? { start: m[1], end: m[2] } : null;
}

/**
 * Which chart the story's card should draw and over what window. Chart
 * stories only; the article's [chart:N:period] shortcode wins over
 * primary_visualization, as on the story page.
 */
export function storyChartTarget(story: StoryChartSource): StoryChartTarget | null {
  const pv = story.primary_visualization ?? null;
  const type = String(story.visualization_type || pv?.type || "").toLowerCase();
  if (type !== "chart") return null;

  const shortcode = story.article_html?.match(SHORTCODE_RE) ?? null;
  const pvId = typeof pv?.id === "number" ? pv.id : Number(pv?.id);
  const chartId = shortcode ? parseInt(shortcode[1], 10) : pvId;
  if (!Number.isFinite(chartId) || chartId <= 0) return null;

  const pvPeriod = typeof pv?.period === "string" ? pv.period : "";
  const period = (shortcode?.[2] || pvPeriod || "ytd").toLowerCase();

  const meta = story.metadata ?? {};
  const window = parseWindow(meta.window);
  const ytdWindow = !!window && window.start.endsWith("-01-01") && parseWindow(meta.comparison_window) !== null;

  const storyDate = (story.story_date ?? "").slice(0, 10);
  const end = window?.end ?? (DATE_RE.test(storyDate) ? storyDate : null);

  return { chartId, period, end, ytd: period === "ytd" || ytdWindow };
}

/** Strip emoji and variation selectors from a metric name. */
export function cardMetricName(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Counts can be summed into a year-to-date total; averages and rates can't. */
export function isAdditiveSeries(name: string, points: PublicTimeSeriesChartPoint[]): boolean {
  if (NON_ADDITIVE_RE.test(name)) return false;
  return points.every((p) => Number.isInteger(p.numeric_value));
}

/** One series per chart: grouped charts would mix lines, so skip them. */
function isSingleSeries(points: PublicTimeSeriesChartPoint[]): boolean {
  const groups = new Set(points.map((p) => p.group_value ?? null));
  return groups.size <= 1;
}

function utcDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Running totals from Jan 1 of `year` through month/day of `endMonthDay`. */
function runningTotals(byDay: Map<string, number>, year: number, endMonthDay: string): number[] {
  let md = endMonthDay;
  // Feb 29 has no match in a non-leap year.
  if (md === "02-29" && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1) md = "02-28";
  const end = utcDate(`${year}-${md}`);
  const out: number[] = [];
  let total = 0;
  for (let d = utcDate(`${year}-01-01`); d <= end; d = addDays(d, 1)) {
    total += byDay.get(isoDay(d)) ?? 0;
    out.push(total);
  }
  return out;
}

/**
 * Cumulative this-year vs last-year card from a daily series. Days with no
 * row count as zero (the daily series is sparse). Null when the series
 * doesn't reach back to last Jan 1 or the year is too young.
 */
export function buildYtdCard(
  daily: PublicTimeSeriesChartPoint[],
  end: string | null,
): YtdChartCard | null {
  const sorted = daily
    .filter((p) => DATE_RE.test(p.time_period.slice(0, 10)) && Number.isFinite(p.numeric_value))
    .map((p) => ({ date: p.time_period.slice(0, 10), value: p.numeric_value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;

  const lastDate = sorted[sorted.length - 1].date;
  const endDate = end && end < lastDate ? end : lastDate;
  const year = Number(endDate.slice(0, 4));
  const priorYear = year - 1;
  if (sorted[0].date > `${priorYear}-01-01`) return null;

  const byDay = new Map<string, number>();
  for (const p of sorted) {
    if (p.date > endDate) break;
    byDay.set(p.date, (byDay.get(p.date) ?? 0) + p.value);
  }

  const monthDay = endDate.slice(5);
  const current = runningTotals(byDay, year, monthDay);
  if (current.length < MIN_YTD_DAYS) return null;
  const prior = runningTotals(byDay, priorYear, monthDay);

  return {
    kind: "ytd",
    year,
    priorYear,
    endDate,
    current,
    prior,
    currentTotal: current[current.length - 1],
    priorTotal: prior[prior.length - 1],
  };
}

/** Last day a period starting on `start` covers. */
function periodEnd(start: string, period: CardPeriod): string {
  const d = utcDate(start);
  if (period === "day") return start;
  if (period === "week") return isoDay(addDays(d, 6));
  if (period === "month") return isoDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  return `${d.getUTCFullYear()}-12-31`;
}

/**
 * Recent stretch of a periodic series, ending at the story's date. A period
 * the story date cuts short is dropped, so a half-finished month doesn't
 * read as a collapse.
 */
export function buildTrendCard(
  series: PublicTimeSeriesChartPoint[],
  period: CardPeriod,
  end: string | null,
): TrendChartCard | null {
  let points = series
    .filter((p) => DATE_RE.test(p.time_period.slice(0, 10)) && Number.isFinite(p.numeric_value))
    .map((p) => ({ date: p.time_period.slice(0, 10), value: p.numeric_value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (end) {
    points = points.filter((p) => p.date <= end);
    const last = points[points.length - 1];
    if (last && periodEnd(last.date, period) > end) points = points.slice(0, -1);
  }
  points = points.slice(-TREND_POINTS[period]);
  if (points.length < 3) return null;

  const back = YEAR_BACK[period];
  const compareIndex = back !== null && points.length - 1 - back >= 0 ? points.length - 1 - back : null;
  return { kind: "trend", period, points, compareIndex };
}

function asCardPeriod(value: string | null | undefined): CardPeriod | null {
  return value === "day" || value === "week" || value === "month" || value === "year" ? value : null;
}

/**
 * Fetch the series the story's card needs and cut it to the story's window.
 * `fetchChart` loads /api/time-series/public/{id}; siblings supply the daily
 * series for YTD cards and the monthly one for YTD stories on averages.
 */
export async function loadStoryChartCard(
  target: StoryChartTarget,
  fetchChart: (chartId: number) => Promise<PublicTimeSeriesChartResponse>,
): Promise<LoadedStoryChartCard | null> {
  const base = await fetchChart(target.chartId);
  const basePeriod = asCardPeriod(base.metadata?.period_type);
  const siblings = base.sibling_chart_ids ?? {};
  const metricName = cardMetricName(base.metadata?.object_name ?? base.metadata?.chart_title);

  const seriesFor = async (period: CardPeriod): Promise<PublicTimeSeriesChartPoint[] | null> => {
    if (basePeriod === period) return base.data;
    const id = siblings[period];
    if (!id) return null;
    return (await fetchChart(id)).data;
  };

  if (target.ytd) {
    const daily = await seriesFor("day");
    if (daily && isSingleSeries(daily) && isAdditiveSeries(metricName, daily)) {
      const card = buildYtdCard(daily, target.end);
      if (card) return { card, metricName };
    }
  }

  // YTD stories that can't be summed (or lack daily data) show two years of months.
  const period = asCardPeriod(target.period) ?? "month";
  const series = await seriesFor(period);
  if (!series || !isSingleSeries(series)) return null;
  const card = buildTrendCard(series, period, target.end);
  return card ? { card, metricName } : null;
}
