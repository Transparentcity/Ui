"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import type { MediaItem } from "@/lib/mediaUtils";
import "./MediaGallery.css";

export type MediaViewMode = "split" | "gallery" | "fullscreen";

interface MediaGalleryProps {
  mediaItems: MediaItem[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  viewMode?: MediaViewMode;
  onViewModeChange?: (mode: MediaViewMode) => void;
  mapInstanceRef?: React.MutableRefObject<any>;
  onNavigateToLocation?: (coordinates: [number, number]) => void;
}

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
  const [imageError, setImageError] = useState<Set<string>>(new Set()); // Track by URL
  const [imageLoaded, setImageLoaded] = useState<Set<string>>(new Set()); // Track loaded by URL
  const [isLoading, setIsLoading] = useState<Record<number, boolean>>({});
  const [sortedMediaItems, setSortedMediaItems] = useState<MediaItem[]>(mediaItems);
  const [originalToSortedIndex, setOriginalToSortedIndex] = useState<Map<number, number>>(new Map());
  const [cameFromGallery, setCameFromGallery] = useState(false); // Track if we opened fullscreen from gallery

  // Sort media items: loaded images first, then loading, then failed
  useEffect(() => {
    const sorted = [...mediaItems].sort((a, b) => {
      const aUrl = a.url;
      const bUrl = b.url;
      const aLoaded = imageLoaded.has(aUrl);
      const bLoaded = imageLoaded.has(bUrl);
      const aError = imageError.has(aUrl);
      const bError = imageError.has(bUrl);
      
      // Loaded images first
      if (aLoaded && !bLoaded) return -1;
      if (!aLoaded && bLoaded) return 1;
      
      // Then non-error images
      if (!aError && bError) return -1;
      if (aError && !bError) return 1;
      
      // Keep original order for items with same status
      return 0;
    });
    
    setSortedMediaItems(sorted);
    
    // Create mapping from original index to sorted index
    const mapping = new Map<number, number>();
    mediaItems.forEach((item, originalIndex) => {
      const sortedIndex = sorted.findIndex(s => s.url === item.url);
      if (sortedIndex >= 0) {
        mapping.set(originalIndex, sortedIndex);
      }
    });
    setOriginalToSortedIndex(mapping);
  }, [mediaItems, imageLoaded, imageError]);

  // Track the clicked URL to maintain selection after sorting
  const clickedUrlRef = useRef<string | null>(null);
  const isInternalUpdateRef = useRef(false);
  
  // Set clicked URL when mediaItems or currentIndex changes (only from external changes)
  useEffect(() => {
    if (mediaItems.length > 0 && currentIndex < mediaItems.length) {
      const newUrl = mediaItems[currentIndex]?.url || null;
      // Only update if URL actually changed (not from our own index update)
      if (newUrl !== clickedUrlRef.current && !isInternalUpdateRef.current) {
        clickedUrlRef.current = newUrl;
      }
      isInternalUpdateRef.current = false;
    }
  }, [mediaItems, currentIndex]);
  
  // Update current index when sorting changes to maintain selection
  // Use a ref to track previous sorted URLs to detect actual order changes
  const prevSortedUrlsRef = useRef<string>("");
  const lastUpdateRef = useRef<number>(0);
  
