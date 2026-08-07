/**
 * Newsletter shortcode expander (mockup).
 *
 * Layout shortcodes for the Public Record newsletter, matching the
 * current admin-UI shared/personalized prompts. Pure function, no deps.
 *
 * Supported shortcodes:
 *   [eyebrow text="…"]
 *   [card stat="…" sublabel="…" headline="…" body="…" url="…"
 *         direction="up|down|flat" greendirection="up|down"
 *         photo_url="…" photo_caption="…"]
 *   [stat value="…" direction="up|down|flat" greendirection="up|down"]
 *   [scorecard city="…" year_compare="…" dashboard_url="…"]
 *     [metric name="…" key="…" date_range="…" source_url="…"
 *       prior_label="…" prior_value="…" current_label="…" current_value="…"
 *       pct="…" delta="…" direction="up|down|flat" favorable="true|false"]
 *     ...
 *   [/scorecard]
 *   [event weekday="…" day="…" month="…" title="…" meta="…" link_label="…" link_url="…"]
 *
 * Unknown bracketed tokens are left in place (matches the existing
 * Platform visualization shortcode behavior). Unclosed [scorecard] throws.
 *
 * NOTE: attribute parser is a simple `key="value"` matcher with no escaping.
 * Production version needs HTML-entity escaping for &, <, >, ".
 */

const COLOR = {
  accent: "#ad35fa",
  accentBg: "#f5f0ff",
  body: "#111827",
  secondary: "#374151",
  muted: "#6b7280",
  mutedSoft: "#9ca3af",
  hairline: "#e5e7eb",
  panel: "#ffffff",
  goodText: "#16a34a",
  goodBg: "#dcfce7",
  badText: "#dc2626",
  badBg: "#fee2e2",
  flatText: "#6b7280",
  flatBg: "#f3f4f6",
} as const;

const ARIAL = "Arial,sans-serif";

type Attrs = Record<string, string>;

const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;

function parseAttrs(src: string): Attrs {
  const out: Attrs = {};
  for (const m of src.matchAll(ATTR_RE)) {
    out[m[1]] = m[2];
  }
  return out;
}

function attr(a: Attrs, key: string, fallback = ""): string {
  return a[key] ?? fallback;
}

function expandEyebrow(a: Attrs): string {
  const text = attr(a, "text", "");
  return `<p style="font-family:${ARIAL};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:${COLOR.accent};margin:32px 0 12px;">${text}</p>`;
}

function statColor(direction: string, greendirection: string): string {
  if (!direction || direction === "flat" || !greendirection) return COLOR.accent;
  return direction === greendirection ? COLOR.goodText : COLOR.badText;
}

function expandCard(a: Attrs): string {
  const stat = attr(a, "stat", "");
  const sublabel = attr(a, "sublabel", "");
  const headline = attr(a, "headline", "");
  const body = attr(a, "body", "");
  const url = attr(a, "url", "#");
  const direction = attr(a, "direction", "");
  const greendirection = attr(a, "greendirection", "");
  const photoUrl = attr(a, "photo_url", "");
  const photoCaption = attr(a, "photo_caption", "");
  const statSize = stat.length > 9 ? "28px" : "32px";
  const color = statColor(direction, greendirection);
  const photoHtml = photoUrl
    ? `<div style="border-radius:12px 12px 0 0;overflow:hidden;"><img src="${photoUrl}" alt="${photoCaption || "Photo"}" style="width:100%;max-height:180px;object-fit:cover;display:block;"></div>${photoCaption ? `<div style="font-size:11px;color:${COLOR.muted};padding:4px 24px 0;">${photoCaption}</div>` : ""}`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.panel};border:1px solid ${COLOR.hairline};border-radius:12px;border-collapse:separate;border-spacing:0;margin:0 0 16px;">
  <tr>
    <td style="padding:0;">
      ${photoHtml}
      <a href="${url}" style="display:block;text-decoration:none;padding:24px;color:${COLOR.secondary};cursor:pointer;">
      <div style="font-size:${statSize};font-weight:800;color:${color};line-height:1.1;">${stat}</div>
      ${sublabel ? `<div style="font-size:11px;font-weight:600;color:${COLOR.muted};letter-spacing:0.6px;text-transform:uppercase;margin-top:6px;">${sublabel}</div>` : ""}
      <div style="font-size:16px;font-weight:700;color:${COLOR.body};line-height:22px;margin-top:14px;">${headline}</div>
      <div style="font-size:14px;line-height:22px;color:${COLOR.secondary};margin-top:10px;">${body}</div>
      </a>
    </td>
  </tr>
