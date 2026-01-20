/**
 * Shared, fixed layer color palette for both Metrics and Shapes.
 *
 * Goals:
 * - Maximally distinct colors for each position in the list.
 * - Brand purple (#ad35fa) is first, coal (#374151) is second.
 * - Colors spread across the color wheel for maximum visual distinction.
 * - Deterministic assignment: a layer keeps the same color across toggles/sessions.
 * - Same palette used everywhere (icons, sliders, map layers).
 */
export const LAYER_COLOR_PALETTE = [
  // Maximally distinct colors - spread across the color wheel
  "#ad35fa", // 1. TransparentCity brand purple (primary)
  "#FF6B5A", // 2. Coral red
  "#10B981", // 3. Emerald green
  "#3B82F6", // 4. Blue
  "#F59E0B", // 5. Amber/Orange
  "#06B6D4", // 6. Cyan/Teal
  "#EC4899", // 7. Pink
  "#374151", // 8. Coal (brand secondary - dark gray)
  "#84CC16", // 9. Lime green
  "#8B5CF6", // 10. Violet
  "#EF4444", // 11. Red
  "#14B8A6", // 12. Teal
  "#F97316", // 13. Orange
  "#6366F1", // 14. Indigo
  "#22C55E", // 15. Green
  "#A855F7", // 16. Purple
  "#0EA5E9", // 17. Sky blue
  "#E11D48", // 18. Rose
  "#FBBF24", // 19. Yellow
  "#7C3AED", // 20. Deep purple
  "#2DD4BF", // 21. Turquoise
  "#F472B6", // 22. Light pink
] as const;

export type LayerColor = typeof LAYER_COLOR_PALETTE[number];

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


