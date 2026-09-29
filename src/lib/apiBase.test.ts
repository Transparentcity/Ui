import { describe, expect, it } from "vitest";

import { getApiBaseUrl, getChatStreamBaseUrl } from "./apiBase";

describe("getChatStreamBaseUrl", () => {
  it("streams straight from the backend origin on the live site hosts", () => {
    for (const host of [
      "transparent.city",
      "www.transparent.city",
      "app.transparent.city",
    ]) {
      const base = getChatStreamBaseUrl(host);
      expect(base, host).not.toBe("");
      expect(base, host).toMatch(/^https?:\/\//);
      expect(base, host).not.toMatch(/\/$/);
    }
  });

  it("keeps the same-origin path everywhere else", () => {
    for (const host of [
      "localhost",
      "ui-git-feature-transparentcity.vercel.app",
      undefined,
    ]) {
      expect(getChatStreamBaseUrl(host)).toBe(getApiBaseUrl());
    }
  });
});
