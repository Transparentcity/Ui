import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  getNewsletterEdition,
  listNewsletterEditionsForSitemap,
} from "./newsletter";

describe("getNewsletterEdition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches with encoded short hash", async () => {
    const edition = {
      id: 1,
      subject: "Weekly",
      body_html: "<p>hi</p>",
      short_hash: "abc12345",
      city_slug: "san-francisco",
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(edition),
    });

    const result = await getNewsletterEdition("san-francisco", "abc12345");
    expect(result).toEqual(edition);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/newsletter/editions/by-hash/abc12345");
  });

  it("throws when the edition belongs to a different city slug", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 2,
          short_hash: "abc12345",
          city_slug: "other-city",
        }),
    });

    await expect(getNewsletterEdition("sf", "abc12345")).rejects.toThrow(
      "Newsletter edition slug mismatch"
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      getNewsletterEdition("sf", "abc12345")
    ).rejects.toThrow("Newsletter edition not found: 404");
  });

  it("uses omit credentials and revalidate cache", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: 1, short_hash: "abc12345", city_slug: "sf" }),
    });

    await getNewsletterEdition("sf", "abc12345");

    const options = mockFetch.mock.calls[0][1];
    expect(options.credentials).toBe("omit");
    expect(options.next?.revalidate).toBe(3600);
  });
});

describe("listNewsletterEditionsForSitemap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns editions on success", async () => {
    const items = [
      {
        city_slug: "sf",
        short_hash: "abc12345",
        edition_date: "2024-01-15",
        district: 0,
      },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(items),
    });

    const result = await listNewsletterEditionsForSitemap();
    expect(result).toEqual(items);
  });

  it("returns empty array on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const result = await listNewsletterEditionsForSitemap();
    expect(result).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await listNewsletterEditionsForSitemap();
    expect(result).toEqual([]);
  });
});