  useEffect(() => {
    if (sortedMediaItems.length > 0 && clickedUrlRef.current) {
      const currentSortedUrls = sortedMediaItems.map(item => item.url).join(",");
      // Only update if the order actually changed
      if (currentSortedUrls !== prevSortedUrlsRef.current) {
        prevSortedUrlsRef.current = currentSortedUrls;
        const sortedIndex = sortedMediaItems.findIndex(item => item.url === clickedUrlRef.current);
        // Check if current item at currentIndex is already the clicked URL
        const currentItemUrl = sortedMediaItems[currentIndex]?.url;
        // Only update if the index actually needs to change and we haven't updated recently
        const now = Date.now();
        if (sortedIndex >= 0 && sortedIndex !== currentIndex && currentItemUrl !== clickedUrlRef.current && (now - lastUpdateRef.current) > 100) {
          lastUpdateRef.current = now;
          isInternalUpdateRef.current = true; // Mark that we're updating internally
          onIndexChange(sortedIndex);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedMediaItems]); // Depend on sortedMediaItems but use ref to prevent loops

  const currentMedia = sortedMediaItems[currentIndex];
  const hasMultiple = sortedMediaItems.length > 1;
  
  // Reset loading state when index changes
  useEffect(() => {
    if (currentMedia && !imageError.has(currentMedia.url)) {
      setIsLoading((prev) => ({ ...prev, [currentIndex]: true }));
    }
  }, [currentIndex, currentMedia, imageError]);

  // Navigate to previous media
  const handlePrevious = useCallback(() => {
    if (hasMultiple) {
      const newIndex = (currentIndex - 1 + sortedMediaItems.length) % sortedMediaItems.length;
      onIndexChange(newIndex);
      navigateToMediaLocation(newIndex);
    }
  }, [currentIndex, hasMultiple, sortedMediaItems.length, onIndexChange]);

  // Navigate to next media
  const handleNext = useCallback(() => {
    if (hasMultiple) {
      const newIndex = (currentIndex + 1) % sortedMediaItems.length;
      onIndexChange(newIndex);
      navigateToMediaLocation(newIndex);
    }
  }, [currentIndex, hasMultiple, sortedMediaItems.length, onIndexChange]);

  // Navigate map to media location
  const navigateToMediaLocation = useCallback(
    (index: number) => {
      const media = sortedMediaItems[index];
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
    [sortedMediaItems, mapInstanceRef, onNavigateToLocation]
  );

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

  // Navigate to current media location when index changes
  useEffect(() => {
    navigateToMediaLocation(currentIndex);
  }, [currentIndex, navigateToMediaLocation]);

  // Handle image load - use URL directly to avoid dependency on sortedMediaItems
  const handleImageLoad = useCallback(
    (url: string, index: number) => {
      setImageLoaded((prev) => {
        // Only update if not already loaded to prevent unnecessary re-renders
        if (prev.has(url)) return prev;
        return new Set(prev).add(url);
      });
      setIsLoading((prev) => ({ ...prev, [index]: false }));
    },
    []
  );

  // Handle image error - use URL directly to avoid dependency on sortedMediaItems
  const handleImageError = useCallback(
    (url: string, index: number) => {
      setImageError((prev) => {
        // Only update if not already in error state to prevent unnecessary re-renders
        if (prev.has(url)) return prev;
        return new Set(prev).add(url);
      });
      setIsLoading((prev) => ({ ...prev, [index]: false }));
    },
    []
  );
  
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

  // Reset cameFromGallery when switching away from fullscreen.
  // Must run before any early return so hook order stays stable.
  useEffect(() => {
    if (!showFullscreen) {
      setCameFromGallery(false);
    }
  }, [showFullscreen]);

  if (sortedMediaItems.length === 0 || !currentMedia) {
    return null;
  }

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
            Media {hasMultiple ? `(${currentIndex + 1}/${sortedMediaItems.length})` : ""}
          </span>
        </div>
        <div className="media-gallery-controls">
          {onViewModeChange && (
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

      {/* Split View - Image on one side, details (data point info) on the other */}
      {showSplitView && (
        <div className="media-gallery-split">
          <div className="media-gallery-image-container">
            {isLoading[currentIndex] && !imageError.has(currentMedia.url) && (
              <div className="media-gallery-loading">Loading image...</div>
            )}
            {!imageError.has(currentMedia.url) ? (
              <img
                src={currentMedia.url}
                alt={currentMedia.title || `Media ${currentIndex + 1}`}
                className="media-gallery-image"
                onLoad={() => handleImageLoad(currentMedia.url, currentIndex)}
                onError={() => handleImageError(currentMedia.url, currentIndex)}
              />
            ) : (
              <div className="media-gallery-error">
                {(currentMedia.title || currentMedia.description) && (
                  <div className="media-gallery-error-label">
                    {currentMedia.title && <strong>{currentMedia.title}</strong>}
                    {currentMedia.description && (
                      <span className="media-gallery-description">
                        {currentMedia.description}
                      </span>
                    )}
                  </div>
                )}
                <a
                  href={currentMedia.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="media-gallery-error-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open image attachment
                </a>
              </div>
            )}
            {hasMultiple && (
              <>
                <button
                  className="media-gallery-nav-btn media-gallery-nav-prev"
                  onClick={(e) => handleButtonClick(e, handlePrevious)}
                  aria-label="Previous image"
                >
                  ‹
                </button>
                <button
                  className="media-gallery-nav-btn media-gallery-nav-next"
                  onClick={(e) => handleButtonClick(e, handleNext)}
                  aria-label="Next image"
                >
                  ›
                </button>
              </>
            )}
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

      {/* Gallery View - Grid of thumbnails */}
      {showGalleryView && (
        <div className="media-gallery-grid">
          {sortedMediaItems.map((media, index) => (
            <div
              key={media.url}
              className={`media-gallery-thumbnail ${
                index === currentIndex ? "active" : ""
              }`}
              onClick={() => {
                onIndexChange(index);
                // Switch to fullscreen when clicking a thumbnail
                if (onViewModeChange) {
                  setCameFromGallery(true);
                  onViewModeChange("fullscreen");
                }
              }}
            >
              {!imageError.has(media.url) ? (
                <img
                  src={media.url}
                  alt={media.title || `Media ${index + 1}`}
                  className="media-gallery-thumbnail-img"
                  onLoad={() => handleImageLoad(media.url, index)}
                  onError={() => handleImageError(media.url, index)}
                />
              ) : (
                <div className="media-gallery-thumbnail-error">Failed to load</div>
              )}
              {index === currentIndex && (
                <div className="media-gallery-thumbnail-badge">Current</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen View */}
      {showFullscreen && (
        <div className="media-gallery-fullscreen">
          {/* Back to Gallery button when opened from gallery */}
          {cameFromGallery && onViewModeChange && (
            <div className="media-gallery-fullscreen-header">
              <button
                className="media-gallery-back-btn"
                onClick={(e) => {
                  handleButtonClick(e, () => {
                    setCameFromGallery(false);
                    onViewModeChange("gallery");
                  });
                }}
                title="Back to gallery"
                aria-label="Back to gallery"
              >
                ← Back to Gallery
              </button>
              {/* Close button in fullscreen header */}
              <button
                className="media-gallery-close-btn media-gallery-close-btn-fullscreen"
                onClick={(e) => handleButtonClick(e, onClose)}
                title="Close"
                aria-label="Close media gallery"
              >
                ×
              </button>
            </div>
          )}
          {/* Floating close button for fullscreen (when not from gallery) */}
          {(!cameFromGallery || !onViewModeChange) && (
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
            {isLoading[currentIndex] && !imageError.has(currentMedia.url) && (
              <div className="media-gallery-loading">Loading image...</div>
            )}
            {!imageError.has(currentMedia.url) ? (
              <img
                src={currentMedia.url}
                alt={currentMedia.title || `Media ${currentIndex + 1}`}
                className="media-gallery-fullscreen-image"
                onLoad={() => handleImageLoad(currentMedia.url, currentIndex)}
                onError={() => handleImageError(currentMedia.url, currentIndex)}
              />
            ) : (
              <div className="media-gallery-error">
                {(currentMedia.title || currentMedia.description) && (
                  <div className="media-gallery-error-label">
                    {currentMedia.title && <strong>{currentMedia.title}</strong>}
                    {currentMedia.description && (
                      <span className="media-gallery-description">
                        {currentMedia.description}
                      </span>
                    )}
                  </div>
                )}
                <a
                  href={currentMedia.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="media-gallery-error-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open image attachment
                </a>
              </div>
            )}
            {hasMultiple && (
              <>
                <button
                  className="media-gallery-nav-btn media-gallery-nav-prev"
                  onClick={(e) => handleButtonClick(e, handlePrevious)}
                  aria-label="Previous image"
                >
                  ‹
                </button>
                <button
                  className="media-gallery-nav-btn media-gallery-nav-next"
                  onClick={(e) => handleButtonClick(e, handleNext)}
                  aria-label="Next image"
                >
                  ›
                </button>
              </>
            )}
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

