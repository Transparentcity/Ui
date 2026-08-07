import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteMap,
  deleteResearch,
  exportAdminMetrics,
  exportWasteFindings,
  uploadAvatar,
} from "./apiClient";
import { clearImpersonation, setImpersonation } from "./impersonation";

const TOKEN = "test-token";
const IMPERSONATION_HEADER = "X-Impersonate-User-Id";

/**
 * Stub `fetch` and expose the headers of the call it received.
 *
 * The hand-rolled call sites pass a plain object rather than a `Headers`
 * instance, so normalize through `Headers` to get case-insensitive lookup.
 */
function stubFetch(response: () => Response) {
  const spy = vi.fn(async () => response());
  vi.stubGlobal("fetch", spy);
  return {
    headers(): Headers {
      expect(spy).toHaveBeenCalledOnce();
      const init = spy.mock.calls[0][1] as RequestInit | undefined;
      return new Headers(init?.headers as HeadersInit);
    },
  };
}

const jsonOk = () =>
  new Response(JSON.stringify({ success: true, picture_url: "/a.png" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const noContent = () => new Response(null, { status: 204 });

const blobOk = () => new Response(new Blob(["x"]), { status: 200 });

describe("apiClient impersonation headers", () => {
  beforeEach(() => {
    clearImpersonation();
  });

  afterEach(() => {
    clearImpersonation();
    vi.unstubAllGlobals();
  });

  describe("user-scoped hand-rolled fetches", () => {
    it("deleteMap sends the impersonation header during a proxy session", async () => {
      setImpersonation(4242, "proxied@example.com");
      const fetchStub = stubFetch(noContent);

      await deleteMap(7, TOKEN);

      const headers = fetchStub.headers();
      expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.get(IMPERSONATION_HEADER)).toBe("4242");
    });

    it("deleteMap omits the impersonation header when not impersonating", async () => {
      const fetchStub = stubFetch(noContent);

      await deleteMap(7, TOKEN);

      const headers = fetchStub.headers();
      expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.has(IMPERSONATION_HEADER)).toBe(false);
    });

    it("deleteResearch sends the impersonation header during a proxy session", async () => {
      setImpersonation(99, "proxied@example.com");
      const fetchStub = stubFetch(noContent);

      await deleteResearch(31, TOKEN);

      const headers = fetchStub.headers();
      expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.get(IMPERSONATION_HEADER)).toBe("99");
    });

    it("deleteResearch omits the impersonation header when not impersonating", async () => {
      const fetchStub = stubFetch(noContent);

      await deleteResearch(31, TOKEN);

      expect(fetchStub.headers().has(IMPERSONATION_HEADER)).toBe(false);
    });

    it("uploadAvatar sends the impersonation header during a proxy session", async () => {
      setImpersonation(1234, "proxied@example.com");
      const fetchStub = stubFetch(jsonOk);

      await uploadAvatar(TOKEN, new File(["img"], "a.png", { type: "image/png" }));

      const headers = fetchStub.headers();
      expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.get(IMPERSONATION_HEADER)).toBe("1234");
    });

    it("uploadAvatar omits the impersonation header when not impersonating", async () => {
      const fetchStub = stubFetch(jsonOk);

      await uploadAvatar(TOKEN, new File(["img"], "a.png", { type: "image/png" }));

      expect(fetchStub.headers().has(IMPERSONATION_HEADER)).toBe(false);
    });

    it("uploadAvatar does not set Content-Type, leaving the FormData boundary to fetch", async () => {
      setImpersonation(1234, "proxied@example.com");
      const fetchStub = stubFetch(jsonOk);

      await uploadAvatar(TOKEN, new File(["img"], "a.png", { type: "image/png" }));

      expect(fetchStub.headers().has("Content-Type")).toBe(false);
    });
  });

  describe("admin-only surfaces stay as the admin", () => {
    it("exportAdminMetrics never sends the impersonation header", async () => {
      setImpersonation(4242, "proxied@example.com");
      const fetchStub = stubFetch(blobOk);

      await exportAdminMetrics(TOKEN);

      const headers = fetchStub.headers();
      expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.has(IMPERSONATION_HEADER)).toBe(false);
    });

    it("exportWasteFindings never sends the impersonation header", async () => {
      setImpersonation(4242, "proxied@example.com");
      const fetchStub = stubFetch(blobOk);

      await exportWasteFindings(TOKEN, "contracts", "csv");

      const headers = fetchStub.headers();
      expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.has(IMPERSONATION_HEADER)).toBe(false);
    });
  });
});
