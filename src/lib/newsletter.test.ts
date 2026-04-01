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

  it("fetches with encoded slug and date", async () => {
    const edition = { id: 1, subject: "Weekly", body_html: "<p>hi</p>" };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(edition),
    });

    const result = await getNewsletterEdition("san-francisco", "2024-01-15");
    expect(result).toEqual(edition);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/newsletter/editions/san-francisco/2024-01-15");
    expect(url).not.toContain("?district=");
  });

  it("includes district param when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 2 }),
    });

    await getNewsletterEdition("sf", "2024-01-15", 5);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("?district=5");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      getNewsletterEdition("sf", "2024-01-15")
    ).rejects.toThrow("Newsletter edition not found: 404");
  });

  it("uses omit credentials and revalidate cache", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });

    await getNewsletterEdition("sf", "2024-01-15");

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
      { city_slug: "sf", edition_date: "2024-01-15", district: 0 },
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
