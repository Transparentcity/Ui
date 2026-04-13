/**
 * Delta choropleth fill colors (period-over-period % change).
 * Kept in sync across embedded maps (DeltaMapView) and public map page (/m/[hash]).
 */

export const DELTA_MAP_NO_DATA_HEX = "#e0e0e0";
export const DELTA_MAP_NEUTRAL_HEX = "#f5f5f5";

/** Dark basemap: no-data and neutral band (mapbox dark-v11). */
export const DELTA_MAP_NO_DATA_DARK_HEX = "#475569";
export const DELTA_MAP_NEUTRAL_DARK_HEX = "#3f4f63";

export type DeltaBasemapTheme = "light" | "dark";

/** Same hues as the public map legend (good / bad at strong change). */
const RGB_GOOD: [number, number, number] = [34, 197, 94]; // #22c55e
const RGB_BAD: [number, number, number] = [239, 68, 68]; // #ef4444
const RGB_NEUTRAL: [number, number, number] = [245, 245, 245];
const RGB_NEUTRAL_DARK: [number, number, number] = [63, 79, 99]; // #3f4f63

/** |change| at or below this (percent points) uses neutral fill. */
const NEUTRAL_BAND_PCT = 2;
/** |change| at or above this reaches full good/bad saturation. */
const FULL_SATURATION_AT_PCT = 42;

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function blendRgb(
  from: [number, number, number],
  to: [number, number, number],
  t: number
): [number, number, number] {
  const tt = clamp01(t);
  return [
    Math.round(lerp(from[0], to[0], tt)),
    Math.round(lerp(from[1], to[1], tt)),
    Math.round(lerp(from[2], to[2], tt)),
  ];
}

/**
 * Fill color for one district from signed percent change and metric greendirection.
 *
 * @param basemapTheme - `"dark"` blends from a slate neutral so fills read on mapbox dark-v11.
 */
export function getDeltaMapFillColor(
  changePct: number | null | undefined,
  greenDirection: "up" | "down" | null | undefined,
  basemapTheme: DeltaBasemapTheme = "light"
): string {
  const isDark = basemapTheme === "dark";
  if (changePct == null || !Number.isFinite(Number(changePct))) {
    return isDark ? DELTA_MAP_NO_DATA_DARK_HEX : DELTA_MAP_NO_DATA_HEX;
  }
  const n = Number(changePct);
  const abs = Math.abs(n);
  if (abs <= NEUTRAL_BAND_PCT) {
    return isDark ? DELTA_MAP_NEUTRAL_DARK_HEX : DELTA_MAP_NEUTRAL_HEX;
  }

  const dir = greenDirection === "up" ? "up" : "down";
  const increaseIsGood = dir === "up";
  const isIncrease = n > 0;
  const isGood = increaseIsGood ? isIncrease : !isIncrease;

  const span = FULL_SATURATION_AT_PCT - NEUTRAL_BAND_PCT;
  const raw = (abs - NEUTRAL_BAND_PCT) / span;
  const intensity = clamp01(Math.pow(raw, 0.88));

  const target = isGood ? RGB_GOOD : RGB_BAD;
  const neutralRgb = isDark ? RGB_NEUTRAL_DARK : RGB_NEUTRAL;
  const [r, g, b] = blendRgb(neutralRgb, target, intensity);
  return `rgb(${r}, ${g}, ${b})`;
}
