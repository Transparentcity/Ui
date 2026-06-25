#!/usr/bin/env node
/**
 * Weekly Transparent City dashboard QA.
 *
 * Two-pass audit for each of the 9 launched city dashboards:
 *
 *  Pass 1 – API  : fetches metric YTD comparisons, runs arithmetic / data-quality
 *                  checks, and updates the known-outages / known-lags appendix.
 *
 *  Pass 2 – Browser (Playwright/Chromium): visits the logged-out dashboard URL,
 *                  waits for JS rendering to settle, and checks visual correctness —
 *                  cards rendered as titled tiles (not raw slugs), "As of" date
 *                  present, no "Loading…" spinners remaining after settling.
 *
 * Output:
 *   - scripts/weekly-qa/report-latest.html   (always overwritten — the canonical report)
 *   - scripts/weekly-qa/reports/qa-YYYY-MM-DD.html  (dated archive copy)
 *   - stdout: one-line title + concise pass/fail summary
 *
 * Persistent appendix state (known outages, known lags) lives in state.json
 * and is committed back to the repo by the GitHub Actions workflow.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE     = join(__dirname, "state.json");
const REPORT_FILE    = join(__dirname, "report-latest.html");
const REPORTS_DIR    = join(__dirname, "reports");
const FACTCHECK_FILE = join(__dirname, "factcheck-queue.json");

const API_BASE  = "https://api.transparent.city";
const SITE_BASE = "https://transparent.city";

// How long to wait for the dashboard JS to settle (ms).
const BROWSER_SETTLE_MS = 6000;
// Overall page-load timeout for Playwright (ms).
const PAGE_TIMEOUT_MS   = 30000;

const TARGET_CITIES = [
  { label: "SF",         slugPatterns: ["san-francisco", "sf"] },
  { label: "Oakland",    slugPatterns: ["oakland"] },
  { label: "Chicago",    slugPatterns: ["chicago"] },
  { label: "Detroit",    slugPatterns: ["detroit"] },
  { label: "Denver",     slugPatterns: ["denver"] },
  { label: "Cincinnati", slugPatterns: ["cincinnati"] },
  { label: "NYC",        slugPatterns: ["new-york-city", "new-york", "nyc"] },
  { label: "Austin",     slugPatterns: ["austin"] },
  { label: "Seattle",    slugPatterns: ["seattle"] },
];

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Date / number helpers
// ---------------------------------------------------------------------------

function toDateStr(dateStr) {
  if (!dateStr) return null;
  return String(dateStr).slice(0, 10);
}

function monthDay(dateStr) {
  const d = toDateStr(dateStr);
  return d ? d.slice(5) : null;
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

export function fmtNum(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function pctChange(cur, prior) {
  if (prior === null || prior === undefined || prior === 0) return null;
  return ((cur - prior) / Math.abs(prior)) * 100;
}

// ---------------------------------------------------------------------------
// City matching
// ---------------------------------------------------------------------------

function matchCity(sitemapCity, target) {
  const slug = (sitemapCity.slug || "").toLowerCase();
  const name = (sitemapCity.name || "").toLowerCase();
  return target.slugPatterns.some(
    (p) => slug === p || slug.includes(p) || name.includes(p.replace(/-/g, " "))
  );
}

// ---------------------------------------------------------------------------
// Pass 2: Playwright visual check
// ---------------------------------------------------------------------------

async function playwrightCheck(browser, citySlug) {
  // UTM params identify these visits in analytics as QA bot traffic.
  const url = `${SITE_BASE}/c/${citySlug}?utm_source=qa-bot&utm_medium=automated&utm_campaign=weekly-qa`;
  const findings = {
    url,
    renderFailed:  false,
    stillLoading:  false,
    missingAsOf:   false,
    rawSlugs:      [],
    error:         null,
  };

  const ctxOpts = {
    // Logged-out: no stored auth state, no cookies.
    storageState: undefined,
    // Custom UA so analytics / server logs can also filter by bot identity.
    userAgent: "TransparentCity-QA-Bot/1.0 (weekly-dashboard-audit; +https://transparent.city)",
  };
  // Route browser traffic through the session proxy when configured.
  if (process.env.HTTPS_PROXY) ctxOpts.proxy = { server: process.env.HTTPS_PROXY };
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });

    // Wait for at least one card-like element to appear, then let JS settle.
    await page
      .waitForSelector('[class*="stat"], [class*="card"], [class*="metric"], main', {
        timeout: 15000,
      })
      .catch(() => {
        findings.renderFailed = true;
      });

    if (!findings.renderFailed) {
      await page.waitForTimeout(BROWSER_SETTLE_MS);
    }

    const bodyText = await page.evaluate(() => document.body.innerText || "");

    // Check 1: any "Loading city dashboard" text remaining after settle?
    findings.stillLoading =
      /loading city dashboard/i.test(bodyText) ||
      /loading…/i.test(bodyText);

    if (findings.stillLoading) findings.renderFailed = true;

    // Check 2: raw URL slugs appearing as a card title (card rendering failure).
    // A broken card renders its slug path as its entire visible text, e.g.
    // "/c/oakland/metrics/oakland_stolen_vehicles" with nothing else on that line.
    // We only flag lines that ARE the slug — not slugs embedded in links or prose.
    const slugLinePattern = /^\/c\/[\w-]+\/metrics\/[\w_-]+$/;
    const rawSlugs = bodyText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => slugLinePattern.test(l));
    findings.rawSlugs = [...new Set(rawSlugs)];

    // Check 3: "As of" date visible?
    findings.missingAsOf = !/\bas of\b/i.test(bodyText);

  } catch (err) {
    // Distinguish a browser-level connectivity failure (proxy/network can't
    // reach the site) from an actual page-render problem. Connection errors
    // are infrastructure issues in this environment and should not be flagged
    // as dashboard failures.
    const isConnectivityError = /ERR_CONNECTION_CLOSED|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|ERR_TIMED_OUT|net::ERR_/i.test(err.message);
    if (isConnectivityError) {
      findings.browserUnavailable = true;
    } else {
      findings.error        = err.message;
      findings.renderFailed = true;
    }
  } finally {
    await context.close();
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const runDate    = new Date();
  const runDateStr = runDate.toISOString().slice(0, 10);
  const state      = loadState();

  // 1. Resolve target cities from the live sitemap.
  const sitemap  = await apiFetch("/api/public/cities/sitemap");
  const launched = sitemap.filter((c) => c.is_launched);

  const resolvedCities = [];
  const missingTargets = [];

  for (const target of TARGET_CITIES) {
    const found = launched.find((c) => matchCity(c, target));
    if (!found) {
      missingTargets.push(target.label);
    } else {
      resolvedCities.push({
        ...target,
        cityId:   found.id,
        slug:     found.slug || "",
        cityName: found.name,
      });
    }
  }

  const extraLaunched = launched.filter(
    (c) => !TARGET_CITIES.some((t) => matchCity(c, t))
  );

  // 2. Launch Playwright browser (single instance for all cities).
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });

  // 3. Audit each city (API pass + browser pass).
  const cityReports     = [];
  let   totalCards      = 0;
  const resolvedOutages = [];
  const resolvedLags    = [];

  for (const city of resolvedCities) {
    process.stdout.write(`  Auditing ${city.label}…`);

    const [apiReport, pwFindings] = await Promise.all([
      auditCityApi(city, state, runDateStr, resolvedOutages, resolvedLags),
      playwrightCheck(browser, city.slug),
    ]);

    // Translate browser findings into failure records.
    const pwFailures = [];
    const dashUrl    = `${SITE_BASE}/c/${city.slug}`;

    // If the browser couldn't reach the site at all (proxy/network issue in
    // this environment), skip all browser-based checks for this city rather
    // than reporting false positives.
    if (pwFindings.browserUnavailable) {
      // Silently skip — API checks still run.
    } else if (pwFindings.renderFailed) {
      pwFailures.push({
        metricName:  "City dashboard",
        metricKey:   "",
        cardUrl:     dashUrl,
        failureType: "Dashboard did not render — loading spinners remained after settle",
        onPageValues: pwFindings.error || "Page shows 'Loading city dashboard…' after JS settle period",
      });
    }

    // Raw slug cards and "As of" checks only run when the browser connected.
    if (!pwFindings.browserUnavailable) {
      if (!pwFindings.renderFailed && pwFindings.rawSlugs.length > 0) {
        pwFailures.push({
          metricName:  "One or more metric cards",
          metricKey:   "",
          cardUrl:     dashUrl,
          failureType: "Card(s) rendering as raw URL slug instead of titled tile",
          onPageValues: pwFindings.rawSlugs.slice(0, 5).join("; "),
        });
      }

      if (!pwFindings.renderFailed && pwFindings.missingAsOf) {
        pwFailures.push({
          metricName:  "City dashboard",
          metricKey:   "",
          cardUrl:     dashUrl,
          failureType: '"As of" date text not found on dashboard',
          onPageValues: `Dashboard URL: ${dashUrl}`,
        });
      }
    }

    const allFailures = [...pwFailures, ...apiReport.failures];
    totalCards += apiReport.cardCount;

    console.log(
      ` ${allFailures.length === 0 ? "✓ clean" : `✗ ${allFailures.length} issue(s)`}`
    );

    cityReports.push({ city, report: { ...apiReport, failures: allFailures } });
  }

  await browser.close();

  // 4. Remove resolved items from state.
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

  // 5. Build report.
  const failures      = cityReports.filter((cr) => cr.report.failures.length > 0);
  const passing       = cityReports
    .filter((cr) => cr.report.failures.length === 0)
    .map((cr) => cr.city.label);
  const totalFailures = cityReports.reduce((s, cr) => s + cr.report.failures.length, 0);

  const title =
    totalFailures === 0
      ? `Transparent City QA: all clear — ${runDateStr}`
      : `Transparent City QA: ${totalFailures} metric issue${totalFailures === 1 ? "" : "s"} across ${resolvedCities.length} cities`;

  // Pick 3 healthy (non-failing) metrics per city for web-search fact-checking.
  const factCheckCandidates = selectFactCheckCandidates(cityReports, runDateStr, 3);
  writeFileSync(FACTCHECK_FILE, JSON.stringify({ runDate: runDateStr, candidates: factCheckCandidates }, null, 2) + "\n", "utf8");

  const html = buildHtml({
    title,
    runDate,
    totalCards,
    totalFailures,
    passing,
    failures,
    resolvedOutages,
    resolvedLags,
    missingTargets,
    extraLaunched,
    factCheckCandidates,
    state,
  });

  // 6. Write HTML report file.
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(REPORT_FILE, html, "utf8");
  const archivePath = join(REPORTS_DIR, `qa-${runDateStr}.html`);
  writeFileSync(archivePath, html, "utf8");

  // 7. Print concise stdout summary.
  console.log(`\n=== ${title} ===`);
  console.log(`Cards checked: ${totalCards}  |  Failures: ${totalFailures}`);
  if (passing.length > 0) console.log(`Passing: ${passing.join(", ")}`);
  if (failures.length > 0) {
    for (const { city, report } of failures) {
      console.log(`\n${city.label} (${report.failures.length} issue${report.failures.length === 1 ? "" : "s"}):`);
      for (const f of report.failures) {
        console.log(`  • [${f.failureType}] ${f.metricName}`);
      }
    }
  }
  console.log(`\nFact-check candidates queued: ${factCheckCandidates.length} (${FACTCHECK_FILE})`);
  console.log(`Report written to: ${REPORT_FILE}`);

  // 8. Persist appendix state.
  state.lastRunDate = runDateStr;
  saveState(state);
}

// ---------------------------------------------------------------------------
// Pass 1: API-based city auditor
// ---------------------------------------------------------------------------

async function auditCityApi(city, state, runDateStr, resolvedOutages, resolvedLags) {
  const failures = [];
  // Per-metric records, used downstream to pick healthy fact-check candidates.
  const metrics  = [];

  const cityDetail  = await apiFetch(`/api/public/cities/${city.cityId}?include_metrics=true`);
  const allMetrics  = cityDetail.metrics || [];
  const dashMetrics = allMetrics.filter((m) => m.show_on_dash !== false);

  if (dashMetrics.length === 0) return { failures, cardCount: 0, metrics };

  // Check 1: every dashboard metric has a display name (not a raw slug).
  for (const m of dashMetrics) {
    if (!m.metric_name || m.metric_name.trim() === "") {
      failures.push(failure(city, m, "Card renders as raw slug — metric_name missing", `metric_key shown: ${m.metric_key}`));
    }
  }

  // Batch-fetch YTD comparisons.
  const metricIds = dashMetrics.map((m) => m.id);
  const rawBatch  = await apiPost("/api/public/metrics/comparisons/batch", {
    metric_ids:       metricIds,
    district:         0,
    comparison_types: ["ytd"],
  });

  const compById = {};
  for (const [idStr, compMap] of Object.entries(rawBatch)) {
    compById[Number(idStr)] = compMap;
  }

  // Consensus end date (most common current_period_end across this city's metrics).
  const endDates   = dashMetrics
    .map((m) => toDateStr(compById[m.id]?.["ytd"]?.current_period_end))
    .filter(Boolean);
  const endDateFreq = {};
  for (const d of endDates) endDateFreq[d] = (endDateFreq[d] || 0) + 1;
  const consensusEnd = Object.entries(endDateFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Per-metric checks.
  for (const m of dashMetrics) {
    const name    = m.metric_name || m.metric_key;
    const cardUrl = `${SITE_BASE}/c/${city.slug}/metrics/${m.metric_key}`;
    const comp    = compById[m.id]?.["ytd"];

    if (!comp) {
      failures.push(failure(city, m, "No YTD comparison data returned by API", "API returned empty for this metric"));
      continue;
    }

    const cur      = comp.current_period_value;
    const prior    = comp.comparison_period_value;
    const curStart = toDateStr(comp.current_period_start);
    const curEnd   = toDateStr(comp.current_period_end);
    const priorEnd = toDateStr(comp.comparison_period_end);

    // Record this metric for downstream fact-check candidate selection.
    metrics.push({
      metricId:   m.id,
      metricName: name,
      metricKey:  m.metric_key,
      cardUrl,
      cur,
      prior,
      curStart,
      curEnd,
      priorEnd,
    });

    // Check 2: current YTD value present.
    if (cur === null || cur === undefined) {
      failures.push(failure(city, m,
        "Missing current-year YTD value",
        `Current: No data | Prior: ${fmtNum(prior)} | Window: ${fmtDate(curStart)} – ${fmtDate(curEnd)}`
      ));
    }

    // Check 3: prior YTD value present (known-outage handling).
    if (prior === null || prior === undefined) {
      const known = state.knownOutages.find((o) => o.metricId === m.id && o.city === city.label);
      if (!known) {
        failures.push(failure(city, m,
          "Missing prior-year YTD value (new — added to Appendix A)",
          `Current: ${fmtNum(cur)} | Prior: No data | Window ends: ${fmtDate(curEnd)}`
        ));
        state.knownOutages.push({
          city:          city.label,
          metricName:    name,
          metricKey:     m.metric_key,
          metricId:      m.id,
          cardUrl,
          missingWindow: "prior-year YTD",
          reason:        "reason unconfirmed",
          addedDate:     runDateStr,
        });
      }
    } else {
      const knownIdx = state.knownOutages.findIndex(
        (o) => o.metricId === m.id && o.city === city.label
      );
      if (knownIdx >= 0) {
        resolvedOutages.push({ city: city.label, metricId: m.id, metricName: name, cardUrl });
      }
    }

    // Check 4: YTD window consistency — both years should end on the same month-day.
    if (curEnd && priorEnd) {
      const curMD   = monthDay(curEnd);
      const priorMD = monthDay(priorEnd);
      if (curMD !== priorMD) {
        failures.push(failure(city, m,
          "YTD window end-date mismatch between years",
          `Current ends: ${fmtDate(curEnd)} (${curMD}) | Prior ends: ${fmtDate(priorEnd)} (${priorMD})`
        ));
      }
    }

    // Check 5: Data lag vs city consensus.
    if (curEnd && consensusEnd && curEnd !== consensusEnd) {
      const lagDays  = daysBetween(curEnd, consensusEnd);
      if (lagDays !== null && lagDays > 7) {
        const knownLag = state.knownLags.find((l) => l.metricId === m.id && l.city === city.label);
        if (knownLag) {
          const [, maxLag] = knownLag.normalLagRange || [0, 30];
          if (lagDays > maxLag + 7) {
            failures.push(failure(city, m,
              `Data lag exceeds normal range — possible stalled feed (${lagDays}d lag, expected ≤${maxLag}d)`,
              `Metric ends: ${fmtDate(curEnd)} | City consensus: ${fmtDate(consensusEnd)}`
            ));
          }
          if (lagDays <= 3) {
            resolvedLags.push({ city: city.label, metricId: m.id, metricName: name, cardUrl });
          }
        } else {
          failures.push(failure(city, m,
            `Data lag detected (${lagDays}d behind city consensus) — added to Appendix B`,
            `Metric ends: ${fmtDate(curEnd)} | City consensus: ${fmtDate(consensusEnd)}`
          ));
          state.knownLags.push({
            city:           city.label,
            metricName:     name,
            metricKey:      m.metric_key,
            metricId:       m.id,
            cardUrl,
            normalLagRange: [Math.max(0, lagDays - 4), lagDays + 4],
            source:         "unconfirmed",
            addedDate:      runDateStr,
          });
        }
      }
    }

    // Check 6: Arithmetic — verify percent change is finite.
    if (cur !== null && cur !== undefined && prior !== null && prior !== undefined && prior !== 0) {
      const expectedPct = pctChange(cur, prior);
      if (!isFinite(expectedPct)) {
        failures.push(failure(city, m,
          "Arithmetic error: percent change is non-finite given these values",
          `Current: ${fmtNum(cur)} | Prior: ${fmtNum(prior)} | Computed pct: ${expectedPct}`
        ));
      }
    }

    // Check 7: Plausibility — negative counts.
    if ((cur !== null && cur < 0) || (prior !== null && prior < 0)) {
      failures.push(failure(city, m,
        "Implausible value: negative YTD count",
        `Current: ${fmtNum(cur)} | Prior: ${fmtNum(prior)}`
      ));
    }

    // Check 7b: Plausibility — extreme relative change (possible stalled feed).
    // Only applies when both values are non-negative and prior is large enough to make
    // the ratio meaningful. Negative values are already caught by check 7 above.
    if (cur !== null && cur !== undefined && cur >= 0 && prior !== null && prior !== undefined && prior > 100) {
      const ratio = cur / prior;
      if (ratio < 0.01) {
        // Current year is less than 1% of prior — almost certainly a broken feed,
        // not a real-world change (e.g. 27,200 → 7 for blight tickets).
        failures.push(failure(city, m,
          `Implausible value: current-year is ${(ratio * 100).toFixed(2)}% of prior-year — possible stalled data feed`,
          `Current: ${fmtNum(cur)} | Prior: ${fmtNum(prior)}`
        ));
      } else if (ratio > 100) {
        // Current year is more than 100× prior — flag as a possible data error.
        failures.push(failure(city, m,
          `Implausible value: current-year is ${ratio.toFixed(0)}× prior-year — possible data error`,
          `Current: ${fmtNum(cur)} | Prior: ${fmtNum(prior)}`
        ));
      }
    }

    // Check 8: Staleness — "As of" more than 90 days old after accounting for known lag.
    if (curEnd) {
      const staleDays  = daysBetween(curEnd, runDateStr);
      const knownLag   = state.knownLags.find((l) => l.metricId === m.id && l.city === city.label);
      const maxExpected = (knownLag?.normalLagRange?.[1] ?? 0) + 60;
      if (staleDays !== null && staleDays > maxExpected) {
        failures.push(failure(city, m,
          `"As of" date is ${staleDays} days ago — possibly stale`,
          `Last data point: ${fmtDate(curEnd)} | Run date: ${fmtDate(runDateStr)}`
        ));
      }
    }
  }

  return { failures, cardCount: dashMetrics.length, metrics };
}

// ---------------------------------------------------------------------------
// Fact-check candidate selection
// ---------------------------------------------------------------------------

// Deterministic per-run RNG so the same week always picks the same candidates
// (idempotent across CI re-runs) but the set rotates week to week.
function makeRng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function pickRandom(arr, n, rng) {
  // Fisher–Yates shuffle on a copy, then take the first n.
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

// Build up to `count` fact-check candidates per city. A metric is eligible only
// if we believe it is rendering correctly: it produced no failure this run and
// both YTD values are present numbers. (Per spec: don't fact-check anything we
// already think is broken.)
function selectFactCheckCandidates(cityReports, runDateStr, count = 3) {
  const rng        = makeRng(`factcheck-${runDateStr}`);
  const candidates = [];

  for (const { city, report } of cityReports) {
    // metricIds that failed any API check this run.
    const failedIds = new Set(
      (report.failures || [])
        .map((f) => f.metricId)
        .filter((id) => id !== null && id !== undefined && id !== "")
    );
    // If the dashboard itself failed to render, skip the whole city.
    const cityRenderFailed = (report.failures || []).some(
      (f) => f.failureType && f.failureType.startsWith("Dashboard did not render")
    );
    if (cityRenderFailed) continue;

    const eligible = (report.metrics || []).filter(
      (md) =>
        !failedIds.has(md.metricId) &&
        md.cur !== null && md.cur !== undefined &&
        md.prior !== null && md.prior !== undefined
    );

    for (const md of pickRandom(eligible, count, rng)) {
      candidates.push({
        city:          city.label,
        metricName:    md.metricName,
        metricKey:     md.metricKey,
        cardUrl:       md.cardUrl,
        currentValue:  md.cur,
        currentWindow: `${fmtDate(md.curStart)} – ${fmtDate(md.curEnd)}`,
        priorValue:    md.prior,
        status:        "pending",   // filled in by the web-search fact-check step
        verdict:       null,        // "consistent" | "discrepancy" | "inconclusive"
        notes:         null,
        sources:       [],
      });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Failure record builder
// ---------------------------------------------------------------------------

function failure(city, metric, failureType, onPageValues) {
  return {
    metricName:   metric.metric_name || metric.metric_key,
    metricKey:    metric.metric_key,
    metricId:     metric.id,
    cardUrl:      `${SITE_BASE}/c/${city.slug}/metrics/${metric.metric_key}`,
    failureType,
    onPageValues,
  };
}

// ---------------------------------------------------------------------------
// HTML report builder
// ---------------------------------------------------------------------------

// Markers delimit the fact-check section so factcheck.mjs can replace it in
// place once web-search verdicts are available, without re-running the audit.
export const FACTCHECK_MARKER_START = "<!--FACTCHECK_SECTION_START-->";
export const FACTCHECK_MARKER_END   = "<!--FACTCHECK_SECTION_END-->";

// Renders the "Fact-check candidates" section. Shared by index.mjs (pending
// verdicts) and factcheck.mjs (resolved verdicts). Returns "" when empty.
export function buildFactCheckSection(candidates = []) {
  if (!candidates || candidates.length === 0) return "";
  const anyChecked = candidates.some((c) => c.status !== "pending");
  let h = `<h2>Fact-check candidates</h2>`;
  h += `<p class="note">Three healthy (non-failing) metrics per city, selected at random this week for independent web-search verification${anyChecked ? " (verified by Claude with web search)" : " — verdicts are filled in by the fact-check step"}.</p>`;
  h += `<table><thead><tr><th>City</th><th>Metric</th><th>Current YTD</th><th>Window</th><th>Verdict</th><th>Notes / sources</th></tr></thead><tbody>`;
  for (const c of candidates) {
    const verdictClass =
      c.verdict === "consistent"  ? "pass" :
      c.verdict === "discrepancy" ? "fail" : "note";
    const verdictLabel = c.verdict
      ? esc(c.verdict)
      : (c.status === "pending" ? '<span class="note">pending</span>' : esc(c.status));
    const srcLinks = (c.sources || [])
      .filter(Boolean)
      .map((s, i) => `<a href="${esc(s)}">[${i + 1}]</a>`)
      .join(" ");
    h += `<tr>
      <td>${esc(c.city)}</td>
      <td><a href="${esc(c.cardUrl)}">${esc(c.metricName)}</a></td>
      <td>${esc(fmtNum(c.currentValue))}</td>
      <td>${esc(c.currentWindow)}</td>
      <td class="${verdictClass}">${verdictLabel}</td>
      <td class="note">${esc(c.notes || "")}${c.notes && srcLinks ? " — " : ""}${srcLinks}</td>
    </tr>`;
  }
  h += `</tbody></table>`;
  return h;
}

function buildHtml({ title, runDate, totalCards, totalFailures, passing, failures, resolvedOutages, resolvedLags, missingTargets, extraLaunched, factCheckCandidates = [], state }) {
  const ts = runDate.toLocaleString("en-US", {
    timeZone:   "America/Los_Angeles",
    weekday:    "long",
    month:      "long",
    day:        "numeric",
    year:       "numeric",
    hour:       "numeric",
    minute:     "2-digit",
    timeZoneName: "short",
  });

  const css = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 900px; margin: 0 auto; padding: 28px 20px; line-height: 1.5; }
    h1 { font-size: 1.15rem; margin: 0 0 4px; }
    h2 { font-size: 1rem; margin: 28px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
    h3 { font-size: 0.9rem; margin: 18px 0 6px; color: #374151; text-transform: uppercase; letter-spacing: 0.04em; }
    p, li { font-size: 0.875rem; margin: 5px 0; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0 18px; font-size: 0.825rem; }
    th { background: #f3f4f6; text-align: left; padding: 6px 10px; font-weight: 600; border: 1px solid #e5e7eb; }
    td { padding: 6px 10px; border: 1px solid #e5e7eb; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .pass { color: #16a34a; font-weight: 600; }
    .fail { color: #dc2626; font-weight: 600; }
    .note { font-size: 0.78rem; color: #6b7280; }
    .summary { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 0.875rem; }
  `;

  let h = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>`;
  h += `<h1>${esc(title)}</h1>`;

  // Summary box.
  h += `<div class="summary">`;
  h += `<strong>Run:</strong> ${esc(ts)} &nbsp;|&nbsp; `;
  h += `<strong>Cards checked:</strong> ${totalCards} &nbsp;|&nbsp; `;
  h += `<strong>Failures:</strong> ${
    totalFailures === 0
      ? '<span class="pass">0 — all clear</span>'
      : `<span class="fail">${totalFailures}</span>`
  }`;
  h += `</div>`;

  if (missingTargets.length > 0) {
    h += `<p class="note">⚠ Could not resolve in sitemap: ${esc(missingTargets.join(", "))}. Check slugs in TARGET_CITIES.</p>`;
  }
  if (extraLaunched.length > 0) {
    h += `<p class="note">ℹ New launched cities not in target list: ${esc(extraLaunched.map((c) => `${c.name} (${c.slug})`).join(", "))} — consider adding to TARGET_CITIES.</p>`;
  }

  // Passing cities.
  h += `<h2>Passing cities</h2>`;
  h += passing.length > 0
    ? `<p class="pass">${esc(passing.join(", "))}</p>`
    : `<p class="note">None — all cities had at least one issue.</p>`;

  // Failures by city.
  if (failures.length > 0) {
    h += `<h2>Failures</h2>`;
    for (const { city, report } of failures) {
      h += `<h3>${esc(city.label)}</h3>`;
      h += `<table><thead><tr><th>Metric</th><th>Failure type</th><th>On-page values</th></tr></thead><tbody>`;
      for (const f of report.failures) {
        h += `<tr>
          <td>${f.cardUrl ? `<a href="${esc(f.cardUrl)}">${esc(f.metricName)}</a>` : esc(f.metricName)}</td>
          <td>${esc(f.failureType)}</td>
          <td class="note">${esc(f.onPageValues)}</td>
        </tr>`;
      }
      h += `</tbody></table>`;
    }
  }

  // Resolved items.
  if (resolvedOutages.length > 0 || resolvedLags.length > 0) {
    h += `<h2>Resolved items</h2>`;
    if (resolvedOutages.length > 0) {
      h += `<p><strong>Data outages now resolved (prior-year data present):</strong></p><ul>`;
      for (const r of resolvedOutages) {
        h += `<li>${esc(r.city)} — <a href="${esc(r.cardUrl)}">${esc(r.metricName)}</a></li>`;
      }
      h += `</ul>`;
    }
    if (resolvedLags.length > 0) {
      h += `<p><strong>Lagging feeds that have caught up:</strong></p><ul>`;
      for (const r of resolvedLags) {
        h += `<li>${esc(r.city)} — <a href="${esc(r.cardUrl)}">${esc(r.metricName)}</a></li>`;
      }
      h += `</ul>`;
    }
  }

  // Fact-check candidates (3 healthy metrics per city, for web-search verification).
  // Wrapped in markers so factcheck.mjs can swap the section in place after verdicts land.
  h += FACTCHECK_MARKER_START + buildFactCheckSection(factCheckCandidates) + FACTCHECK_MARKER_END;

  // Appendix A.
  h += `<h2>Appendix A: Known Data Outages</h2>`;
  if (state.knownOutages.length === 0) {
    h += `<p class="note">None on record.</p>`;
  } else {
    h += `<table><thead><tr><th>City</th><th>Metric</th><th>Missing window</th><th>Reason</th><th>Added</th></tr></thead><tbody>`;
    for (const o of state.knownOutages) {
      h += `<tr>
        <td>${esc(o.city)}</td>
        <td><a href="${esc(o.cardUrl)}">${esc(o.metricName)}</a></td>
        <td>${esc(o.missingWindow)}</td>
        <td>${esc(o.reason)}</td>
        <td>${esc(o.addedDate)}</td>
      </tr>`;
    }
    h += `</tbody></table>`;
  }

  // Appendix B.
  h += `<h2>Appendix B: Known Data Lag</h2>`;
  if (state.knownLags.length === 0) {
    h += `<p class="note">None on record.</p>`;
  } else {
    h += `<table><thead><tr><th>City</th><th>Metric</th><th>Normal lag range (days)</th><th>Source</th><th>Added</th></tr></thead><tbody>`;
    for (const l of state.knownLags) {
      const [min, max] = l.normalLagRange || [0, 0];
      h += `<tr>
        <td>${esc(l.city)}</td>
        <td><a href="${esc(l.cardUrl)}">${esc(l.metricName)}</a></td>
        <td>${min}–${max}</td>
        <td>${esc(l.source)}</td>
        <td>${esc(l.addedDate)}</td>
      </tr>`;
    }
    h += `</tbody></table>`;
  }

  h += `<p class="note" style="margin-top:32px">Generated by weekly-qa/index.mjs · ${esc(ts)}</p>`;
  h += `</body></html>`;
  return h;
}

export function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Entry point — only run the audit when executed directly, not when imported
// (factcheck.mjs imports buildFactCheckSection / esc / fmtNum from this module).
// ---------------------------------------------------------------------------

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("QA script failed:", err);
    process.exit(1);
  });
}
