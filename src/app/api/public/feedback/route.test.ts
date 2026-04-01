import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the database client
const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({ insert: mockInsert }));
vi.mock("@/lib/db", () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown, headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/public/feedback", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

describe("POST /api/public/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it("returns 400 when pageUrl is missing", async () => {
    const res = await POST(makeRequest({ feedbackType: "accurate" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/pageUrl/);
  });

  it("returns 400 when feedbackType is missing", async () => {
    const res = await POST(makeRequest({ pageUrl: "/c/sf" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid feedbackType", async () => {
    const res = await POST(
      makeRequest({ pageUrl: "/c/sf", feedbackType: "maybe" })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/accurate.*wrong/);
  });

  it("inserts feedback and returns 200 on success", async () => {
    const res = await POST(
      makeRequest({
        pageUrl: "/c/sf",
        feedbackType: "accurate",
        explanation: "Looks right",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(mockFrom).toHaveBeenCalledWith("page_feedback");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        page_url: "/c/sf",
        feedback_type: "accurate",
        explanation: "Looks right",
      })
    );
  });

  it("truncates explanation to 2000 chars", async () => {
    const longExplanation = "x".repeat(3000);
    await POST(
      makeRequest({
        pageUrl: "/c/sf",
        feedbackType: "wrong",
        explanation: longExplanation,
      })
    );
    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.explanation.length).toBe(2000);
  });

  it("truncates submitterName to 200 and submitterEmail to 320 chars", async () => {
    await POST(
      makeRequest({
        pageUrl: "/c/sf",
        feedbackType: "accurate",
        submitterName: "n".repeat(500),
        submitterEmail: "e".repeat(500),
      })
    );
    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.submitter_name.length).toBe(200);
    expect(insertArg.submitter_email.length).toBe(320);
  });

  it("extracts IP from x-forwarded-for header", async () => {
    await POST(
      makeRequest(
        { pageUrl: "/c/sf", feedbackType: "accurate" },
        { "x-forwarded-for": "1.2.3.4, 5.6.7.8" }
      )
    );
    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.ip_address).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    await POST(
      makeRequest(
        { pageUrl: "/c/sf", feedbackType: "accurate" },
        { "x-real-ip": "10.0.0.1" }
      )
    );
    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.ip_address).toBe("10.0.0.1");
  });

  it("returns 500 when DB insert fails", async () => {
    mockInsert.mockResolvedValue({ error: { message: "db down" } });
    const res = await POST(
      makeRequest({ pageUrl: "/c/sf", feedbackType: "accurate" })
    );
    expect(res.status).toBe(500);
  });

  it("returns 500 on malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/public/feedback", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("sets null for empty optional fields", async () => {
    await POST(
      makeRequest({
        pageUrl: "/c/sf",
        feedbackType: "accurate",
        submitterName: "",
        submitterEmail: "",
      })
    );
    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.submitter_name).toBeNull();
    expect(insertArg.submitter_email).toBeNull();
  });
});
