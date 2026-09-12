/**
 * Known-lag rules for the weekly QA appendix (Appendix B).
 *
 * Kept free of Playwright and network calls so the rules can be unit-tested
 * without launching the audit.
 */

// A metric this close to its city's consensus end date (or ahead of it) has caught up.
export const CAUGHT_UP_LAG_DAYS = 3;
// Lags at or below this are ordinary publishing jitter and are not recorded.
export const NOTABLE_LAG_DAYS = 7;
// How far past its recorded range a known lag may run before it counts as stalled.
export const STALL_GRACE_DAYS = 7;
// Half-width of the normal range recorded around an observed lag.
export const RANGE_HALF_WIDTH_DAYS = 4;

/**
 * Decide what a metric's lag behind its city means for Appendix B.
 *
 * `lagDays` is the city's consensus end date minus the metric's end date:
 * positive when the metric is behind, zero or negative when it is level with
 * or ahead of the city. `knownLag` is the metric's Appendix B entry, if any.
 *
 * Returns one of:
 *   { kind: "none" }
 *   { kind: "new", normalLagRange }  not on record and notably behind
 *   { kind: "resolved" }             on record and caught up
 *   { kind: "stalled", maxLag }      on record and well past its range
 *
 * A recorded range is never refit from a single reading. Monthly and quarterly
 * feeds swing across a wide lag between releases, so refitting to one low
 * reading raises false stall alerts, and refitting to one high reading hides
 * real stalls.
 */
export function assessLag(lagDays, knownLag) {
  if (!Number.isFinite(lagDays)) return { kind: "none" };

  if (!knownLag) {
    if (lagDays <= NOTABLE_LAG_DAYS) return { kind: "none" };
    return {
      kind:           "new",
      normalLagRange: [Math.max(0, lagDays - RANGE_HALF_WIDTH_DAYS), lagDays + RANGE_HALF_WIDTH_DAYS],
    };
  }

  if (lagDays <= CAUGHT_UP_LAG_DAYS) return { kind: "resolved" };

  const [, maxLag] = knownLag.normalLagRange || [0, 30];
  if (lagDays > maxLag + STALL_GRACE_DAYS) return { kind: "stalled", maxLag };
  return { kind: "none" };
}
