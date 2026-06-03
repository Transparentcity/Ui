#!/usr/bin/env node
/**
 * Weekly Transparent City dashboard QA.
 *
 * Fetches all YTD metric comparisons via the public API for each of the 9
 * launched city dashboards, runs arithmetic and data-quality checks, and
 * emails a structured HTML report to the recipient below.
 *
 * Persistent appendix state (known outages, known lags) lives in state.json
 * and is committed back to the repo by the GitHub Actions workflow.
 */

import sgMail from "@sendgrid/mail";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, "state.json");

const API_BASE = "https://api.transparent.city";
const SITE_BASE = "https://transparent.city";
const RECIPIENT = "adam@planet10b.com";
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@transparent.city";
const FROM_NAME = "Transparent City QA";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Target cities to audit each run.
// slugPatterns are matched against the city sitemap (slug and name fields).
const TARGET_CITIES = [
  { label: "SF",         slugPatterns: ["sf", "san-francisco"] },
  { label: "Oakland",    slugPatterns: ["oakland"] },
  { label: "Chicago",    slugPatterns: ["chicago"] },
  { label: "Detroit",    slugPatterns: ["detroit"] },
  { label: "Denver",     slugPatterns: ["denver"] },
  { label: "Cincinnati", slugPatterns: ["cincinnati"] },
  { label: "NYC",        slugPatterns: ["nyc", "new-york", "new-york-city"] },
  { label: "Austin",     slugPatterns: ["austin"] },
  { label: "Seattle",    slugPatterns: ["seattle"] },
];

// -----------------------------------------------------------------------------
// State helpers
// -----------------------------------------------------------------------------

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { knownOutages: [], knownLags: [], lastRunDate: null };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

