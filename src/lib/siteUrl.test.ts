import { getSiteOrigin } from "@/lib/siteUrl";

describe("getSiteOrigin", () => {
  const originalSiteUrl = process.env.SITE_URL;
  const originalPublicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.SITE_URL;
    } else {
      process.env.SITE_URL = originalSiteUrl;
    }

    if (originalPublicSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalPublicSiteUrl;
    }
  });

  it("prefers NEXT_PUBLIC_SITE_URL and trims trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://transparent.city/";
    process.env.SITE_URL = "https://fallback.example.com/";

    expect(getSiteOrigin()).toBe("https://transparent.city");
  });

  it("uses SITE_URL when NEXT_PUBLIC_SITE_URL is missing", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.SITE_URL = "https://transparent.city";

    expect(getSiteOrigin()).toBe("https://transparent.city");
  });

  it("falls back to localhost when no env vars are set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;

    expect(getSiteOrigin()).toBe("http://localhost:3000");
  });
});
