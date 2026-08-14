/**
 * Week Replay Export — share formats and their canvas layouts.
 *
 * Each destination wants a different frame: a 9:16 story, a 1:1 feed post, a
 * 16:9 wide video. Rather than render one video and letterbox it, every format
 * gets its own layout, so the map crop, the chart, and the type are all sized
 * for the frame they end up in.
 *
 * Pure geometry — no canvas, no DOM. The scene builder reads the map rect's
 * aspect to request a matching basemap crop, and the renderer paints into the
 * rects. Both stay in sync because the numbers live here.
 */

export type ExportFormatId = "story" | "square" | "wide";

export interface ExportFormat {
  id: ExportFormatId;
  label: string;
  /** Human aspect ratio, e.g. "9:16". */
  aspect: string;
  /** Where this format is meant to go, for the picker. */
  destinations: string;
  width: number;
  height: number;
}

/**
 * Encoders reject odd dimensions, and every platform below re-encodes at
 * 1080p or under, so all three formats stay on a 1080 short edge.
 */
export const EXPORT_FORMATS: readonly ExportFormat[] = [
  {
    id: "story",
    label: "Story",
    aspect: "9:16",
    destinations: "Instagram & Facebook Stories, TikTok, Reels, Shorts",
    width: 1080,
    height: 1920,
  },
  {
    id: "square",
    label: "Feed post",
    aspect: "1:1",
    destinations: "Instagram & Facebook feed, LinkedIn",
    width: 1080,
    height: 1080,
  },
  {
    id: "wide",
    label: "Wide",
    aspect: "16:9",
    destinations: "X, YouTube, Facebook video, Bluesky",
    width: 1920,
    height: 1080,
  },
];

export const DEFAULT_EXPORT_FORMAT_ID: ExportFormatId = "story";

export function getExportFormat(id: ExportFormatId): ExportFormat {
  return (
    EXPORT_FORMATS.find((f) => f.id === id) ??
    EXPORT_FORMATS.find((f) => f.id === DEFAULT_EXPORT_FORMAT_ID)!
  );
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExportLayout {
  format: ExportFormat;
  width: number;
  height: number;
  /** Title + date range. */
  header: Rect;
  /** Basemap, boundaries, dots, callouts, and the timeline ribbon. */
  map: Rect;
  /** Category bars that build up as dots land. */
  chart: Rect;
  /** Branding. */
  footer: Rect;
  /** Wide sits the chart beside the map; the others stack it underneath. */
  chartBesideMap: boolean;
  /** Categories past this fold into one "Other" bar so the chart still fits. */
  maxChartRows: number;
  /** Side inset for header, chart, and footer content. */
  pad: number;
}

/**
 * Resolve a format to its rects.
 *
 * The map keeps the largest share of the frame in every layout — it is the
 * thing being shared. Portrait can afford a tall chart beneath it; the square
 * takes a shorter one with fewer bars; wide has vertical room to spare and no
 * horizontal room, so the chart moves to a right-hand column.
 */
export function buildExportLayout(format: ExportFormat): ExportLayout {
  const { width, height, id } = format;

  if (id === "wide") {
    const headerH = 132;
    const footerH = 120;
    const mapW = 1240;
    const bodyY = headerH;
    const bodyH = height - headerH - footerH;
    return {
      format,
      width,
      height,
      header: { x: 0, y: 0, w: width, h: headerH },
      map: { x: 0, y: bodyY, w: mapW, h: bodyH },
      chart: { x: mapW, y: bodyY, w: width - mapW, h: bodyH },
      footer: { x: 0, y: height - footerH, w: width, h: footerH },
      chartBesideMap: true,
      maxChartRows: 8,
      pad: 44,
    };
  }

  if (id === "square") {
    const headerH = 140;
    const mapH = 540;
    const footerH = 108;
    return {
      format,
      width,
      height,
      header: { x: 0, y: 0, w: width, h: headerH },
      map: { x: 0, y: headerH, w: width, h: mapH },
      chart: {
        x: 0,
        y: headerH + mapH,
        w: width,
        h: height - headerH - mapH - footerH,
      },
      footer: { x: 0, y: height - footerH, w: width, h: footerH },
      chartBesideMap: false,
      maxChartRows: 5,
      pad: 40,
    };
  }

  // Story (9:16).
  const headerH = 184;
  const mapH = 1020;
  const footerH = 136;
  return {
    format,
    width,
    height,
    header: { x: 0, y: 0, w: width, h: headerH },
    map: { x: 0, y: headerH, w: width, h: mapH },
    chart: {
      x: 0,
      y: headerH + mapH,
      w: width,
      h: height - headerH - mapH - footerH,
    },
    footer: { x: 0, y: height - footerH, w: width, h: footerH },
    chartBesideMap: false,
    maxChartRows: 8,
    pad: 48,
  };
}

/** Width/height of the layout's map rect — the basemap crop's aspect. */
export function mapAspect(layout: ExportLayout): number {
  return layout.map.w / layout.map.h;
}

/**
 * Mapbox Static Images caps a request at 1280px per side and serves @2x, so
 * ask for half the rect and let the retina render fill it exactly.
 */
export function basemapRequestSize(layout: ExportLayout): {
  width: number;
  height: number;
} {
  return {
    width: Math.round(layout.map.w / 2),
    height: Math.round(layout.map.h / 2),
  };
}
