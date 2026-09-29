import { describe, expect, it } from "vitest";

import { buildConversationTranscript } from "./chatTranscript";

const now = new Date("2026-09-29T10:00:00Z");

describe("buildConversationTranscript", () => {
  it("writes every turn with the tools each reply used", () => {
    const text = buildConversationTranscript(
      [
        { role: "user", content: "How many potholes were filled in Oakland?" },
        {
          role: "assistant",
          content: "raw content with tool noise",
          tool_calls: [{ tool_name: "get_metric_data", success: true }],
          intermediate_events: [
            { type: "tool_call_start", tool_name: "get_metric_data" },
            { type: "text_response", content: "About 12,000 " },
            { type: "text_response", content: "last year." },
          ],
        },
      ],
      { title: "**Oakland potholes**", now, sessionId: "abc" }
    );
    expect(text.startsWith("# Oakland potholes\n")).toBe(true);
    expect(text).toContain("Session: abc");
    expect(text).toContain("## You\nHow many potholes were filled in Oakland?");
    expect(text).toContain("## Seymour\nTools used: get_metric_data\nAbout 12,000 last year.");
    expect(text).not.toContain("raw content with tool noise");
  });

  it("prefers the public link over the session id", () => {
    const text = buildConversationTranscript([{ role: "user", content: "hi" }], {
      link: "https://transparent.city/chat/nySagXDw",
      sessionId: "abc",
      now,
    });
    expect(text).toContain("Link: https://transparent.city/chat/nySagXDw");
    expect(text).not.toContain("Session: abc");
  });

  it("appends the cut-off reply's work and how to continue", () => {
    const text = buildConversationTranscript(
      [
        { role: "user", content: "Write the District 2 report" },
        { role: "assistant", content: "So far", intermediate_events: [{ type: "text_response", content: "So far" }] },
      ],
      {
        now,
        interruptedTurn: {
          request: "Write the District 2 report",
          partialText: "So far",
          completedToolCalls: [{ tool_name: "run_query", arguments: { q: 1 }, response: "9 rows", success: true }],
          pendingToolNames: ["get_map"],
        },
      }
    );
    expect(text).toContain("cut off by a connection timeout");
    expect(text).toContain("## Work from the cut-off reply");
    expect(text).toContain("1. run_query");
    expect(text).toContain("result: 9 rows");
    expect(text).toContain("no result received): get_map");
    expect(text).toContain("Continue where this left off");
  });

  it("keeps error bubbles and skips empty assistant placeholders", () => {
    const text = buildConversationTranscript(
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "" },
        { role: "assistant", content: "Stream request failed: 500", isError: true },
      ],
      { now }
    );
    expect(text).toContain("## Seymour (error)\nStream request failed: 500");
    expect(text.match(/## Seymour/g)?.length).toBe(1);
  });
});
