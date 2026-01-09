/**
 * Shared, fixed layer color palette for both Metrics and Shapes.
 *
 * Goals:
 * - Brand purple (#ad35fa) is first, then coral (#FF6B5A), then variations in those hue families.
 * - Each template_id gets a unique, distinct color.
 * - Deterministic assignment: a layer keeps the same color across toggles/sessions.
 * - Same palette used everywhere (icons, sliders, map layers).
 */
export const LAYER_COLOR_PALETTE = [
  // Purple family (brand primary)
  "#ad35fa", // TransparentCity purple (primary) - Template ID 1
  "#8B5CF6", // Secondary purple - Template ID 2
  "#9625e0", // Darker purple - Template ID 3
  "#c44dff", // Bright purple - Template ID 4
  "#a78bfa", // Light purple - Template ID 5
  "#7c3aed", // Deep purple - Template ID 6
  "#9333ea", // Rich purple - Template ID 7
  "#d8b4fe", // Pale purple - Template ID 8
  
  // Coral family (brand secondary)
  "#FF6B5A", // Coral (primary) - Template ID 9
  "#FF8A7A", // Light coral - Template ID 10
  "#E85A4A", // Dark coral - Template ID 11
  "#FF9D8E", // Soft coral - Template ID 12
  "#FF7A6B", // Bright coral - Template ID 13
  "#D94A3A", // Deep coral - Template ID 14
  "#FFB3A8", // Pale coral - Template ID 15
  "#C73A2A", // Rich coral - Template ID 16
  
  // Additional distinct colors for more templates
  "#4ECDC4", // Turquoise - Template ID 17
  "#FFE66D", // Yellow - Template ID 18
  "#95E1D3", // Mint - Template ID 19
  "#F38181", // Pink - Template ID 20
  "#AA96DA", // Lavender - Template ID 21
  "#FCBAD3", // Light pink - Template ID 22
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


