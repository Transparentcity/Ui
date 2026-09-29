import { describe, expect, it } from "vitest";

import { buildResumeMessage, type InterruptedTurn } from "./chatResume";

const baseTurn: InterruptedTurn = {
  request: "Find overtime outliers in the Detroit payroll data",
  partialText: "So far I have found three departments with",
  completedToolCalls: [
    { tool_name: "search_datasets", arguments: { q: "payroll" }, response: { ids: [1, 2] }, success: true },
    { tool_name: "run_query", arguments: { sql: "select 1" }, response: "12 rows", success: true },
  ],
  pendingToolNames: ["run_query"],
};

describe("buildResumeMessage", () => {
  it("includes the request, tool calls, partial answer, and the user's text last", () => {
    const msg = buildResumeMessage(baseTurn, "continue");
    expect(msg).toContain(baseTurn.request);
    expect(msg).toContain("1. search_datasets");
    expect(msg).toContain('arguments: {"q":"payroll"}');
    expect(msg).toContain("2. run_query");
    expect(msg).toContain("result: 12 rows");
    expect(msg).toContain("no result received): run_query");
    expect(msg).toContain(baseTurn.partialText);
    expect(msg.endsWith("[End of context]\n\ncontinue")).toBe(true);
    // Tool calls come before the partial answer, in the order they ran.
    expect(msg.indexOf("search_datasets")).toBeLessThan(msg.indexOf("Answer text"));
  });

  it("truncates large tool results", () => {
    const big = "x".repeat(10_000);
    const msg = buildResumeMessage(
      { ...baseTurn, completedToolCalls: [{ tool_name: "run_query", response: big, success: true }] },
      "continue"
    );
    expect(msg.length).toBeLessThan(5000);
    expect(msg).toContain("[truncated");
  });

  it("drops the oldest tool calls first when over budget", () => {
    const calls = Array.from({ length: 40 }, (_, i) => ({
      tool_name: `tool_${i}`,
      response: "y".repeat(1400),
      success: true,
    }));
    const msg = buildResumeMessage({ ...baseTurn, completedToolCalls: calls }, "continue");
    expect(msg).toContain("tool_39");
    expect(msg).not.toContain("tool_0\n");
    expect(msg).toMatch(/Tool calls completed \(40\), oldest \d+ omitted for length:/);
    expect(msg.length).toBeLessThan(17_000);
  });
});