</table>`;
}

function expandStat(a: Attrs): string {
  const value = attr(a, "value", "");
  const direction = attr(a, "direction", "");
  const greendirection = attr(a, "greendirection", "");
  const color = statColor(direction, greendirection);
  return `<div style="font-size:26px;font-weight:700;color:${color};line-height:1;">${value}</div>`;
}

function badgeStyle(direction: string, favorable: boolean): { bg: string; border: string; text: string; arrow: string } {
  if (direction === "flat" || direction === "") {
    return { bg: COLOR.flatBg, border: COLOR.flatText, text: COLOR.flatText, arrow: "" };
  }
  const arrow = direction === "down" ? "&#8595;" : "&#8593;";
  return favorable
    ? { bg: COLOR.goodBg, border: COLOR.goodText, text: COLOR.goodText, arrow }
    : { bg: COLOR.badBg, border: COLOR.badText, text: COLOR.badText, arrow };
}

function expandMetric(a: Attrs, citySlug: string): string {
  const name = attr(a, "name", "");
  const key = attr(a, "key", "");
  const dateRange = attr(a, "date_range", "");
  const sourceUrl = attr(a, "source_url", "#");
  const priorLabel = attr(a, "prior_label", "");
  const priorValue = attr(a, "prior_value", "");
  const currentLabel = attr(a, "current_label", "");
  const currentValue = attr(a, "current_value", "");
  const pct = attr(a, "pct", "");
  const delta = attr(a, "delta", "");
  const direction = attr(a, "direction", "flat");
  const favorable = attr(a, "favorable", "false") === "true";
  const badge = badgeStyle(direction, favorable);
  const metricHref = key && citySlug ? `/c/${citySlug}/metrics/${key}` : "#";
  const badgeText = pct
    ? `${badge.arrow}${pct}%${delta ? ` (${delta})` : ""}`
    : "";
  return `<table role="presentation" width="100%" style="border-top:1px solid ${COLOR.hairline};">
  <tr><td style="padding:16px 0 6px;">
    <a href="${metricHref}" style="font-family:${ARIAL};font-size:17px;font-weight:800;line-height:1.2;color:${COLOR.body};text-decoration:underline;">${name}</a>
    <div style="font-family:${ARIAL};font-size:12px;color:${COLOR.muted};margin-top:4px;">${dateRange} &nbsp;&middot;&nbsp; <a href="${sourceUrl}" target="_blank" rel="noopener" style="color:${COLOR.muted};text-decoration:underline;">Source</a></div>
  </td></tr>
  <tr><td style="padding:0 0 18px;">
    <table role="presentation" width="100%">
      <tr>
        <td valign="middle" style="padding:0 16px 0 0;white-space:nowrap;">
          <div style="font-family:${ARIAL};font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${COLOR.mutedSoft};">${priorLabel}</div>
          <div style="font-family:${ARIAL};font-size:18px;font-weight:600;color:${COLOR.secondary};margin-top:2px;">${priorValue}</div>
        </td>
        <td valign="middle" style="padding:0 16px 0 0;white-space:nowrap;">
          <div style="font-family:${ARIAL};font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${COLOR.mutedSoft};">${currentLabel}</div>
          <div style="font-family:${ARIAL};font-size:18px;font-weight:600;color:${COLOR.secondary};margin-top:2px;">${currentValue}</div>
        </td>
        <td valign="middle" align="right" style="white-space:nowrap;width:1%;">
          <table role="presentation" align="right"><tr><td style="padding:8px 12px;border-radius:7px;background:${badge.bg};border-left:3px solid ${badge.border};">
            <div style="font-family:${ARIAL};font-size:16px;font-weight:800;line-height:1;color:${badge.text};white-space:nowrap;">${badgeText}</div>
          </td></tr></table>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`;
}

// Match a shortcode body: any chars that aren't `"` or `]`, OR a balanced
// `"..."` string. Lets attribute values legitimately contain `]` (e.g.
// `body="See [chart:42] later"` or `headline="Coverage of [200-300]"`).
const BODY = `(?:[^"\\]]|"[^"]*")*`;

