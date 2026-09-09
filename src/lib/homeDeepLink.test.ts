import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_VIEWS,
  DEEP_LINKABLE_VIEWS,
  isDeepLinkableView,
  shouldLeaveAdminView,
} from "./homeDeepLink";

describe("home deep links", () => {
  it("honors the views the admin guide links to", () => {
    for (const v of ["chat", "city-data", "metrics-admin", "datasets-admin", "feed-admin", "newsletter-admin", "job-logs", "user-management"]) {
      expect(isDeepLinkableView(v)).toBe(true);
    }
  });

  it("still honors the shared rail's own destinations", () => {
    expect(isDeepLinkableView("feed")).toBe(true);
    expect(isDeepLinkableView("inbox")).toBe(true);
  });

  it("ignores unknown, empty and missing values", () => {
    expect(isDeepLinkableView("city")).toBe(false);
    expect(isDeepLinkableView("research-new")).toBe(false);
    expect(isDeepLinkableView("")).toBe(false);
    expect(isDeepLinkableView(null)).toBe(false);
    expect(isDeepLinkableView(undefined)).toBe(false);
  });

  it("every admin-only view is itself deep-linkable", () => {
    for (const v of ADMIN_ONLY_VIEWS) expect(DEEP_LINKABLE_VIEWS.has(v)).toBe(true);
  });

  it("bounces a non-admin out of an admin panel", () => {
    expect(shouldLeaveAdminView("city-data", false)).toBe(true);
    expect(shouldLeaveAdminView("metrics-admin", false)).toBe(true);
  });

  it("leaves admins, and non-admin views, alone", () => {
    expect(shouldLeaveAdminView("city-data", true)).toBe(false);
    expect(shouldLeaveAdminView("feed", false)).toBe(false);
    expect(shouldLeaveAdminView("chat", false)).toBe(false);
  });
});
