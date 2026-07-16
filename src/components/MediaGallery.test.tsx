import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import MediaGallery from "./MediaGallery";
import { ThemeProvider } from "@/contexts/ThemeContext";
import {
  __resetMediaUrlStatusForTests,
  markMediaUrlFailed,
  markMediaUrlOk,
} from "@/lib/mediaPreload";
import type { MediaItem } from "@/lib/mediaUtils";

// ThemeProvider reads the system color scheme; jsdom has no matchMedia.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function makeItems(urls: string[]): MediaItem[] {
  return urls.map((url, i) => ({ url, title: `Item ${i}` }));
}

function renderGallery(
  items: MediaItem[],
  overrides: Partial<React.ComponentProps<typeof MediaGallery>> = {}
) {
  const onIndexChange = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ThemeProvider>
      <MediaGallery
        mediaItems={items}
        currentIndex={0}
        onIndexChange={onIndexChange}
        onClose={onClose}
        viewMode="split"
        {...overrides}
      />
    </ThemeProvider>
  );
  return { ...utils, onIndexChange, onClose };
}

describe("MediaGallery", () => {
  beforeEach(() => {
    __resetMediaUrlStatusForTests();
  });

  it("shows a photo counter that only counts viewable photos", () => {
    markMediaUrlFailed("http://a/bad.jpg");
    renderGallery(
      makeItems(["http://a/one.jpg", "http://a/bad.jpg", "http://a/two.jpg"])
    );
    expect(screen.getByText("Photo 1 of 2")).toBeInTheDocument();
  });

  it("removes a photo from the rotation when its image fails to load", () => {
    renderGallery(makeItems(["http://a/one.jpg", "http://a/two.jpg"]));
    expect(screen.getByText("Photo 1 of 2")).toBeInTheDocument();

    const img = screen.getByAltText("Item 0");
    fireEvent.error(img);

    // The failed photo is pruned; the remaining one takes its place.
    expect(screen.getByText("Photo")).toBeInTheDocument();
    expect(screen.getByAltText("Item 1")).toBeInTheDocument();
  });

  it("shows an empty state when every photo is broken", () => {
    markMediaUrlFailed("http://a/one.jpg");
    markMediaUrlFailed("http://a/two.jpg");
    renderGallery(makeItems(["http://a/one.jpg", "http://a/two.jpg"]));
    expect(
      screen.getByText("No viewable photos at this location.")
    ).toBeInTheDocument();
  });

  it("navigates next/previous through viewable photos only", () => {
    markMediaUrlFailed("http://a/bad.jpg");
    const { onIndexChange } = renderGallery(
      makeItems(["http://a/one.jpg", "http://a/bad.jpg", "http://a/two.jpg"])
    );

    fireEvent.click(screen.getByLabelText("Next photo"));
    // Viewable list is [one, two]; next from 0 is 1 (two.jpg), never bad.jpg.
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("hides loading indicator once the current image loads", () => {
    renderGallery(makeItems(["http://a/one.jpg"]));
    expect(screen.getByText("Loading image...")).toBeInTheDocument();

    fireEvent.load(screen.getByAltText("Item 0"));
    expect(screen.queryByText("Loading image...")).not.toBeInTheDocument();
  });

  it("gallery grid only renders viewable thumbnails", () => {
    markMediaUrlFailed("http://a/bad.jpg");
    markMediaUrlOk("http://a/one.jpg");
    renderGallery(
      makeItems(["http://a/one.jpg", "http://a/bad.jpg", "http://a/two.jpg"]),
      { viewMode: "gallery" }
    );

    const thumbnails = document.querySelectorAll(".media-gallery-thumbnail");
    expect(thumbnails).toHaveLength(2);
    expect(screen.queryByText("Failed to load")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const { onClose } = renderGallery(makeItems(["http://a/one.jpg"]));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