// -----------------------------------------------------------------------------
// API helpers
// -----------------------------------------------------------------------------

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → HTTP ${res.status}`);
  return res.json();
}

// -----------------------------------------------------------------------------
// Date / number helpers
// -----------------------------------------------------------------------------

// Normalize API dates: "2026-06-01T00:00:00" or "2026-06-01" → "2026-06-01"
function toDateStr(dateStr) {
  if (!dateStr) return null;
  return String(dateStr).slice(0, 10);
}

function monthDay(dateStr) {
  const d = toDateStr(dateStr);
  return d ? d.slice(5) : null; // "YYYY-MM-DD" → "MM-DD"
}

function daysBetween(earlier, later) {
  const e = toDateStr(earlier);
  const l = toDateStr(later);
  if (!e || !l) return null;
  return Math.round((new Date(l) - new Date(e)) / 86400000);
}

function fmtDate(dateStr) {
  const d = toDateStr(dateStr);
  if (!d) return "—";
  const date = new Date(d + "T12:00:00Z");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtNum(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function pctChange(cur, prior) {
  if (prior === null || prior === undefined || prior === 0) return null;
  return ((cur - prior) / Math.abs(prior)) * 100;
}

// -----------------------------------------------------------------------------
// City matching helper
// -----------------------------------------------------------------------------

function matchCity(sitemapCity, target) {
  const slug = (sitemapCity.slug || "").toLowerCase();
  const name = (sitemapCity.name || "").toLowerCase();
  return target.slugPatterns.some(
    (p) => slug === p || slug.includes(p) || name.includes(p.replace(/-/g, " "))
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const runDate = new Date();
  const runDateStr = runDate.toISOString().slice(0, 10);
  const state = loadState();

  // 1. Resolve target cities from the live sitemap
  const sitemap = await apiFetch("/api/public/cities/sitemap");
  const launched = sitemap.filter((c) => c.is_launched);

  const resolvedCities = [];
  const missingTargets = [];

  for (const target of TARGET_CITIES) {
    const found = launched.find((c) => matchCity(c, target));
    if (!found) {
      missingTargets.push(target.label);
    } else {
      resolvedCities.push({ ...target, cityId: found.id, slug: found.slug || "", cityName: found.name });
    }
  }

  // Detect newly launched cities not in our target list
  const extraLaunched = launched.filter((c) => !TARGET_CITIES.some((t) => matchCity(c, t)));

  // 2. Audit each city
  const cityReports = [];
  let totalCards = 0;
  const resolvedOutages = [];
  const resolvedLags = [];

  for (const city of resolvedCities) {
    const report = await auditCity(city, state, runDateStr, resolvedOutages, resolvedLags);
    totalCards += report.cardCount;
    cityReports.push({ city, report });
  }

  // 3. Remove resolved items from state
  for (const r of resolvedOutages) {
    state.knownOutages = state.knownOutages.filter(
      (o) => !(o.metricId === r.metricId && o.city === r.city)
    );
  }
  for (const r of resolvedLags) {
    state.knownLags = state.knownLags.filter(
      (l) => !(l.metricId === r.metricId && l.city === r.city)
    );
  }

  // 4. Build and send email
  const failures = cityReports.filter((cr) => cr.report.failures.length > 0);
  const passing = cityReports.filter((cr) => cr.report.failures.length === 0).map((cr) => cr.city.label);
  const totalFailures = cityReports.reduce((s, cr) => s + cr.report.failures.length, 0);

  const subject =
    totalFailures === 0
      ? `Transparent City QA: all clear — ${runDateStr}`
      : `Transparent City QA: ${totalFailures} metric issue${totalFailures === 1 ? "" : "s"} across ${resolvedCities.length} cities`;

  const html = buildHtml({
    runDate,
    totalCards,
    totalFailures,
    passing,
    failures,
    resolvedOutages,
    resolvedLags,
    missingTargets,
    extraLaunched,
    state,
  });

  if (!process.env.SENDGRID_API_KEY) {
    console.warn("SENDGRID_API_KEY not set — printing report to stdout.");
    console.log(`\n--- SUBJECT: ${subject} ---\n`);
    console.log(html);
  } else {
    await sgMail.send({
      to: RECIPIENT,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      html,
    });
    console.log(`Sent: "${subject}"`);
  }

  // 5. Persist appendix state
  state.lastRunDate = runDateStr;
  saveState(state);
  console.log(`State saved. Outages: ${state.knownOutages.length}, Lags: ${state.knownLags.length}`);
}

// -----------------------------------------------------------------------------
// City auditor
// -----------------------------------------------------------------------------

async function auditCity(city, state, runDateStr, resolvedOutages, resolvedLags) {
  const failures = [];

  // Get city detail (includes metric list with show_on_dash flag)
  const cityDetail = await apiFetch(`/api/public/cities/${city.cityId}?include_metrics=true`);
  const allMetrics = cityDetail.metrics || [];
  // Include metrics not explicitly excluded from the dashboard
  const dashMetrics = allMetrics.filter((m) => m.show_on_dash !== false);

  if (dashMetrics.length === 0) {
    return { failures, cardCount: 0 };
  }

  // Check 1: every dashboard metric has a display name (not a raw slug)
  for (const m of dashMetrics) {
    if (!m.metric_name || m.metric_name.trim() === "") {
      failures.push(failure(city, m, "Card renders as raw slug — metric_name missing", `metric_key shown: ${m.metric_key}`));
    }
  }

  // Batch-fetch YTD comparisons
  const metricIds = dashMetrics.map((m) => m.id);
  const rawBatch = await apiPost("/api/public/metrics/comparisons/batch", {
    metric_ids: metricIds,
    district: 0,
    comparison_types: ["ytd"],
  });

  // Normalize: rawBatch keys may be strings; values are Record<type, comparison>
  const compById = {};
  for (const [idStr, compMap] of Object.entries(rawBatch)) {
    compById[Number(idStr)] = compMap;
  }

  // Compute consensus end date for this city (most common current_period_end, normalized to YYYY-MM-DD)
  const endDates = dashMetrics
    .map((m) => toDateStr(compById[m.id]?.["ytd"]?.current_period_end))
    .filter(Boolean);
  const endDateFreq = {};
  for (const d of endDates) endDateFreq[d] = (endDateFreq[d] || 0) + 1;
  const consensusEnd = Object.entries(endDateFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Per-metric checks
  for (const m of dashMetrics) {
    const name = m.metric_name || m.metric_key;
    const cardUrl = `${SITE_BASE}/c/${city.slug}/metrics/${m.metric_key}`;
    const comp = compById[m.id]?.["ytd"];

    if (!comp) {
      failures.push(failure(city, m, "No YTD comparison data returned by API", "API returned empty for this metric"));
      continue;
    }

    const cur = comp.current_period_value;
    const prior = comp.comparison_period_value;
    const curStart = toDateStr(comp.current_period_start);
    const curEnd = toDateStr(comp.current_period_end);
    const priorEnd = toDateStr(comp.comparison_period_end);

    // Check 2: current YTD value present
    if (cur === null || cur === undefined) {
      failures.push(failure(city, m,
        "Missing current-year YTD value",
        `Current: No data | Prior: ${fmtNum(prior)} | Window: ${fmtDate(curStart)} – ${fmtDate(curEnd)}`
      ));
    }

    // Check 3: prior YTD value present (known-outage handling)
    if (prior === null || prior === undefined) {
      const known = state.knownOutages.find((o) => o.metricId === m.id && o.city === city.label);
      if (!known) {
        failures.push(failure(city, m,
          "Missing prior-year YTD value (new — added to Appendix A)",
          `Current: ${fmtNum(cur)} | Prior: No data | Window ends: ${fmtDate(curEnd)}`
        ));
        state.knownOutages.push({
          city: city.label,
          metricName: name,
          metricKey: m.metric_key,
          metricId: m.id,
          cardUrl,
          missingWindow: "prior-year YTD",
          reason: "reason unconfirmed",
          addedDate: runDateStr,
        });
      }
      // else: expected outage still present — remains in appendix, nothing to flag
    } else {
      // Prior data is present — check if a known outage has resolved
      const knownIdx = state.knownOutages.findIndex((o) => o.metricId === m.id && o.city === city.label);
      if (knownIdx >= 0) {
        resolvedOutages.push({ city: city.label, metricId: m.id, metricName: name, cardUrl });
      }
    }

    // Check 4: YTD window consistency — both years should end on the same month-day
    if (curEnd && priorEnd) {
      const curMD = monthDay(curEnd);
      const priorMD = monthDay(priorEnd);
      if (curMD !== priorMD) {
        failures.push(failure(city, m,
          "YTD window end-date mismatch between years",
          `Current ends: ${fmtDate(curEnd)} (${curMD}) | Prior ends: ${fmtDate(priorEnd)} (${priorMD})`
        ));
      }
    }

    // Check 5: Data lag vs city consensus
    if (curEnd && consensusEnd && curEnd !== consensusEnd) {
      const lagDays = daysBetween(curEnd, consensusEnd);
      if (lagDays !== null && lagDays > 7) {
        const knownLag = state.knownLags.find((l) => l.metricId === m.id && l.city === city.label);
        if (knownLag) {
          const [minLag, maxLag] = knownLag.normalLagRange || [0, 30];
          if (lagDays > maxLag + 7) {
            failures.push(failure(city, m,
              `Data lag exceeds normal range — possible stalled feed (${lagDays}d lag, expected ≤${maxLag}d)`,
              `Metric ends: ${fmtDate(curEnd)} | City consensus: ${fmtDate(consensusEnd)}`
            ));
          }
          // lag within range and nearly caught up → resolve
          if (lagDays <= 3) {
            resolvedLags.push({ city: city.label, metricId: m.id, metricName: name, cardUrl });
          }
        } else {
          // New lag pattern — flag once and seed Appendix B
          failures.push(failure(city, m,
            `Data lag detected (${lagDays}d behind city consensus) — added to Appendix B`,
            `Metric ends: ${fmtDate(curEnd)} | City consensus: ${fmtDate(consensusEnd)}`
          ));
          state.knownLags.push({
            city: city.label,
            metricName: name,
            metricKey: m.metric_key,
            metricId: m.id,
            cardUrl,
            normalLagRange: [Math.max(0, lagDays - 4), lagDays + 4],
            source: "unconfirmed",
            addedDate: runDateStr,
          });
        }
      }
    }

    // Check 6: Arithmetic consistency — verify percent change from raw values
    if (cur !== null && cur !== undefined && prior !== null && prior !== undefined && prior !== 0) {
      const expectedPct = pctChange(cur, prior);
      // The API does not return a pre-computed pct_change; we just confirm the
      // underlying values are self-consistent (non-NaN, finite).
      if (!isFinite(expectedPct)) {
        failures.push(failure(city, m,
          "Arithmetic error: percent change is non-finite given these values",
          `Current: ${fmtNum(cur)} | Prior: ${fmtNum(prior)} | Computed pct: ${expectedPct}`
        ));
      }
    }

    // Check 7: Plausibility — negative counts
    if ((cur !== null && cur < 0) || (prior !== null && prior < 0)) {
      failures.push(failure(city, m,
        "Implausible value: negative YTD count",
        `Current: ${fmtNum(cur)} | Prior: ${fmtNum(prior)}`
      ));
    }

    // Check 8: Staleness — "As of" more than 90 days old after accounting for known lag
    if (curEnd) {
      const staleDays = daysBetween(curEnd, runDateStr);
      const knownLag = state.knownLags.find((l) => l.metricId === m.id && l.city === city.label);
      const maxExpected = (knownLag?.normalLagRange?.[1] ?? 0) + 60;
      if (staleDays !== null && staleDays > maxExpected) {
        failures.push(failure(city, m,
          `"As of" date is ${staleDays} days ago — possibly stale`,
          `Last data point: ${fmtDate(curEnd)} | Run date: ${fmtDate(runDateStr)}`
        ));
      }
    }
  }

  return { failures, cardCount: dashMetrics.length };
}

// -----------------------------------------------------------------------------
// Failure record builder
// -----------------------------------------------------------------------------

function failure(city, metric, failureType, onPageValues) {
  return {
    metricName: metric.metric_name || metric.metric_key,
    metricKey: metric.metric_key,
    metricId: metric.id,
    cardUrl: `${SITE_BASE}/c/${city.slug}/metrics/${metric.metric_key}`,
    failureType,
    onPageValues,
  };
}

// -----------------------------------------------------------------------------
// HTML report builder
// -----------------------------------------------------------------------------

function buildHtml({ runDate, totalCards, totalFailures, passing, failures, resolvedOutages, resolvedLags, missingTargets, extraLaunched, state }) {
  const ts = runDate.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });

  const css = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 860px; margin: 0 auto; padding: 24px; }
    h2 { font-size: 1.1rem; margin: 28px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    h3 { font-size: 0.95rem; margin: 20px 0 6px; color: #374151; }
    p { margin: 6px 0; font-size: 0.9rem; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0 20px; font-size: 0.85rem; }
    th { background: #f3f4f6; text-align: left; padding: 7px 10px; font-weight: 600; border: 1px solid #e5e7eb; }
    td { padding: 7px 10px; border: 1px solid #e5e7eb; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .pass { color: #16a34a; }
    .fail { color: #dc2626; }
    .note { font-size: 0.8rem; color: #6b7280; }
  `;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>`;

  // 1. Summary
  html += `<p><strong>Run:</strong> ${ts} &nbsp;|&nbsp; <strong>Cards checked:</strong> ${totalCards} &nbsp;|&nbsp; <strong>Failures:</strong> ${totalFailures === 0 ? '<span class="pass">0 — all clear</span>' : `<span class="fail">${totalFailures}</span>`}</p>`;

  if (missingTargets.length > 0) {
    html += `<p class="note">⚠ Could not resolve target cities in sitemap: ${missingTargets.join(", ")}. Check slugs.</p>`;
  }
  if (extraLaunched.length > 0) {
    html += `<p class="note">ℹ New launched cities not in target list: ${extraLaunched.map((c) => `${c.name} (${c.slug})`).join(", ")} — consider adding to TARGET_CITIES.</p>`;
  }

  // 2. Passing cities
  html += `<h2>Passing cities</h2>`;
  html += passing.length > 0
    ? `<p class="pass">${passing.join(", ")}</p>`
    : `<p class="note">None — all cities had issues.</p>`;

  // 3. Failures by city
  if (failures.length > 0) {
    html += `<h2>Failures</h2>`;
    for (const { city, report } of failures) {
      html += `<h3>${city.label}</h3>`;
      html += `<table><thead><tr><th>Metric</th><th>Failure type</th><th>On-page values</th></tr></thead><tbody>`;
      for (const f of report.failures) {
        html += `<tr>
          <td><a href="${esc(f.cardUrl)}">${esc(f.metricName)}</a></td>
          <td>${esc(f.failureType)}</td>
          <td>${esc(f.onPageValues)}</td>
        </tr>`;
      }
      html += `</tbody></table>`;
    }
  }

  // 4. Resolved items
  if (resolvedOutages.length > 0 || resolvedLags.length > 0) {
    html += `<h2>Resolved items</h2>`;
    if (resolvedOutages.length > 0) {
      html += `<p><strong>Data outages now resolved (prior-year data present):</strong></p><ul>`;
      for (const r of resolvedOutages) {
        html += `<li>${esc(r.city)} — <a href="${esc(r.cardUrl)}">${esc(r.metricName)}</a></li>`;
      }
      html += `</ul>`;
    }
    if (resolvedLags.length > 0) {
      html += `<p><strong>Lagging feeds that have caught up:</strong></p><ul>`;
      for (const r of resolvedLags) {
        html += `<li>${esc(r.city)} — <a href="${esc(r.cardUrl)}">${esc(r.metricName)}</a></li>`;
      }
      html += `</ul>`;
    }
  }

  // 5. Appendix A: Known Data Outages
  html += `<h2>Appendix A: Known Data Outages</h2>`;
  if (state.knownOutages.length === 0) {
    html += `<p class="note">None on record.</p>`;
  } else {
    html += `<table><thead><tr><th>City</th><th>Metric</th><th>Missing window</th><th>Reason</th><th>Added</th></tr></thead><tbody>`;
    for (const o of state.knownOutages) {
      html += `<tr>
        <td>${esc(o.city)}</td>
        <td><a href="${esc(o.cardUrl)}">${esc(o.metricName)}</a></td>
        <td>${esc(o.missingWindow)}</td>
        <td>${esc(o.reason)}</td>
        <td>${esc(o.addedDate)}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }

  // 6. Appendix B: Known Data Lag
  html += `<h2>Appendix B: Known Data Lag</h2>`;
  if (state.knownLags.length === 0) {
    html += `<p class="note">None on record.</p>`;
  } else {
    html += `<table><thead><tr><th>City</th><th>Metric</th><th>Normal lag range</th><th>Source</th><th>Added</th></tr></thead><tbody>`;
    for (const l of state.knownLags) {
      const [min, max] = l.normalLagRange || [0, 0];
      html += `<tr>
        <td>${esc(l.city)}</td>
        <td><a href="${esc(l.cardUrl)}">${esc(l.metricName)}</a></td>
        <td>${min}–${max} days</td>
        <td>${esc(l.source)}</td>
        <td>${esc(l.addedDate)}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `</body></html>`;
  return html;
}

function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

main().catch((err) => {
  console.error("QA script failed:", err);
  process.exit(1);
});
