/**
 * Tests for the /api/city-suggestion API route.
 *
 * Covers behavior added in fc47f96 (form-error fix + API hardening):
 * - isAllowedOrigin: URL-parsed protocol/host comparison, www tolerance,
 *   localhost + .vercel.app allow-listing, malformed origin rejection.
 * - POST handler:
 *   - 403 on disallowed origin
 *   - 400 on missing required fields
 *   - 502 with safe error text when sendEmail throws (previously crashed)
 *   - 502 with safe error text when sendEmail returns success: false
 *   - replyTo is dropped when the user-supplied email is malformed
 *   - replyTo is forwarded when the email is well-formed
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

// ---- Mocks ----------------------------------------------------------------

const mockSendEmail = vi.fn();
vi.mock("@/lib/email-sender", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  isSendGridConfigured: () => true,
}));

vi.mock("@/lib/siteUrl", () => ({
  getSiteOrigin: () => "https://transparent.city",
}));

// ---- Helpers ---------------------------------------------------------------

import { POST, isAllowedOrigin } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://transparent.city/api/city-suggestion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://transparent.city",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// ---- Tests -----------------------------------------------------------------

describe("isAllowedOrigin", () => {
  const SITE = "https://transparent.city";

  it("allows the configured site origin", () => {
    expect(isAllowedOrigin("https://transparent.city", SITE)).toBe(true);
  });

  it("allows the www variant of the site origin", () => {
    expect(isAllowedOrigin("https://www.transparent.city", SITE)).toBe(true);
  });

  it("allows the bare host when site origin uses www", () => {
    expect(isAllowedOrigin("https://transparent.city", "https://www.transparent.city")).toBe(true);
  });

  it("allows localhost dev origins on any port and protocol", () => {
    expect(isAllowedOrigin("http://localhost:3000", SITE)).toBe(true);
    expect(isAllowedOrigin("http://localhost:8080", SITE)).toBe(true);
  });

  it("allows Vercel preview deployments", () => {
    expect(isAllowedOrigin("https://ui-git-feature-foo.vercel.app", SITE)).toBe(true);
  });

  it("rejects an unrelated origin", () => {
    expect(isAllowedOrigin("https://evil.example.com", SITE)).toBe(false);
  });

  it("rejects a host that merely has the site origin as a prefix", () => {
    // The old loose .startsWith() check would have allowed this.
    expect(isAllowedOrigin("https://transparent.city.evil.com", SITE)).toBe(false);
  });

  it("rejects a malformed origin string", () => {
    expect(isAllowedOrigin("not-a-url", SITE)).toBe(false);
  });

  it("rejects an http origin when the site origin requires https", () => {
    expect(isAllowedOrigin("http://transparent.city", SITE)).toBe(false);
  });

  it("treats an empty origin as allowed (server-to-server / non-CORS)", () => {
    expect(isAllowedOrigin("", SITE)).toBe(true);
  });
});

describe("POST /api/city-suggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue({ success: true, messageId: "msg-1" });
  });

  it("returns 403 when origin is not allowed", async () => {
    const req = makeRequest(
      { kind: "add", city: "Oakland, CA" },
      { origin: "https://evil.example.com" },
    );

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Forbidden");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when city is missing", async () => {
    const req = makeRequest({ kind: "add" });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/city is required/i);
  });

  it("returns 400 when kind is improve and email is missing", async () => {
    const req = makeRequest({ kind: "improve", city: "Oakland, CA" });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/email is required/i);
  });

  it("returns 502 with a safe message when sendEmail throws", async () => {
    mockSendEmail.mockRejectedValueOnce(new Error("boom: SendGrid SDK exploded"));

    const req = makeRequest({
      kind: "add",
      city: "Oakland, CA",
      email: "user@example.com",
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toMatch(/could not send your submission/i);
    // Internal error text must not leak to the client.
    expect(data.error).not.toContain("SendGrid SDK exploded");
  });

  it("returns 502 with a safe message when sendEmail returns success: false", async () => {
    mockSendEmail.mockResolvedValueOnce({ success: false, error: "internal SendGrid 401 details" });

    const req = makeRequest({
      kind: "add",
      city: "Oakland, CA",
      email: "user@example.com",
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toMatch(/could not send your submission/i);
    expect(data.error).not.toContain("401");
  });

  it("forwards a well-formed user email as replyTo", async () => {
    const req = makeRequest({
      kind: "add",
      city: "Oakland, CA",
      email: "real.user@example.com",
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({
      replyTo: "real.user@example.com",
    });
  });

  it("does not pass a malformed email to SendGrid as replyTo", async () => {
    const req = makeRequest({
      kind: "add",
      city: "Oakland, CA",
      email: "not an email",
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].replyTo).toBeUndefined();
  });

  it("returns 200 with the message id on success", async () => {
    const req = makeRequest({
      kind: "add",
      city: "Oakland, CA",
      email: "user@example.com",
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ sent: true, messageId: "msg-1" });
  });
});
