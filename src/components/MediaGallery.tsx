"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useTheme } from "@/contexts/ThemeContext";
import type { MediaItem } from "@/lib/mediaUtils";
import {
  getMediaStatusVersion,
  getMediaUrlStatus,
  markMediaUrlFailed,
  markMediaUrlOk,
  preloadMediaWindow,
  subscribeMediaUrlStatus,
} from "@/lib/mediaPreload";
import "./MediaGallery.css";

export type MediaViewMode = "split" | "gallery" | "fullscreen";

/** Minimal map surface the gallery needs (mapbox-gl Map compatible). */
interface GalleryMapInstance {
  flyTo: (options: {
    center: [number, number];
    zoom: number;
    duration: number;
  }) => void;
  getZoom: () => number;
}

interface MediaGalleryProps {
  mediaItems: MediaItem[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  viewMode?: MediaViewMode;
  onViewModeChange?: (mode: MediaViewMode) => void;
  mapInstanceRef?: React.MutableRefObject<GalleryMapInstance | null>;
  onNavigateToLocation?: (coordinates: [number, number]) => void;
}

/**
 * Photo gallery for map points.
 *
 * Simple rule: only viewable photos are shown. Image URLs are checked via a
 * shared preload cache (see lib/mediaPreload); any URL that fails to load is
 * removed from the list, so next/previous and the thumbnail grid never step
 * through broken images. Nearby images are preloaded ahead of navigation.
 */
export default function MediaGallery({
  mediaItems,
  currentIndex,
  onIndexChange,
  onClose,
  viewMode = "split",
  onViewModeChange,
  mapInstanceRef,
  onNavigateToLocation,
}: MediaGalleryProps) {
  const { theme } = useTheme();

  // Re-render whenever any image's load status changes.
  const statusVersion = useSyncExternalStore(
    subscribeMediaUrlStatus,
    getMediaStatusVersion,
    getMediaStatusVersion
  );

  // Only keep items whose image isn't known to be broken.
  const visibleItems = useMemo(
    () => mediaItems.filter((item) => getMediaUrlStatus(item.url) !== "failed"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mediaItems, statusVersion]
  );

  const safeIndex = Math.max(0, Math.min(currentIndex, visibleItems.length - 1));
  const currentMedia: MediaItem | undefined = visibleItems[safeIndex];
  const hasMultiple = visibleItems.length > 1;

  // Keep the selection anchored to the same photo when earlier items get
  // pruned (their removal shifts indices). If the current photo itself was
  // pruned, the clamped index naturally advances to the next viewable one.
  const currentUrlRef = useRef<string | null>(currentMedia?.url ?? null);
  useEffect(() => {
    const anchorUrl = currentUrlRef.current;
    if (anchorUrl && currentMedia && currentMedia.url !== anchorUrl) {
      const anchorIndex = visibleItems.findIndex((item) => item.url === anchorUrl);
      if (anchorIndex >= 0 && anchorIndex !== safeIndex) {
        onIndexChange(anchorIndex);
        return;
      }
    }
    currentUrlRef.current = currentMedia?.url ?? null;
  }, [visibleItems, currentMedia, safeIndex, onIndexChange]);

  // Preload images around the current position so navigation stays clean.
  useEffect(() => {
    if (visibleItems.length > 0) {
      preloadMediaWindow(visibleItems, safeIndex);
    }
  }, [visibleItems, safeIndex]);

  // Navigate map to media location
  const navigateToMediaLocation = useCallback(
    (index: number) => {
      const media = visibleItems[index];
      if (media?.coordinates && (mapInstanceRef?.current || onNavigateToLocation)) {
        if (onNavigateToLocation) {
          onNavigateToLocation(media.coordinates);
        } else if (mapInstanceRef?.current) {
          const map = mapInstanceRef.current;
          map.flyTo({
            center: media.coordinates,
            zoom: Math.max(map.getZoom(), 15),
            duration: 500,
          });
        }
      }
    },
    [visibleItems, mapInstanceRef, onNavigateToLocation]
  );

  const goTo = useCallback(
    (index: number) => {
      currentUrlRef.current = visibleItems[index]?.url ?? null;
      onIndexChange(index);
    },
    [visibleItems, onIndexChange]
  );

  const handlePrevious = useCallback(() => {
    if (!hasMultiple) return;
    goTo((safeIndex - 1 + visibleItems.length) % visibleItems.length);
  }, [hasMultiple, safeIndex, visibleItems.length, goTo]);

  const handleNext = useCallback(() => {
    if (!hasMultiple) return;
    goTo((safeIndex + 1) % visibleItems.length);
  }, [hasMultiple, safeIndex, visibleItems.length, goTo]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrevious();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrevious, handleNext, onClose]);

