/**
 * Utility functions for extracting and processing media URLs from map data points.
 * Generalizes media extraction logic without city-specific assumptions.
 */

export interface MediaItem {
  url: string;
  title?: string;
  description?: string;
  coordinates?: [number, number];
  featureData?: any;
}

/**
 * Extract media URL from various value formats.
 * Supports strings, objects with url property, JSON strings, etc.
 */
export function extractMediaUrl(value: any): string | null {
  if (!value) return null;

  let mediaUrl: string | null = null;

  if (typeof value === "string") {
    // Check if it's a JSON string
    if (value.trim().startsWith("{") || value.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === "object" && parsed !== null) {
          if (parsed.url) {
            mediaUrl = parsed.url;
          } else if (parsed.media_url) {
            mediaUrl = parsed.media_url;
          }
        }
      } catch {
        // Not JSON, treat as URL string
        const urlMatch = value.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/i);
        if (urlMatch) {
          mediaUrl = urlMatch[0];
        } else {
          mediaUrl = value;
        }
      }
    } else {
      // Direct URL string
      const urlMatch = value.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/i);
      if (urlMatch) {
        mediaUrl = urlMatch[0];
      } else if (value.startsWith("http")) {
        mediaUrl = value;
      }
    }
  } else if (typeof value === "object" && value !== null) {
    if (value.url) {
      mediaUrl = value.url;
    } else if (value.media_url) {
      mediaUrl = value.media_url;
    }
  }

  // Validate URL
  if (mediaUrl && mediaUrl.startsWith("http")) {
    return mediaUrl;
  }

  return null;
}

/**
 * Check if a field name indicates it contains media.
 */
function isMediaField(key: string): boolean {
  const keyLower = key.toLowerCase().replace(/\s+/g, "_");
  return (
    keyLower.includes("media_url") ||
    keyLower.includes("mediaurl") ||
    keyLower.includes("image_url") ||
    keyLower.includes("imageurl") ||
    keyLower.includes("photo_url") ||
    keyLower.includes("photourl") ||
    key.toLowerCase().includes("media url") ||
    key.toLowerCase().includes("image url") ||
    key.toLowerCase().includes("photo url")
  );
}

/**
 * Extract all media items from a map data point.
 * Checks tooltip_fields (if it's a JSON string or object) and direct properties.
 */
export function extractMediaFromPoint(
  point: any,
  coordinates?: [number, number]
): MediaItem[] {
  const mediaItems: MediaItem[] = [];

  if (!point) return mediaItems;

  // Check tooltip_fields (common pattern in map data)
  if (point.tooltip_fields) {
    let tooltipData: any = null;

    if (typeof point.tooltip_fields === "string") {
      try {
        tooltipData = JSON.parse(point.tooltip_fields);
      } catch {
        // Not JSON, skip
      }
    } else if (typeof point.tooltip_fields === "object") {
      tooltipData = point.tooltip_fields;
    }

    if (tooltipData) {
      Object.entries(tooltipData).forEach(([key, value]) => {
        if (isMediaField(key)) {
          const mediaUrl = extractMediaUrl(value);
          if (mediaUrl) {
            mediaItems.push({
              url: mediaUrl,
              title: point.title || point.name || undefined,
              description: point.description || undefined,
              coordinates: coordinates || (point.lon && point.lat ? [point.lon, point.lat] : undefined),
              featureData: point,
            });
          }
        }
      });
    }
  }

  // Check direct properties (excluding internal/rendering fields)
  const excludedFields = new Set([
    "title",
    "description",
    "value",
    "count",
    "tooltip_fields",
    "mapTitle",
    "metricId",
    "colorIndex",
    "layerColor",
    "mapId",
    "layerIndex",
    "scale",
    "hasMedia",
    "lat",
    "lon",
    "coordinates",
    "location",
    "id",
  ]);

  Object.entries(point).forEach(([key, value]) => {
    if (excludedFields.has(key) || key.startsWith("_")) return;

    if (isMediaField(key)) {
      const mediaUrl = extractMediaUrl(value);
      if (mediaUrl) {
        // Avoid duplicates
        if (!mediaItems.some((item) => item.url === mediaUrl)) {
          mediaItems.push({
            url: mediaUrl,
            title: point.title || point.name || undefined,
            description: point.description || undefined,
            coordinates: coordinates || (point.lon && point.lat ? [point.lon, point.lat] : undefined),
            featureData: point,
          });
        }
      }
    }
  });

  return mediaItems;
}

/**
 * Extract all media items from multiple map data points.
 * Useful for finding all media in a series or collection.
 */
export function extractMediaFromPoints(
  points: any[],
  getCoordinates?: (point: any) => [number, number] | undefined
): MediaItem[] {
  const allMedia: MediaItem[] = [];

  points.forEach((point) => {
    const coordinates = getCoordinates
      ? getCoordinates(point)
      : point.lon && point.lat
      ? [point.lon, point.lat]
      : undefined;

    const mediaItems = extractMediaFromPoint(point, coordinates);
    allMedia.push(...mediaItems);
  });

  // Remove duplicates by URL
  const uniqueMedia = Array.from(
    new Map(allMedia.map((item) => [item.url, item])).values()
  );

  return uniqueMedia;
}