const METRIC_RE = new RegExp(`\\[metric\\s+(${BODY})\\]`, "g");

function expandScorecard(attrsSrc: string, body: string): string {
  const a = parseAttrs(attrsSrc);
  const cityName = attr(a, "city", "");
  const yearCompare = attr(a, "year_compare", "");
  const dashboardUrl = attr(a, "dashboard_url", "#");
  const citySlug = attr(a, "city_slug", "");
  const metrics: string[] = [];
  for (const m of body.matchAll(METRIC_RE)) {
    metrics.push(expandMetric(parseAttrs(m[1]), citySlug));
  }
  const eyebrow = `<p style="font-family:${ARIAL};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:${COLOR.accent};margin:32px 0 12px;">CITYWIDE SCORECARD</p>`;
  const titleBar = `<table role="presentation" width="100%" style="border-bottom:2px solid ${COLOR.body};">
  <tr>
    <td valign="bottom" style="padding:0 0 12px;"><a href="${dashboardUrl}" style="font-family:${ARIAL};font-size:18px;font-weight:800;letter-spacing:-0.02em;color:${COLOR.body};text-decoration:none;">${cityName}</a></td>
    <td valign="bottom" align="right" style="padding:0 0 12px;"><span style="font-family:${ARIAL};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${COLOR.muted};white-space:nowrap;">${yearCompare}</span></td>
  </tr>
</table>`;
  return `${eyebrow}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.panel};border:1px solid ${COLOR.hairline};border-radius:12px;border-collapse:separate;border-spacing:0;">
  <tr><td style="padding:24px 20px;">
    ${titleBar}
    ${metrics.join("\n    ")}
  </td></tr>
</table>`;
}

function expandEvent(a: Attrs): string {
  const weekday = attr(a, "weekday", "");
  const day = attr(a, "day", "");
  const month = attr(a, "month", "");
  const title = attr(a, "title", "");
  const meta = attr(a, "meta", "");
  const linkLabel = attr(a, "link_label", "");
  const linkUrl = attr(a, "link_url", "");
  const linkHtml = linkLabel && linkUrl
    ? ` &middot; <a href="${linkUrl}" style="color:${COLOR.accent};">${linkLabel}</a>`
    : "";
  return `<table role="presentation" width="100%" style="margin-bottom:16px;border-collapse:collapse;">
  <tr>
    <td width="64" valign="top" style="padding:12px;background:${COLOR.accentBg};border:1px solid ${COLOR.accent};border-radius:6px;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:${COLOR.accent};letter-spacing:0.6px;text-transform:uppercase;">${weekday}</div>
      <div style="font-size:22px;font-weight:800;color:${COLOR.body};line-height:1;margin:2px 0;">${day}</div>
      <div style="font-size:10px;font-weight:600;color:${COLOR.muted};letter-spacing:0.6px;text-transform:uppercase;">${month}</div>
    </td>
    <td valign="top" style="padding-left:12px;">
      <div style="font-size:15px;font-weight:700;color:${COLOR.body};line-height:20px;">${title}</div>
      <div style="font-size:13px;color:${COLOR.secondary};margin-top:4px;">${meta}${linkHtml}</div>
    </td>
  </tr>
</table>`;
}

