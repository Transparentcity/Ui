import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { isExpired, readTokens, writeTokens, deleteTokens, REFRESH_SKEW_MS } from "./tokenStore.js";
import { loadConfig, normalizeAudience } from "./config.js";

const sample = {
  access_token: "a",
  refresh_token: "r",
  expires_at: Date.now() + 3_600_000,
  client_id: "cid",
  audience: "https://api.transparent.city/api",
};

test("isExpired honours the refresh skew", () => {
  const now = 1_000_000;
  assert.equal(isExpired({ ...sample, expires_at: now + REFRESH_SKEW_MS + 1 }, now), false);
  assert.equal(isExpired({ ...sample, expires_at: now + REFRESH_SKEW_MS }, now), true);
  assert.equal(isExpired({ ...sample, expires_at: now - 1 }, now), true);
});

test("writeTokens stores 0600 and readTokens round-trips", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "seymour-mcp-"));
  const p = path.join(dir, "nested", "tokens.json");
  await writeTokens(p, sample);
  const stat = await fs.stat(p);
  assert.equal(stat.mode & 0o777, 0o600);
  assert.deepEqual(await readTokens(p), sample);
  assert.equal(await deleteTokens(p), true);
  assert.equal(await deleteTokens(p), false);
  assert.equal(await readTokens(p), null);
});

test("readTokens rejects malformed files", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "seymour-mcp-"));
  const p = path.join(dir, "tokens.json");
  await fs.writeFile(p, JSON.stringify({ access_token: "a" }));
  assert.equal(await readTokens(p), null);
});

test("normalizeAudience appends /api to the bare API host", () => {
  assert.equal(normalizeAudience("https://api.transparent.city"), "https://api.transparent.city/api");
  assert.equal(normalizeAudience("https://api.transparent.city/api/"), "https://api.transparent.city/api");
  assert.equal(normalizeAudience("https://other.example/x"), "https://other.example/x");
});

test("loadConfig applies defaults and env overrides", () => {
  const c = loadConfig({ SEYMOUR_AUTH0_CLIENT_ID: "abc" });
  assert.equal(c.auth0Domain, "auth.transparent.city");
  assert.equal(c.apiBase, "https://api.transparent.city");
  assert.deepEqual(c.defaultToolGroups, ["core", "research", "web_search"]);
  assert.equal(c.requestTimeoutMs, 300_000);

  const o = loadConfig({
    SEYMOUR_AUTH0_CLIENT_ID: "abc",
    SEYMOUR_AUTH0_DOMAIN: "https://tenant.us.auth0.com/",
    SEYMOUR_API_BASE: "http://localhost:8001/",
    SEYMOUR_DEFAULT_TOOL_GROUPS: "core, foia",
    SEYMOUR_REQUEST_TIMEOUT_MS: "1000",
  });
  assert.equal(o.auth0Domain, "tenant.us.auth0.com");
  assert.equal(o.apiBase, "http://localhost:8001");
  assert.deepEqual(o.defaultToolGroups, ["core", "foia"]);
  assert.equal(o.requestTimeoutMs, 1000);
});
