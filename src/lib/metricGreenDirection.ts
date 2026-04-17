/**
 * Metric `greendirection` tells the UI whether an increase or decrease is
 * treated as favorable (green) for that metric.
 */

export function normalizeGreenDirection(
  greendirection?: string | null
): "up" | "down" {
  const g = (greendirection ?? "down").toString().trim().toLowerCase();
  return g === "up" ? "up" : "down";
}

/** Good/bad for change cells from raw direction flags (flat → neither). */
export function changeGoodBadFromGreenDirection(
  isIncrease: boolean,
  isDecrease: boolean,
  greendirection?: string | null
): { isGood: boolean; isBad: boolean } {
  const dir = normalizeGreenDirection(greendirection);
  const isGood = dir === "up" ? isIncrease : isDecrease;
  const isBad = dir === "up" ? isDecrease : isIncrease;
  return { isGood, isBad };
}
