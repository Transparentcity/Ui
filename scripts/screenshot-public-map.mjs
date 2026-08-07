import { chromium } from "playwright";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--")) continue;
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const url = args.url;
const output = args.output;
const width = Math.max(300, Number.parseInt(args.width || "800", 10) || 800);
const height = Math.max(200, Number.parseInt(args.height || "450", 10) || 450);
const isDark = (() => {
  try { return new URL(url).searchParams.get("theme") === "dark"; } catch { return false; }
})();
const bgColor = isDark ? "#0f172a" : "white";

if (!url || !output) {
  console.error("Usage: node screenshot-public-map.mjs --url <url> --output <file> [--width 800] [--height 450]");
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--disable-gpu-sandbox",
  ],
});

// Hosts that add request latency without contributing to the screenshot.
const BLOCKED_HOST_PATTERNS = [
  /(^|\.)googletagmanager\.com$/i,
  /(^|\.)google-analytics\.com$/i,
  /(^|\.)analytics\.google\.com$/i,
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)vercel-scripts\.com$/i,
  /(^|\.)vercel-insights\.com$/i,
  /(^|\.)vitals\.vercel-insights\.com$/i,
  /(^|\.)fonts\.googleapis\.com$/i,
  /(^|\.)fonts\.gstatic\.com$/i,
  /(^|\.)cdnjs\.cloudflare\.com$/i,
];
function shouldBlock(u) {
  try {
    return BLOCKED_HOST_PATTERNS.some((re) => re.test(new URL(u).hostname));
  } catch {
    return false;
  }
}

try {
  const page = await browser.newPage({
    viewport: {
      width: Math.max(width + 80, 1000),
      height: Math.max(height + 160, 900),
    },
    deviceScaleFactor: 2,
  });

  await page.route("**/*", (route, request) => {
    if (shouldBlock(request.url())) {
      route.abort().catch(() => {});
    } else {
      route.continue().catch(() => {});
    }
  });

  // domcontentloaded is fast and reliable; we then wait on application-level
  // signals. networkidle is unreliable for Mapbox because tile loading
  // restarts after the post-load fitBounds animation.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector(".mapboxgl-canvas", { timeout: 30000 });

  // Wait for the map page's explicit ready flag (set after the load handler
  // installs all sources/layers AND the map fires `idle`). Fall back to a
  // 2.5s settle if the page predates this signal.
  const readyOk = await page
    .waitForFunction(() => window.__tcMapReady === true, undefined, {
      timeout: 35000,
    })
    .then(() => true)
    .catch(() => false);
  if (!readyOk) {
    await page.waitForTimeout(2500);
  }

  await page.addStyleTag({
    content: `
      .map-header,
      .map-info,
      .map-meta,
      .embedded-header,
      .embedded-meta,
      .share-button-header,
      .map-bottom-panel,
      .map-source-card,
      .map-source-citation,
      .map-actions-card {
        display: none !important;
      }
      .multi-layer-panel input {
        display: none !important;
      }
      .multi-layer-panel {
        top: 12px !important;
        right: 12px !important;
        max-width: min(280px, calc(${width}px - 24px)) !important;
        pointer-events: none !important;
      }
      nextjs-portal,
      [data-next-badge-root],
      [data-next-mark],
      [id*="nextjs"],
      [class*="nextjs"],
      iframe {
        display: none !important;
      }
      .public-map-page,
      .map-article,
      .map-container-wrapper,
      .embedded-map-wrapper {
        margin: 0 !important;
        padding: 0 !important;
        max-width: none !important;
      }
      .map-container-wrapper,
      .embedded-map-wrapper {
        width: ${width}px !important;
        height: ${height}px !important;
        position: relative !important;
        overflow: hidden !important;
      }
      .map-container {
        width: ${width}px !important;
        height: ${height}px !important;
        border: none !important;
        border-radius: 0 !important;
      }
      body {
        margin: 0 !important;
        background: ${bgColor} !important;
      }
    `,
  });

  await page.evaluate(() => {
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event("resize"));
  });
  // Brief post-resize settle so tile re-renders complete before we capture.
  await page.waitForTimeout(750);

  let locator = page.locator(".map-container.embedded-map").first();
  if ((await locator.count()) === 0) {
    locator = page.locator(".map-container").first();
  }
  await locator.waitFor({ state: "visible", timeout: 10000 });
  await locator.screenshot({ path: output, type: "png" });
  console.log(output);
} finally {
  await browser.close();
}
