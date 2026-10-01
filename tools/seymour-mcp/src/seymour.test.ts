import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "./config.js";
import { TokenProvider } from "./auth.js";
import { SeymourClient } from "./seymour.js";

function fakeProvider(token = "tok"): TokenProvider {
  const p = Object.create(TokenProvider.prototype) as TokenProvider;
  (p as unknown as { getAccessToken: () => Promise<string> }).getAccessToken = async () => token;
  (p as unknown as { invalidate: () => void }).invalidate = () => {};
  return p;
}

test("ask creates a session with tool groups then sends the message", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (url.includes("/api/chat/new")) {
      return new Response(JSON.stringify({ session_id: "s1", title: "", message_count: 0, created_at: "", is_active: true }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ response: "hi", session_id: "s1", tool_calls: [], execution_time_ms: 5, success: true }),
      { status: 200 }
    );
  };
  const config = loadConfig({ SEYMOUR_AUTH0_CLIENT_ID: "abc" });
  const client = new SeymourClient(config, fakeProvider(), fetchImpl);
  const r = await client.ask({ message: "hello" });

  assert.equal(r.created_session, true);
  assert.equal(r.session_id, "s1");
  assert.equal(calls.length, 2);
  const newUrl = new URL(calls[0].url);
  assert.equal(newUrl.pathname, "/api/chat/new");
  assert.equal(newUrl.searchParams.get("model_key"), "claude-sonnet-5.5");
  assert.deepEqual(newUrl.searchParams.getAll("tool_groups"), ["core", "research", "web_search"]);
  const headers = calls[1].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), {
    message: "hello",
    session_id: "s1",
    model_key: "claude-sonnet-5.5",
    tool_groups: ["core", "research", "web_search"],
  });
});

test("ask reuses an existing session and skips session creation", async () => {
  let created = 0;
  const fetchImpl: typeof fetch = async (input) => {
    if (String(input).includes("/api/chat/new")) created++;
    return new Response(
      JSON.stringify({ response: "ok", session_id: "keep", tool_calls: [], execution_time_ms: 1, success: true }),
      { status: 200 }
    );
  };
  const config = loadConfig({ SEYMOUR_AUTH0_CLIENT_ID: "abc" });
  const client = new SeymourClient(config, fakeProvider(), fetchImpl);
  const r = await client.ask({ message: "again", sessionId: "keep" });
  assert.equal(created, 0);
  assert.equal(r.created_session, false);
});

test("non-2xx responses surface status and body", async () => {
  const fetchImpl: typeof fetch = async () => new Response("boom", { status: 503 });
  const config = loadConfig({ SEYMOUR_AUTH0_CLIENT_ID: "abc" });
  const client = new SeymourClient(config, fakeProvider(), fetchImpl);
  await assert.rejects(client.listSessions(), /503: boom/);
});
