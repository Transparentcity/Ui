/**
 * Shared, fixed layer color palette for both Metrics and Shapes.
 *
 * Goals:
 * - Distinctive purple is first, then coral, then other distinct colors.
 * - Deterministic assignment: a layer keeps the same color across toggles/sessions.
 * - Same palette used everywhere (icons, sliders, map layers).
 */
export const LAYER_COLOR_PALETTE = [
  "#ad35fa", // TransparentCity purple (primary)
  "#FF6B5A", // Coral
  "#4ECDC4", // Turquoise
  "#FFE66D", // Yellow
  "#95E1D3", // Mint
  "#F38181", // Pink
  "#AA96DA", // Lavender
  "#FCBAD3", // Light pink
] as const;

function hashStringToInt(key: string): number {
  // Simple deterministic hash (32-bit)
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

export function getStableColorIndexForKey(key: string): number {
  const hash = hashStringToInt(key);
  return Math.abs(hash) % LAYER_COLOR_PALETTE.length;
}

export function getStableColorForKey(key: string): string {
  return LAYER_COLOR_PALETTE[getStableColorIndexForKey(key)];
}


