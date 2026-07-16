import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetMediaUrlStatusForTests,
  filterKnownFailedMedia,
  getMediaStatusVersion,
  getMediaUrlStatus,
  markMediaUrlFailed,
  markMediaUrlOk,
  preloadMediaUrl,
  preloadMediaWindow,
  prepareGalleryOpen,
  subscribeMediaUrlStatus,
} from "./mediaPreload";

/** Replace window.Image with a controllable fake; returns created instances. */
function installFakeImage() {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = "";
    set src(value: string) {
      this._src = value;
      instances.push(this);
    }
    get src() {
      return this._src;
    }
  }
  const instances: FakeImage[] = [];
  vi.stubGlobal("Image", FakeImage);
  return instances;
}

describe("mediaPreload", () => {
  beforeEach(() => {
    __resetMediaUrlStatusForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts unknown and transitions via mark helpers", () => {
    expect(getMediaUrlStatus("http://a/1.jpg")).toBe("unknown");
    markMediaUrlOk("http://a/1.jpg");
    expect(getMediaUrlStatus("http://a/1.jpg")).toBe("ok");
    markMediaUrlFailed("http://a/2.jpg");
    expect(getMediaUrlStatus("http://a/2.jpg")).toBe("failed");
  });

  it("notifies subscribers and bumps version on status changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMediaUrlStatus(listener);
    const before = getMediaStatusVersion();

    markMediaUrlOk("http://a/1.jpg");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getMediaStatusVersion()).toBeGreaterThan(before);

    // Same status again is a no-op
    markMediaUrlOk("http://a/1.jpg");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    markMediaUrlFailed("http://a/2.jpg");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("preloadMediaUrl loads a URL once and records the result", () => {
    const images = installFakeImage();

    preloadMediaUrl("http://a/1.jpg");
    expect(getMediaUrlStatus("http://a/1.jpg")).toBe("loading");
    expect(images).toHaveLength(1);

    // Re-preloading while loading is a no-op
    preloadMediaUrl("http://a/1.jpg");
    expect(images).toHaveLength(1);

    images[0].onload?.();
    expect(getMediaUrlStatus("http://a/1.jpg")).toBe("ok");

    // Already-resolved URLs are not re-fetched
    preloadMediaUrl("http://a/1.jpg");
    expect(images).toHaveLength(1);
  });

  it("preloadMediaUrl records failures", () => {
    const images = installFakeImage();
    preloadMediaUrl("http://a/broken.jpg");
    images[0].onerror?.();
    expect(getMediaUrlStatus("http://a/broken.jpg")).toBe("failed");
  });

  it("preloadMediaWindow preloads a bounded window around the index", () => {
    const images = installFakeImage();
    const items = Array.from({ length: 50 }, (_, i) => ({
      url: `http://a/${i}.jpg`,
    }));

    preloadMediaWindow(items, 25, 3);
    const requested = images.map((img) => img.src);
    expect(requested).toEqual([
      "http://a/22.jpg",
      "http://a/23.jpg",
      "http://a/24.jpg",
      "http://a/25.jpg",
      "http://a/26.jpg",
      "http://a/27.jpg",
      "http://a/28.jpg",
    ]);
  });

  it("preloadMediaWindow clamps at list boundaries", () => {
    const images = installFakeImage();
    const items = [{ url: "http://a/0.jpg" }, { url: "http://a/1.jpg" }];
    preloadMediaWindow(items, 0, 5);
    expect(images.map((img) => img.src)).toEqual([
      "http://a/0.jpg",
      "http://a/1.jpg",
    ]);
  });

  it("filterKnownFailedMedia drops only known-failed URLs", () => {
    markMediaUrlFailed("http://a/bad.jpg");
    markMediaUrlOk("http://a/good.jpg");
    const items = [
      { url: "http://a/good.jpg" },
      { url: "http://a/bad.jpg" },
      { url: "http://a/unchecked.jpg" },
    ];
    expect(filterKnownFailedMedia(items).map((i) => i.url)).toEqual([
      "http://a/good.jpg",
      "http://a/unchecked.jpg",
    ]);
  });

  describe("prepareGalleryOpen", () => {
    it("filters broken items and finds the clicked photo's index", () => {
      installFakeImage();
      markMediaUrlFailed("http://a/bad.jpg");
      const items = [
        { url: "http://a/bad.jpg" },
        { url: "http://a/one.jpg" },
        { url: "http://a/two.jpg" },
      ];
      const result = prepareGalleryOpen(items, "http://a/two.jpg");
      expect(result.items.map((i) => i.url)).toEqual([
        "http://a/one.jpg",
        "http://a/two.jpg",
      ]);
      expect(result.startIndex).toBe(1);
    });

    it("falls back to index 0 when the clicked URL is missing or broken", () => {
      installFakeImage();
      markMediaUrlFailed("http://a/bad.jpg");
      const items = [{ url: "http://a/bad.jpg" }, { url: "http://a/one.jpg" }];
      expect(prepareGalleryOpen(items, "http://a/bad.jpg").startIndex).toBe(0);
      expect(prepareGalleryOpen(items, null).startIndex).toBe(0);
    });

    it("kicks off preloading around the start index", () => {
      const images = installFakeImage();
      const items = [{ url: "http://a/one.jpg" }, { url: "http://a/two.jpg" }];
      prepareGalleryOpen(items, "http://a/one.jpg");
      expect(images.map((img) => img.src)).toEqual([
        "http://a/one.jpg",
        "http://a/two.jpg",
      ]);
    });
  });
});