  // Navigate to current media location when the selected photo changes
  const lastNavigatedUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentMedia && currentMedia.url !== lastNavigatedUrlRef.current) {
      lastNavigatedUrlRef.current = currentMedia.url;
      navigateToMediaLocation(safeIndex);
    }
  }, [currentMedia, safeIndex, navigateToMediaLocation]);

  // Stop event propagation for buttons
  const handleButtonClick = useCallback((e: React.MouseEvent, handler: () => void) => {
    e.stopPropagation();
    e.preventDefault();
    handler();
  }, []);

  const isDark = theme === "dark";
  const showSplitView = viewMode === "split";
  const showGalleryView = viewMode === "gallery";
  const showFullscreen = viewMode === "fullscreen";

  const currentStatus = currentMedia ? getMediaUrlStatus(currentMedia.url) : "unknown";

  const renderMainImage = (className: string) => {
    if (!currentMedia) return null;
    return (
      <>
        {currentStatus !== "ok" && (
          <div className="media-gallery-loading">Loading image...</div>
        )}
        <img
          key={currentMedia.url}
          src={currentMedia.url}
          alt={currentMedia.title || `Photo ${safeIndex + 1}`}
          className={className}
          onLoad={() => markMediaUrlOk(currentMedia.url)}
          onError={() => markMediaUrlFailed(currentMedia.url)}
        />
        {hasMultiple && (
          <>
            <button
              className="media-gallery-nav-btn media-gallery-nav-prev"
              onClick={(e) => handleButtonClick(e, handlePrevious)}
              aria-label="Previous photo"
            >
              ‹
            </button>
            <button
              className="media-gallery-nav-btn media-gallery-nav-next"
              onClick={(e) => handleButtonClick(e, handleNext)}
              aria-label="Next photo"
            >
              ›
            </button>
          </>
        )}
      </>
    );
  };

  return (
    <div
      className={`media-gallery ${viewMode} ${isDark ? "dark" : ""}`}
      data-theme={theme}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="media-gallery-header">
        <div className="media-gallery-title">
          <span className="media-gallery-icon">📷</span>
          <span>
            {visibleItems.length === 0
              ? "Photos"
              : hasMultiple
              ? `Photo ${safeIndex + 1} of ${visibleItems.length}`
              : "Photo"}
          </span>
        </div>
        <div className="media-gallery-controls">
          {onViewModeChange && visibleItems.length > 0 && (
            <>
              <button
                className={`media-gallery-mode-btn ${showSplitView ? "active" : ""}`}
                onClick={(e) => handleButtonClick(e, () => onViewModeChange("split"))}
                title="Split view (image + map)"
                aria-label="Split view"
              >
                Split
              </button>
              <button
                className={`media-gallery-mode-btn ${showGalleryView ? "active" : ""}`}
                onClick={(e) => handleButtonClick(e, () => onViewModeChange("gallery"))}
                title="Gallery view"
                aria-label="Gallery view"
              >
                Gallery
              </button>
            </>
          )}
          <button
            className="media-gallery-close-btn"
            onClick={(e) => handleButtonClick(e, onClose)}
            title="Close"
            aria-label="Close media gallery"
          >
            ×
          </button>
        </div>
      </div>

      {/* Empty state: every photo URL turned out to be broken */}
      {visibleItems.length === 0 && (
        <div className="media-gallery-error" style={{ flex: 1 }}>
          <span>No viewable photos at this location.</span>
        </div>
      )}

      {/* Split View - Image on one side, details (data point info) on the other */}
      {showSplitView && currentMedia && (
        <div className="media-gallery-split">
          <div className="media-gallery-image-container">
            {renderMainImage("media-gallery-image")}
          </div>
          <div className="media-gallery-details">
            {currentMedia.title && (
              <div className="media-gallery-details-title">
                <strong>{currentMedia.title}</strong>
              </div>
            )}
            {currentMedia.description && (
              <p className="media-gallery-details-description">
                {currentMedia.description}
              </p>
            )}
            {currentMedia.featureData && (
              <div className="media-gallery-details-fields">
                {Object.entries(currentMedia.featureData)
                  .filter(
                    ([key, val]) =>
                      val != null &&
                      val !== "" &&
                      !["tooltip_fields", "lat", "lon", "coordinates", "location", "hasMedia"].includes(key)
                  )
                  .map(([key, val]) => (
                    <div key={key} className="media-gallery-details-row">
                      <span className="media-gallery-details-key">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="media-gallery-details-value">
                        {typeof val === "object" ? JSON.stringify(val) : String(val)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gallery View - Grid of viewable thumbnails */}
      {showGalleryView && visibleItems.length > 0 && (
        <div className="media-gallery-grid">
          {visibleItems.map((media, index) => (
            <div
              key={media.url}
              className={`media-gallery-thumbnail ${
                index === safeIndex ? "active" : ""
              }`}
              onClick={() => {
                goTo(index);
                // Switch to fullscreen when clicking a thumbnail
                if (onViewModeChange) {
                  onViewModeChange("fullscreen");
                }
              }}
            >
              <img
                src={media.url}
                alt={media.title || `Photo ${index + 1}`}
                className="media-gallery-thumbnail-img"
                loading="lazy"
                onLoad={() => markMediaUrlOk(media.url)}
                onError={() => markMediaUrlFailed(media.url)}
              />
              {index === safeIndex && (
                <div className="media-gallery-thumbnail-badge">Current</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen View */}
      {showFullscreen && currentMedia && (
        <div className="media-gallery-fullscreen">
          {onViewModeChange ? (
            <div className="media-gallery-fullscreen-header">
              <button
                className="media-gallery-back-btn"
                onClick={(e) => {
                  handleButtonClick(e, () => onViewModeChange("gallery"));
                }}
                title="Back to gallery"
                aria-label="Back to gallery"
              >
                ← Back to Gallery
              </button>
              <button
                className="media-gallery-close-btn media-gallery-close-btn-fullscreen"
                onClick={(e) => handleButtonClick(e, onClose)}
                title="Close"
                aria-label="Close media gallery"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              className="media-gallery-close-btn media-gallery-close-btn-floating"
              onClick={(e) => handleButtonClick(e, onClose)}
              title="Close"
              aria-label="Close media gallery"
            >
              ×
            </button>
          )}
          <div className="media-gallery-fullscreen-image-container">
            {renderMainImage("media-gallery-fullscreen-image")}
          </div>
          {(currentMedia.title || currentMedia.description) && (
            <div className="media-gallery-fullscreen-caption">
              {currentMedia.title && <strong>{currentMedia.title}</strong>}
              {currentMedia.description && (
                <span>{currentMedia.description}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
