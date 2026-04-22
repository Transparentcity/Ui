import { describe, it, expect } from "vitest";
import {
  canRestorePlacePrivateScope,
  isPrivateFeedStory,
  requiresPublishForPublicShare,
} from "@/lib/feed/canonicalUrl";

describe("requiresPublishForPublicShare", () => {
  it("is true when user_place_id is set and not a personal newsletter", () => {
    expect(
      requiresPublishForPublicShare({
        user_place_id: 5,
        metadata: {},
      }),
    ).toBe(true);
  });

  it("is true for personal newsletter when user_place_id is set (publish clears scope)", () => {
    expect(
      requiresPublishForPublicShare({
        user_place_id: 5,
        metadata: { category: "personal_newsletter" },
      }),
    ).toBe(true);
  });

  it("is true for legacy metadata user_place_ids without personal category", () => {
    expect(
      requiresPublishForPublicShare({
        user_place_id: null,
        metadata: { user_place_ids: [2] },
      }),
    ).toBe(true);
  });
});

describe("canRestorePlacePrivateScope", () => {
  it("is true when shared-from-place id is set and column is clear", () => {
    expect(
      canRestorePlacePrivateScope({
        user_place_id: null,
        metadata: { shared_from_user_place_id: 12 },
      }),
    ).toBe(true);
  });

  it("is false when still place-scoped", () => {
    expect(
      canRestorePlacePrivateScope({
        user_place_id: 5,
        metadata: { shared_from_user_place_id: 12 },
      }),
    ).toBe(false);
  });
});

describe("isPrivateFeedStory", () => {
  it("treats personal newsletter as private without place ids", () => {
    expect(
      isPrivateFeedStory({
        user_place_id: null,
        metadata: { category: "personal_newsletter" },
      }),
    ).toBe(true);
  });
});
