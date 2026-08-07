#!/usr/bin/env node
/**
 * Persistent Playwright screenshot worker.
 *
 * Long-running HTTP service that holds a single headless Chromium open and
 * reuses it across screenshot requests. Reusing the browser keeps the HTTP
 * cache, TLS sessions, and DNS warm so repeat renders against the same map
 * page take seconds instead of tens of seconds.
 *
 * Endpoints:
 *   GET  /health                 -> 200 "ok"
 *   POST /screenshot             -> image/png body of the captured map element
 *
 * Request body for /screenshot (JSON):
 *   {
 *     "url":           "http://localhost:3001/m/<hash>",   // required
 *     "width":         800,                                  // optional
 *     "height":        450,                                  // optional
 *     "timeout_ms":    45000,                                // optional, full budget
 *     "settle_ms":     750                                   // optional, post-ready pause
 *   }
 *
 * Lifecycle:
 *   - Listens on 127.0.0.1:$SCREENSHOT_WORKER_PORT (default 3099).
 *   - Polls its parent pid every 2s. If the parent dies (uvicorn reload kills
 *     the child Python that spawned us), the worker exits so the next reload
 *     can rebind the port cleanly.
 */

import http from "node:http";
import { chromium } from "playwright";

const PORT = Number.parseInt(process.env.SCREENSHOT_WORKER_PORT || "3099", 10);
const HOST = process.env.SCREENSHOT_WORKER_HOST || "127.0.0.1";
const PARENT_PID = Number.parseInt(process.env.SCREENSHOT_WORKER_PARENT_PID || "0", 10);

let browserPromise = null;
let activeRequests = 0;

const HIDE_CHROME_CSS = (width, height) => `
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
  body { margin: 0 !important; background: var(--screenshot-bg, white) !important; }
`;

// Hosts whose requests add latency but contribute nothing to the screenshot.
// Aborting them shaves several seconds off cold renders.
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

function shouldBlock(url) {
  try {
    const u = new URL(url);
    return BLOCKED_HOST_PATTERNS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: [
          "--use-angle=swiftshader",
          "--use-gl=angle",
          "--ignore-gpu-blocklist",
          "--enable-webgl",
          "--disable-gpu-sandbox",
        ],
      })
      .then((browser) => {
        // If the browser ever dies (crash / OOM), drop the cached promise so
        // the next request relaunches.
        browser.on("disconnected", () => {
          if (browserPromise && browserPromise.then) {
            browserPromise = null;
          }
        });
        return browser;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

async function capture(params) {
  const url = params.url;
  if (!url || typeof url !== "string") {
    throw new Error("url is required");
  }
  const width = Math.max(300, Number.parseInt(params.width ?? 800, 10) || 800);
  const height = Math.max(200, Number.parseInt(params.height ?? 450, 10) || 450);
  const timeoutMs = Math.max(
    1000,
    Number.parseInt(params.timeout_ms ?? 45000, 10) || 45000,
  );
  const settleMs = Math.max(
    0,
    Number.parseInt(params.settle_ms ?? 750, 10) || 0,
  );

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: {
      width: Math.max(width + 80, 1000),
      height: Math.max(height + 160, 900),
    },
    deviceScaleFactor: 2,
  });
  let renderedPng;
  try {
    const page = await context.newPage();
    // Abort third-party requests that don't contribute to the screenshot.
    await page.route("**/*", (route, request) => {
      if (shouldBlock(request.url())) {
        route.abort().catch(() => {});
      } else {
        route.continue().catch(() => {});
      }
    });

    // Use domcontentloaded (cheap) and then wait on application-level signals.
    // networkidle is unreliable for Mapbox: tile loading restarts after the
    // post-load fitBounds animation, so networkidle never sticks.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    // The mapbox canvas must exist before we can do anything.
    await page.waitForSelector(".mapboxgl-canvas", { timeout: timeoutMs });

    // Prefer the explicit ready flag the public map page sets when mapbox
    // fires `idle`. Fall back to a 2.5s settle if the flag never appears
    // (older versions of the page).
    const readyOk = await page
      .waitForFunction(() => window.__tcMapReady === true, undefined, {
        timeout: Math.max(2000, timeoutMs - 5000),
      })
      .then(() => true)
      .catch(() => false);
    if (!readyOk) {
      await page.waitForTimeout(2500);
    }

    // Detect theme from URL query param and set CSS variable before injecting styles.
    const isDark = (() => {
      try { return new URL(url).searchParams.get("theme") === "dark"; } catch { return false; }
    })();
    const bgColor = isDark ? "#0f172a" : "white";
    await page.addStyleTag({
      content: HIDE_CHROME_CSS(width, height).replace(
        "var(--screenshot-bg, white)",
        bgColor,
      ),
    });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event("resize"));
    });
    if (settleMs > 0) {
      await page.waitForTimeout(settleMs);
    }

    let locator = page.locator(".map-container.embedded-map").first();
    if ((await locator.count()) === 0) {
      locator = page.locator(".map-container").first();
    }
    await locator.waitFor({ state: "visible", timeout: 10000 });
    renderedPng = await locator.screenshot({ type: "png" });
  } finally {
    await context.close().catch(() => {});
  }
  return renderedPng;
}

function readJsonBody(req, limit = 1024 * 64) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8") || "{}";
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`invalid JSON body: ${err.message}`));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.statusCode = 200;
    res.setHeader("content-type", "text/plain");
    res.end("ok");
    return;
  }
  if (req.method === "POST" && req.url === "/screenshot") {
    activeRequests += 1;
    let params;
    try {
      params = await readJsonBody(req);
    } catch (err) {
      activeRequests -= 1;
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
    try {
      const png = await capture(params);
      res.statusCode = 200;
      res.setHeader("content-type", "image/png");
      res.setHeader("content-length", png.length);
      res.end(png);
    } catch (err) {
      const detail = err && err.message ? err.message : String(err);
      // 504 for client-side timeouts, 500 otherwise.
      res.statusCode = /timeout|timed out/i.test(detail) ? 504 : 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: detail }));
    } finally {
      activeRequests -= 1;
    }
    return;
  }
  res.statusCode = 404;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, HOST, () => {
  console.error(
    `[screenshot-worker] listening on http://${HOST}:${PORT} (parent pid=${PARENT_PID || "n/a"})`,
  );
});
server.on("error", (err) => {
  console.error(`[screenshot-worker] server error: ${err && err.message}`);
  process.exit(1);
});

async function shutdown(reason) {
  console.error(`[screenshot-worker] shutting down (${reason})`);
  try {
    server.close();
  } catch {}
  try {
    const browser = browserPromise ? await browserPromise.catch(() => null) : null;
    if (browser) {
      await browser.close().catch(() => {});
    }
  } catch {}
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Watchdog: exit if the parent we were spawned by goes away (uvicorn reload
// kills the Python child that owns us). This prevents orphaned workers from
// holding port 3099 across reloads.
if (PARENT_PID > 0) {
  setInterval(() => {
    try {
      process.kill(PARENT_PID, 0);
    } catch {
      shutdown(`parent ${PARENT_PID} gone`);
    }
  }, 2000).unref();
}
