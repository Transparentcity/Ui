#!/usr/bin/env node
/**
 * Chart-render check.
 *
 * Charts on the public site are server-rendered images delivered via
 * /api/newsletter/public/visualization-image/... and embedded inside the
 * newsletter preview iframe on each /get/{slug} landing page. The platform
 * suite can't see whether they actually render — it only knows the data
 * exists. This verifies the rendered result.
 *
 * Per /get/{slug} page:
 *   CH1  the newsletter embed iframe is present and loads
 *   CH2  every chart/visualization/map image inside it renders
 *        (naturalWidth > 0, not a broken image)
 *   CH3  any top-level interactive chart (recharts surface / canvas) that
 *        is present has actually drawn (non-empty). Pages with no such
 *        chart pass — absence is not a failure.
 *
 * Usage:
 *   node scripts/qa/chart-render.mjs
 *   node scripts/qa/chart-render.mjs --slugs cincinnati,detroit
 *
 * Exits 1 on any finding, 0 on a clean run.
 */
import { chromium } from "playwright";

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
const SITE = args.site ?? "https://transparent.city";
const LAUNCHED = [
  "san-francisco", "oakland", "cincinnati", "chicago", "detroit",
  "austin", "new-york-city", "seattle", "denver",
];
const SLUGS = (args.slugs ? args.slugs.split(",") : LAUNCHED).map((s) => s.trim()).filter(Boolean);
const CHART_SRC_RE = /chart|visualization|graph|map/i;

const findings = [];
function record(rule, slug, ok, detail = "") {
  const status = ok ? "OK  " : "FAIL";
  console.log(`${status} ${rule}[${slug}]${detail ? ` — ${detail}` : ""}`);
  if (!ok) findings.push(`${rule}[${slug}]: ${detail}`);
}

async function checkSlug(browser, slug) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
  const page = await context.newPage();
  try {
    await page.goto(`${SITE}/get/${slug}`, { waitUntil: "domcontentloaded", timeout: 35000 });
    // Embed iframe loads its images after the parent settles.
    await page.waitForTimeout(5000);

    // CH1 + CH2 — newsletter embed iframe and its chart images.
    const embedFrame = page.frames().find((f) => f !== page.mainFrame() && /\/get\/|\/featured\/|\/embed/i.test(f.url()));
    if (!embedFrame) {
      // No embed iframe at all is itself suspicious for a /get page.
      record("CH1-embed-iframe", slug, false, "no newsletter embed iframe found on /get page");
    } else {
      record("CH1-embed-iframe", slug, true);
      try {
        const imgs = await embedFrame.evaluate(() =>
          [...document.images].map((i) => ({ src: i.currentSrc, w: i.naturalWidth, complete: i.complete })),
        );
        const charts = imgs.filter((i) => /chart|visualization|graph|map/i.test(i.src));
        const broken = charts.filter((c) => c.complete && c.w === 0);
        if (charts.length === 0) {
          // A weekly edition may legitimately have no charts; don't fail,
          // just say so.
          record("CH2-chart-images", slug, true, "embed has no chart images this edition (acceptable)");
        } else if (broken.length === 0) {
          record("CH2-chart-images", slug, true, `${charts.length} chart image(s) rendered`);
        } else {
          record(
            "CH2-chart-images",
            slug,
            false,
            `${broken.length}/${charts.length} chart image(s) broken; e.g. ${broken[0].src.slice(-50)}`,
          );
        }
      } catch (e) {
        record("CH2-chart-images", slug, false, `could not read embed iframe images: ${e.message}`);
      }
    }

    // CH3 — top-level interactive charts (recharts/canvas) must not be
    // empty if present.
    const topLevel = await page.evaluate(() => {
      const surfaces = [...document.querySelectorAll(".recharts-surface")];
      const emptySurfaces = surfaces.filter((s) => s.querySelectorAll("path,rect,circle,line,polyline").length === 0).length;
      const canvases = [...document.querySelectorAll("canvas")];
      const blankCanvases = canvases.filter((c) => c.width === 0 || c.height === 0).length;
      return { surfaces: surfaces.length, emptySurfaces, canvases: canvases.length, blankCanvases };
    });
    if (topLevel.emptySurfaces === 0 && topLevel.blankCanvases === 0) {
      record(
        "CH3-interactive-charts",
        slug,
        true,
        topLevel.surfaces + topLevel.canvases === 0
          ? "no interactive charts on page (ok)"
          : `${topLevel.surfaces} recharts + ${topLevel.canvases} canvas all drawn`,
      );
    } else {
      record(
        "CH3-interactive-charts",
        slug,
        false,
        `${topLevel.emptySurfaces} empty recharts surface(s), ${topLevel.blankCanvases} blank canvas(es)`,
      );
    }
  } catch (e) {
    record("CH0-page-load", slug, false, `failed: ${e.message}`);
  } finally {
    await context.close();
  }
}

console.log(`Checking charts on ${SLUGS.length} /get pages\n`);
const browser = await chromium.launch({ headless: true });
try {
  for (const slug of SLUGS) await checkSlug(browser, slug);
} finally {
  await browser.close();
}
console.error(`\n${findings.length} findings`);
process.exit(findings.length > 0 ? 1 : 0);