const EYEBROW_RE = new RegExp(`\\[eyebrow\\s+(${BODY})\\]`, "g");
const CARD_RE = new RegExp(`\\[card\\s+(${BODY})\\]`, "g");
const STAT_RE = new RegExp(`\\[stat\\s+(${BODY})\\]`, "g");
const EVENT_RE = new RegExp(`\\[event\\s+(${BODY})\\]`, "g");
const SCORECARD_OPEN_RE = new RegExp(`\\[scorecard(\\s+${BODY})?\\]`);
const SCORECARD_CLOSE_RE = /\[\/scorecard\]/;

export class ShortcodeError extends Error {}

function expandScorecardBlocks(src: string): string {
  let out = src;
  while (true) {
    const open = out.match(SCORECARD_OPEN_RE);
    if (!open) break;
    const openStart = open.index!;
    const openEnd = openStart + open[0].length;
    const tail = out.slice(openEnd);
    const close = tail.match(SCORECARD_CLOSE_RE);
    if (!close) {
      throw new ShortcodeError("Unclosed [scorecard] tag");
    }
    const body = tail.slice(0, close.index!);
    const closeEnd = openEnd + close.index! + close[0].length;
    const expanded = expandScorecard(open[1] ?? "", body);
    out = out.slice(0, openStart) + expanded + out.slice(closeEnd);
  }
  return out;
}

export function expand(src: string): string {
  let out = expandScorecardBlocks(src);
  out = out.replace(EYEBROW_RE, (_, attrs) => expandEyebrow(parseAttrs(attrs)));
  out = out.replace(CARD_RE, (_, attrs) => expandCard(parseAttrs(attrs)));
  out = out.replace(STAT_RE, (_, attrs) => expandStat(parseAttrs(attrs)));
  out = out.replace(EVENT_RE, (_, attrs) => expandEvent(parseAttrs(attrs)));
  return out;
}

