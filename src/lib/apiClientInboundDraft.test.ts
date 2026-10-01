import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draftInboundEmailReply } from "./apiClient";

/**
 * Seymour drafting runs a full tool loop that can outlast the proxy's read
 * timeout, so the UI queues a job and polls it instead of holding one request
 * open. These tests cover the job flow, the fallback to the synchronous route,
 * and that an nginx HTML error page is not shown to the admin verbatim.
 */

const DRAFT = {
  draft: "Hi Sharky,",
  model_key: "m",
  input_tokens: 1,
  output_tokens: 1,
  cost_usd: 0,
  cumulative_input_tokens: 1,
  cumulative_output_tokens: 1,
  cumulative_cost_usd: 0,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function urls(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

describe("draftInboundEmailReply", () => {
  it("queues a draft job and returns the job result once it completes", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ job_id: "job_1", email_id: 116 }))
      .mockResolvedValueOnce(json({ job_id: "job_1", status: "running" }))
      .mockResolvedValueOnce(
        json({ job_id: "job_1", status: "completed", result: DRAFT })
      );

    const pending = draftInboundEmailReply(116, { instruction: "short" }, "t");
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toEqual(DRAFT);
    expect(urls()[0]).toContain("/api/admin/inbound-email/116/draft-job");
    expect(urls().slice(1).every((u) => u.includes("/api/jobs/job_1"))).toBe(true);
  });

  it("surfaces the job's error message when drafting fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ job_id: "job_2" }))
      .mockResolvedValueOnce(
        json({
          job_id: "job_2",
          status: "failed",
          error_message: "Seymour returned an empty draft",
        })
      );

    const pending = draftInboundEmailReply(116, {}, "t");
    const assertion = expect(pending).rejects.toThrow("Seymour returned an empty draft");
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("falls back to the synchronous route when the backend lacks /draft-job", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ detail: "Not Found" }, 404))
      .mockResolvedValueOnce(json(DRAFT));

    await expect(draftInboundEmailReply(116, {}, "t")).resolves.toEqual(DRAFT);
    expect(urls()[1]).toMatch(/\/api\/admin\/inbound-email\/116\/draft$/);
  });

  it("does not fall back when the email itself is missing", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ detail: "InboundEmail id=116 not found" }, 404)
    );

    await expect(draftInboundEmailReply(116, {}, "t")).rejects.toThrow(
      "InboundEmail id=116 not found"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("strips the HTML from an nginx gateway error", async () => {
    const nginx =
      "<html>\r\n<head><title>504 Gateway Time-out</title></head>\r\n<body>\r\n" +
      "<center><h1>504 Gateway Time-out</h1></center>\r\n<hr><center>nginx/1.18.0 (Ubuntu)</center>\r\n" +
      "</body>\r\n</html>\r\n" +
      "<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n".repeat(6);
    fetchMock.mockResolvedValueOnce(
      new Response(nginx, { status: 504, headers: { "Content-Type": "text/html" } })
    );

    const err = await draftInboundEmailReply(116, {}, "t").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("<");
    expect((err as Error).message).not.toContain("padding");
    expect((err as Error).message).toContain("504 Gateway Time-out");
  });
});
