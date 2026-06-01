#!/usr/bin/env node
/**
 * Build a one-page PDF summary of the UI QA sweep.
 *
 * Reads every *.log in $LOG_DIR (default /tmp/ui_qa_logs), parses the
 * OK / FAIL / GAP / SKIP lines emitted by each check, and renders a
 * compact HTML report via Playwright's PDF printer. No extra deps.
 *
 * Usage:
 *   node scripts/qa/build-pdf.mjs                                # default
 *   LOG_DIR=/tmp/ui_qa_logs node scripts/qa/build-pdf.mjs
 *   node scripts/qa/build-pdf.mjs --out qa_reports/ui-qa-2026-06-01.pdf
 */
import { chromium } from "playwright";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key?.startsWith("--")) continue;
    out[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const LOG_DIR = process.env.LOG_DIR ?? "/tmp/ui_qa_logs";
const today = process.env.QA_DATE ?? new Date().toISOString().slice(0, 10);
const DEFAULT_OUT = resolve("qa_reports", `ui-qa-${today}.pdf`);
const OUT = args.out ? resolve(args.out) : DEFAULT_OUT;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseLogLines(content) {
  const lines = content.split("\n");
  const items = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line) continue;
    const m = line.match(/^(OK|FAIL|GAP|SKIP)\s+(\S+)(?:\s+—\s+(.+))?$/);
    if (m) {
      items.push({ status: m[1], rule: m[2], detail: m[3] ?? "" });
    }
  }
  return items;
}

let stepFiles = [];
try {
  stepFiles = readdirSync(LOG_DIR)
    .filter((f) => f.endsWith(".log"))
    .sort();
} catch (e) {
  console.error(`Could not read ${LOG_DIR}: ${e.message}`);
  process.exit(2);
}

const steps = stepFiles.map((f) => {
  const name = f.replace(/\.log$/, "");
  const content = readFileSync(join(LOG_DIR, f), "utf8");
  const items = parseLogLines(content);
  const counts = { OK: 0, FAIL: 0, GAP: 0, SKIP: 0 };
  for (const it of items) counts[it.status] = (counts[it.status] || 0) + 1;
  return { name, items, counts };
});

const totals = { OK: 0, FAIL: 0, GAP: 0, SKIP: 0 };
for (const s of steps) for (const k of Object.keys(totals)) totals[k] += s.counts[k] || 0;
const allFails = steps.flatMap((s) =>
  s.items.filter((it) => it.status === "FAIL").map((it) => ({ step: s.name, ...it })),
);

function statusBadge(s) {
  const map = {
    OK: { bg: "#1f7a3a", fg: "#fff" },
    FAIL: { bg: "#b00020", fg: "#fff" },
    GAP: { bg: "#a67100", fg: "#fff" },
    SKIP: { bg: "#666", fg: "#fff" },
  };
  const c = map[s] ?? { bg: "#444", fg: "#fff" };
  return `<span style="background:${c.bg};color:${c.fg};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600">${s}</span>`;
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 24px; font-size: 11px; line-height: 1.4; }
  h1 { font-size: 18px; margin: 0 0 4px 0; }
  h2 { font-size: 13px; margin: 16px 0 6px 0; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { color: #555; font-size: 10px; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
  td, th { padding: 4px 6px; text-align: left; vertical-align: top; border-bottom: 1px solid #eee; font-size: 10px; }
  th { background: #f6f6f6; font-weight: 600; }
  .summary td { font-weight: 600; }
  .rule { font-family: ui-monospace, Menlo, monospace; font-size: 9.5px; }
  .detail { color: #444; font-size: 9.5px; }
  .fail-block { background: #fff3f3; padding: 8px 10px; border-left: 3px solid #b00020; margin-bottom: 8px; }
  .gap-block { background: #fff8e6; padding: 8px 10px; border-left: 3px solid #a67100; margin-bottom: 8px; font-size: 10px; }
  .step-name { font-family: ui-monospace, Menlo, monospace; }
  .pass-note { color: #1f7a3a; font-weight: 600; }
</style></head>
<body>
<h1>TransparentCity UI QA</h1>
<div class="meta">${escapeHtml(today)} · ${steps.length} steps · ${totals.OK} OK / ${totals.FAIL} FAIL / ${totals.GAP} GAP / ${totals.SKIP} SKIP</div>

<h2>Summary</h2>
<table class="summary">
  <tr><th>Step</th><th>OK</th><th>FAIL</th><th>GAP</th><th>SKIP</th></tr>
  ${steps
    .map(
      (s) => `
    <tr>
      <td class="step-name">${escapeHtml(s.name)}</td>
      <td>${s.counts.OK || 0}</td>
      <td style="color:${s.counts.FAIL ? "#b00020" : "#1a1a1a"}">${s.counts.FAIL || 0}</td>
      <td style="color:${s.counts.GAP ? "#a67100" : "#1a1a1a"}">${s.counts.GAP || 0}</td>
      <td>${s.counts.SKIP || 0}</td>
    </tr>`,
    )
    .join("")}
</table>

<h2>Failures (${allFails.length})</h2>
${
  allFails.length === 0
    ? '<div class="pass-note">No failures. Sweep clean.</div>'
    : allFails
        .map(
          (f) => `<div class="fail-block">
  ${statusBadge("FAIL")} <span class="rule">${escapeHtml(f.step)} · ${escapeHtml(f.rule)}</span>
  ${f.detail ? `<div class="detail">${escapeHtml(f.detail)}</div>` : ""}
</div>`,
        )
        .join("")
}

<h2>Known coverage gaps</h2>
${
  steps.flatMap((s) => s.items.filter((it) => it.status === "GAP")).length === 0
    ? '<div class="detail">None.</div>'
    : steps
        .flatMap((s) => s.items.filter((it) => it.status === "GAP").map((it) => ({ step: s.name, ...it })))
        .map(
          (g) => `<div class="gap-block">
  ${statusBadge("GAP")} <span class="rule">${escapeHtml(g.step)} · ${escapeHtml(g.rule)}</span>
  ${g.detail ? `<div class="detail">${escapeHtml(g.detail)}</div>` : ""}
</div>`,
        )
        .join("")
}

<h2>All checks</h2>
${steps
  .map(
    (s) => `
  <h3 style="font-size:11px;margin:10px 0 4px 0;font-family:ui-monospace,Menlo,monospace">${escapeHtml(s.name)}</h3>
  <table>
    <tr><th>Status</th><th>Rule</th><th>Detail</th></tr>
    ${
      s.items.length === 0
        ? '<tr><td colspan="3" class="detail">no parseable output</td></tr>'
        : s.items
            .map(
              (it) => `<tr>
        <td>${statusBadge(it.status)}</td>
        <td class="rule">${escapeHtml(it.rule)}</td>
        <td class="detail">${escapeHtml(it.detail).slice(0, 240)}</td>
      </tr>`,
            )
            .join("")
    }
  </table>`,
  )
  .join("")}
</body></html>`;

mkdirSync(dirname(OUT), { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.pdf({
    path: OUT,
    format: "Letter",
    margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
    printBackground: true,
  });
} finally {
  await browser.close();
}

console.log(`Wrote ${OUT}`);
console.log(
  `Steps: ${steps.length} · OK ${totals.OK} · FAIL ${totals.FAIL} · GAP ${totals.GAP} · SKIP ${totals.SKIP}`,
);