export const EXAMPLE_DRAFT = `Subject: Mission noise complaints jumped 38% on Valencia

[eyebrow text="LEAD STORY · YOUR DISTRICT"]

<h2 style="font-size:24px;line-height:30px;font-weight:700;color:#111827;margin:0 0 16px;">
  <a href="/c/sf/stories/valencia-noise" style="color:#111827;text-decoration:none;">Mission noise complaints jumped 38% on Valencia this year</a>
</h2>

<p style="margin:20px 0;">[map:hero_mission_noise]</p>

<div style="margin:0 0 16px;padding:8px 12px;font-size:13px;color:#6b7280;">
  <span style="display:inline-block;width:10px;height:10px;background:#ad35fa;border-radius:50%;margin-right:4px;vertical-align:middle;"></span> Noise 311
  <span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:50%;margin:0 4px 0 12px;vertical-align:middle;"></span> Bars
</div>

<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#111827;">
  311 logged 412 noise complaints between 16th and 24th on <a href="/c/sf/metrics/noise-complaints" style="color:#ad35fa;">Valencia</a> from January through April. <strong>Ninety-two of those came in after midnight.</strong>
</p>

<p style="margin:20px 0;">[chart:valencia_trend]</p>

<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#111827;">
  The same window last year drew 298 complaints. Two new late-night venues opened on the strip in February, both within a block of the cluster. <a href="/c/sf/stories/valencia-noise" style="color:#ad35fa;font-size:13px;text-decoration:underline;">Full story</a>
</p>

[eyebrow text="THE BLOCK BRIEF"]

[card stat="14 filings" sublabel="AT ONE ADDRESS" headline="One Mission address drove a quarter of district permit activity" body="DBI logged 14 filings on a single address between January and April. <strong>The next-busiest address in the district had three.</strong> The filings cluster around a planned mixed-use conversion." url="/c/sf/stories/permits-mission"]

[card stat="$1.2M" sublabel="STREET REPAVING" headline="DPW cut its first capital check for 24th Street in three years" body="Public Works released the contract on April 18 for repaving from Mission to Folsom. The block has logged the most pothole 311 calls in District 9 this year." url="/c/sf/stories/dpw-24th"]

[card stat="6 days" sublabel="CITYWIDE · MEDIAN" headline="311 cleanup response is at its fastest since 2023" body="Median time-to-close on illegal dumping cases dropped from 11 days to 6 since January. The improvement tracks with the new South of Market crew added in February." url="/c/sf/stories/cleanup-response"]

[eyebrow text="ACROSS SAN FRANCISCO"]

<h2 style="font-size:20px;line-height:26px;font-weight:700;color:#111827;margin:0 0 16px;">
  <a href="/c/sf/stories/permits-citywide" style="color:#111827;text-decoration:none;">Citywide housing permits hit a 6-year high in Q1</a>
</h2>

<p style="margin:20px 0;">[chart:citywide_permits_trend]</p>

<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:#111827;">
  <span style="font-weight:700;">Year to date through April 30:</span>
  DBI issued 312 new housing permits, the highest Q1 count since 2019. Last year's same window drew 256.
</p>

<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:#111827;">
  <span style="font-weight:700;">What is driving it:</span>
  The streamlined ADU pathway adopted in November is responsible for 38% of YTD filings, per DBI's own breakdown.
</p>

<p style="margin:0 0 24px;font-size:15px;line-height:23px;color:#111827;">
  <span style="font-weight:700;">Watch:</span>
  Whether the Q2 pace holds above 250 filings would push 2026 past 2019's full-year total.
  <a href="/c/sf/metrics/housing-permits" style="color:#ad35fa;font-size:13px;text-decoration:underline;">Trend data</a>
</p>

[scorecard city="San Francisco" year_compare="2026 YTD vs. 2025 YTD" dashboard_url="/c/sf" city_slug="sf"]
  [metric name="Noise complaints" key="noise-complaints" date_range="Jan 1 – Apr 30" source_url="https://data.sfgov.org/" prior_label="2025 YTD" prior_value="2,743" current_label="2026 YTD" current_value="3,127" pct="14.0" delta="+384" direction="up" favorable="false"]
  [metric name="New housing permits" key="housing-permits" date_range="Jan 1 – Apr 30" source_url="https://data.sfgov.org/" prior_label="2025 YTD" prior_value="256" current_label="2026 YTD" current_value="312" pct="21.9" delta="+56" direction="up" favorable="true"]
  [metric name="Property crime" key="property-crime" date_range="Jan 1 – Apr 30" source_url="https://data.sfgov.org/" prior_label="2025 YTD" prior_value="5,204" current_label="2026 YTD" current_value="4,891" pct="6.0" delta="−313" direction="down" favorable="true"]
  [metric name="Illegal dumping closures" key="dumping-closures" date_range="Jan 1 – Apr 30" source_url="https://data.sfgov.org/" prior_label="2025 YTD" prior_value="2,168" current_label="2026 YTD" current_value="2,103" pct="3.0" delta="−65" direction="down" favorable="false"]
[/scorecard]

[eyebrow text="COMING UP AT CITY HALL"]

[event weekday="Mon" day="06" month="May" title="Land Use & Transportation Committee" meta="Room 263, City Hall · 1:30 PM" link_label="Agenda" link_url="https://sfbos.org/agenda"]
[event weekday="Tue" day="07" month="May" title="Public Safety Hearing on 311 response times" meta="Room 250 · 10:00 AM" link_label="Witness list" link_url="https://sfbos.org/witnesses"]
[event weekday="Wed" day="08" month="May" title="Planning Commission · ADU pathway review" meta="Room 400 · 12:00 PM" link_label="Public docket" link_url="https://sfplanning.org/docket"]
[event weekday="Thu" day="09" month="May" title="DPW Capital Projects briefing" meta="Room 408 · 2:00 PM" link_label="Watch live" link_url="https://sfgovtv.org/live"]

<p style="font-size:14px;color:#374151;margin:24px 0 8px;">
  That's the week. See you next Monday.
</p>
`;
