import { describe, expect, it } from "vitest";

import {
  appendChatStreamEvent,
  mergeConsecutiveThinkingEvents,
} from "./chatStreamEvents";

describe("appendChatStreamEvent", () => {
  it("merges consecutive thinking tokens", () => {
    const first = appendChatStreamEvent([], {
      type: "thinking",
      content: "Need ",
      timestamp: "1",
    });
    const second = appendChatStreamEvent(first, {
      type: "thinking",
      content: "the metric.",
      timestamp: "2",
    });

    expect(second).toEqual([
      { type: "thinking", content: "Need the metric.", timestamp: "2" },
    ]);
  });

  it("keeps a new thinking block after a tool call", () => {
    const events = appendChatStreamEvent(
      [
        { type: "thinking", content: "First look" },
        { type: "tool_call_start", tool_id: "t1" },
      ],
      { type: "thinking", content: "Now edit" }
    );

    expect(events).toHaveLength(3);
    expect(events[2].content).toBe("Now edit");
  });
});

describe("mergeConsecutiveThinkingEvents", () => {
  it("joins uncoalesced thinking events from older sessions", () => {
    const merged = mergeConsecutiveThinkingEvents([
      { type: "thinking", content: "A" },
      { type: "thinking", content: "B" },
      { type: "text_response", content: "Hi" },
    ]);

    expect(merged).toEqual([
      { type: "thinking", content: "AB" },
      { type: "text_response", content: "Hi" },
    ]);
  });
});
