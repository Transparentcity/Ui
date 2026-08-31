/**
 * Shared, fixed layer color palette for both Metrics and Shapes.
 *
 * Goals:
 * - Maximally distinct colors for each position in the list.
 * - Brand purple (var(--brand-primary)) is first, coal (var(--text-secondary)) is second.
 * - Colors spread across the color wheel for maximum visual distinction.
 * - Deterministic assignment: a layer keeps the same color across toggles/sessions.
 * - Same palette used everywhere (icons, sliders, map layers).
 */
export const LAYER_COLOR_PALETTE = [
  // Maximally distinct colors - spread across the color wheel
  "var(--brand-primary)", // 1. TransparentCity brand purple (primary)
  "#FF6B5A", // 2. Coral red
  "var(--success)", // 3. Emerald green
  "#3B82F6", // 4. Blue
  "var(--warning)", // 5. Amber/Orange
  "#06B6D4", // 6. Cyan/Teal
  "#EC4899", // 7. Pink
  "var(--text-secondary)", // 8. Coal (brand secondary - dark gray)
  "#84CC16", // 9. Lime green
  "#8B5CF6", // 10. Violet
  "var(--error)", // 11. Red
  "#14B8A6", // 12. Teal
  "#F97316", // 13. Orange
  "#6366F1", // 14. Indigo
  "#22C55E", // 15. Green
  "#A855F7", // 16. Purple
  "#0EA5E9", // 17. Sky blue
  "#E11D48", // 18. Rose
  "#FBBF24", // 19. Yellow
  "var(--brand-primary-hover)", // 20. Deep purple
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

/**
 * Blend two `#rrggbb` colors, `weight` being the share of `hex`.
 *
 * A JS equivalent of CSS `color-mix`, for the places that need the resolved
 * value rather than a style string — canvas fills, most notably.
 */
export function mixHex(hex: string, other: string, weight: number): string {
  const parse = (c: string): [number, number, number] => {
    const h = c.replace("#", "");
    const full =
      h.length === 3
        ? h
            .split("")
            .map((d) => d + d)
            .join("")
        : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  };
  const w = Math.min(1, Math.max(0, weight));
  const a = parse(hex);
  const b = parse(other);
  const channel = (i: number) => Math.round(a[i] * w + b[i] * (1 - w));
  const hexPart = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hexPart(channel(0))}${hexPart(channel(1))}${hexPart(channel(2))}`;
}


