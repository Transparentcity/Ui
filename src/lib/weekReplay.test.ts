/**
 * Week Replay timeline math tests: linear day mapping, key-event holds,
 * scrub round-trips, day/night/weekend signals, and group color assignment.
 */
import { describe, it, expect } from "vitest";

import {
  DAY_PLAYBACK_MS,
  KEY_HOLD_PLAYBACK_MS,
  KEY_HOLD_RATE,
  SUBCATEGORY_PALETTE,
  buildDayNightBands,
  buildEventCallout,
  buildPlaybackTimeline,
  buildSubcategoryColors,
  stripLeadingIcons,
  dayIndexInWindow,
  eventDateKey,
  eventSubcategoryKey,
  eventTimeMs,
  formatEventTime,
  formatPlaybackClock,
  formatWindowRange,
  groupColor,
  groupLabel,
  GROUP_COLORS,
  isNightAt,
  isWeekendAt,
  metricDisplayName,
  metricIcon,
  nightness,
  weekendness,
  weekReplayScopePhrase,
  windowDateMs,
  windowDayLabels,
} from "./weekReplay";
import { LAYER_COLOR_PALETTE } from "./layerColors";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_START = new Date(2026, 6, 20).getTime(); // Monday local
const WEEK_END = WEEK_START + 7 * DAY_MS;

describe("buildPlaybackTimeline", () => {
  it("maps 7 days linearly with no key events", () => {
    const tl = buildPlaybackTimeline(WEEK_START, WEEK_END, []);
    expect(tl.durationMs).toBeCloseTo(7 * DAY_PLAYBACK_MS, 5);
    expect(tl.holds).toHaveLength(0);
    // Midpoint of playback = midpoint of the week.
    expect(tl.weekTimeAt(tl.durationMs / 2)).toBeCloseTo(
      WEEK_START + 3.5 * DAY_MS,
      -2
    );
    // Boundaries clamp.
    expect(tl.weekTimeAt(-100)).toBe(WEEK_START);
    expect(tl.weekTimeAt(tl.durationMs + 100)).toBe(WEEK_END);
  });

  it("adds one hold per key event and extends the duration", () => {
    const keyTime = WEEK_START + 2 * DAY_MS; // Wednesday midnight
    const tl = buildPlaybackTimeline(WEEK_START, WEEK_END, [keyTime]);
    expect(tl.holds).toHaveLength(1);
    // During the hold, week-time advances at KEY_HOLD_RATE, so the extra
    // playback time is holdMs * (1 - rate) versus the linear baseline.
    const expected =
      7 * DAY_PLAYBACK_MS + KEY_HOLD_PLAYBACK_MS * (1 - KEY_HOLD_RATE);
    expect(tl.durationMs).toBeCloseTo(expected, 5);
    // The hold starts exactly when the key event is reached.
    expect(tl.weekTimeAt(tl.holds[0].playStartMs)).toBeCloseTo(keyTime, -2);
  });

  it("merges key events that fall inside a previous hold", () => {
    const t1 = WEEK_START + 1 * DAY_MS;
    // t2 lands within the week-time span consumed by t1's hold.
    const holdWeekSpan = KEY_HOLD_PLAYBACK_MS * (DAY_MS / DAY_PLAYBACK_MS) * KEY_HOLD_RATE;
    const t2 = t1 + holdWeekSpan / 2;
    const tl = buildPlaybackTimeline(WEEK_START, WEEK_END, [t1, t2]);
    expect(tl.holds).toHaveLength(1);
  });

  it("round-trips playTimeAt(weekTimeAt(x)) outside holds", () => {
    const keyTime = WEEK_START + 3 * DAY_MS + 5 * 60 * 60 * 1000;
    const tl = buildPlaybackTimeline(WEEK_START, WEEK_END, [keyTime]);
    for (const f of [0.05, 0.2, 0.5, 0.8, 0.99]) {
      const p = f * tl.durationMs;
      const w = tl.weekTimeAt(p);
      expect(tl.playTimeAt(w)).toBeCloseTo(p, 3);
    }
  });

  it("keeps the mapping monotonic", () => {
    const keys = [
      WEEK_START + 0.5 * DAY_MS,
      WEEK_START + 2 * DAY_MS,
      WEEK_START + 6.9 * DAY_MS,
    ];
    const tl = buildPlaybackTimeline(WEEK_START, WEEK_END, keys);
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const w = tl.weekTimeAt((i / 100) * tl.durationMs);
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
    expect(prev).toBe(WEEK_END);
  });

  it("ignores key events outside the window", () => {
    const tl = buildPlaybackTimeline(WEEK_START, WEEK_END, [
      WEEK_START - DAY_MS,
      WEEK_END + DAY_MS,
    ]);
    expect(tl.holds).toHaveLength(0);
    expect(tl.durationMs).toBeCloseTo(7 * DAY_PLAYBACK_MS, 5);
  });
});

/** Local epoch ms at `hour` on day `dayOffset` of the test week. */
function at(dayOffset: number, hour: number, minute = 0): number {
  const d = new Date(WEEK_START);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + dayOffset,
    hour,
    minute,
  ).getTime();
}

describe("nightness", () => {
  it("is 0 through the day and 1 deep at night", () => {
    expect(nightness(at(0, 12))).toBe(0);
    expect(nightness(at(0, 8))).toBe(0);
    expect(nightness(at(0, 17))).toBe(0);
    expect(nightness(at(0, 2))).toBe(1);
    expect(nightness(at(0, 23))).toBe(1);
  });

  it("ramps smoothly and monotonically through dawn and dusk", () => {
    expect(nightness(at(0, 6, 30))).toBeCloseTo(0.5, 5);
    expect(nightness(at(0, 19))).toBeCloseTo(0.5, 5);
    // No steps anywhere in the day: the map scrim is driven straight off this.
    let prev = nightness(at(0, 0));
    for (let m = 5; m <= 24 * 60; m += 5) {
      const next = nightness(at(0, 0, m));
      expect(Math.abs(next - prev)).toBeLessThan(0.05);
      prev = next;
    }
  });
});

describe("weekendness", () => {
  // WEEK_START is a Monday, so day 5 = Saturday and day 6 = Sunday.
  it("is 1 on Saturday and Sunday, 0 on weekdays", () => {
    expect(weekendness(at(0, 12))).toBe(0);
    expect(weekendness(at(5, 12))).toBe(1);
    expect(weekendness(at(6, 12))).toBe(1);
    expect(isWeekendAt(at(5, 12))).toBe(true);
    expect(isWeekendAt(at(0, 12))).toBe(false);
  });

  it("cross-fades continuously across the midnight boundary", () => {
    // Late Friday evening is already partway into the weekend...
    const fridayLate = weekendness(at(4, 23, 15));
    expect(fridayLate).toBeGreaterThan(0);
    expect(fridayLate).toBeLessThan(0.5);
    // ...and early Saturday is still finishing the fade in.
    const saturdayEarly = weekendness(at(5, 0, 45));
    expect(saturdayEarly).toBeGreaterThan(0.5);
    expect(saturdayEarly).toBeLessThan(1);
    // Midnight itself is the midpoint from both sides — no step.
    expect(weekendness(at(5, 0) - 1)).toBeCloseTo(0.5, 4);
    expect(weekendness(at(5, 0) + 1)).toBeCloseTo(0.5, 4);
    // Monday morning has fully faded back out.
    expect(weekendness(at(7, 3))).toBe(0);
  });

  it("rises and falls monotonically through the weekend", () => {
    let prev = -1;
    for (let m = 0; m <= 36 * 60; m += 5) {
      const v = weekendness(at(4, 12, m)); // Friday noon → Sunday midnight
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(prev).toBe(1);
  });
});

describe("isNightAt", () => {
  it("matches the scrubber night window (8pm–6am local)", () => {
    expect(isNightAt(at(0, 12))).toBe(false);
    expect(isNightAt(at(0, 19))).toBe(false);
    expect(isNightAt(at(0, 20))).toBe(true);
    expect(isNightAt(at(0, 23))).toBe(true);
    expect(isNightAt(at(1, 5))).toBe(true);
    expect(isNightAt(at(1, 6))).toBe(false);
  });
});

describe("buildDayNightBands", () => {
  it("tiles the week with day and night stretches", () => {
    const tl = buildPlaybackTimeline(WEEK_START, WEEK_END, []);
    const bands = buildDayNightBands(tl);
    // Three per day for a week starting at local midnight: 00–06 night,
    // 06–20 day, 20–24 night.
    expect(bands.length).toBe(21);
    expect(bands[0].isNight).toBe(true);
    expect(bands[1].isNight).toBe(false);
    // Bands tile the whole scrubber with no gaps or overlap.
    expect(bands[0].startF).toBeCloseTo(0, 6);
    expect(bands[bands.length - 1].endF).toBeCloseTo(1, 6);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].startF).toBeCloseTo(bands[i - 1].endF, 6);
    }
  });

  it("keeps every band inside one calendar day", () => {
    const tl = buildPlaybackTimeline(WEEK_START, WEEK_END, []);
    for (const band of buildDayNightBands(tl)) {
      const from = new Date(tl.weekTimeAt(band.startF * tl.durationMs));
      // End is exclusive, so step back inside the band before checking.
      const to = new Date(tl.weekTimeAt(band.endF * tl.durationMs) - 1);
      expect(to.getDate()).toBe(from.getDate());
    }
  });

  it("marks only the weekend stretches", () => {
    const tl = buildPlaybackTimeline(WEEK_START, WEEK_END, []);
    const weekend = buildDayNightBands(tl).filter((b) => b.isWeekend);
    expect(weekend.length).toBeGreaterThan(0);
    // Saturday 00:00 through Sunday 24:00 of a Monday-start week.
    const from = (at(5, 0) - WEEK_START) / (7 * DAY_MS);
    const to = (at(7, 0) - WEEK_START) / (7 * DAY_MS);
    for (const band of weekend) {
      expect(band.startF).toBeGreaterThanOrEqual(from - 1e-6);
      expect(band.endF).toBeLessThanOrEqual(to + 1e-6);
    }
  });

  it("stretches bands through key-event holds", () => {
    const keyTime = at(1, 12);
    const tl = buildPlaybackTimeline(WEEK_START, WEEK_END, [keyTime]);
    const bands = buildDayNightBands(tl);
    // Positions come from playTimeAt, so the band containing the hold is
    // wider than the same stretch would be on a linear timeline.
    const held = bands.find(
      (b) =>
        tl.weekTimeAt(b.startF * tl.durationMs) <= keyTime &&
        tl.weekTimeAt(b.endF * tl.durationMs) >= keyTime,
    );
    expect(held).toBeDefined();
    const linear = buildDayNightBands(
      buildPlaybackTimeline(WEEK_START, WEEK_END, []),
    );
    const sameIndex = bands.indexOf(held!);
    expect(held!.endF - held!.startF).toBeGreaterThan(
      linear[sameIndex].endF - linear[sameIndex].startF,
    );
  });
});

describe("dayIndexInWindow", () => {
  it("returns 1-based day indices clamped to 1..7", () => {
    expect(dayIndexInWindow(WEEK_START, WEEK_START)).toBe(1);
    expect(dayIndexInWindow(WEEK_START + 3.2 * DAY_MS, WEEK_START)).toBe(4);
    expect(dayIndexInWindow(WEEK_START + 10 * DAY_MS, WEEK_START)).toBe(7);
  });
});

describe("group colors", () => {
  it("maps known groups and falls back to other", () => {
    expect(groupColor("crime")).toBe(GROUP_COLORS.crime);
    expect(groupColor("nonsense")).toBe(GROUP_COLORS.other);
    expect(groupLabel("311")).toBe("311");
    expect(groupLabel("nonsense")).toBe("Other");
  });
});

describe("metric icons", () => {
  it("extracts the leading emoji and the display name", () => {
    expect(metricIcon("🧽 311 Offensive Graffiti Cases")).toBe("🧽");
    expect(metricDisplayName("🧽 311 Offensive Graffiti Cases")).toBe(
      "311 Offensive Graffiti Cases",
    );
    // Multi-emoji prefixes and variation selectors.
    expect(metricIcon("📋✅ New Residential Construction Permits Issued")).toBe(
      "📋✅",
    );
    expect(metricIcon("🏗️ Housing Units in Pipeline")).toBe("🏗️");
    expect(metricDisplayName("🏗️ Housing Units in Pipeline")).toBe(
      "Housing Units in Pipeline",
    );
  });

  it("returns null / unchanged name when there is no icon", () => {
    expect(metricIcon("Larceny Theft Incidents")).toBeNull();
    expect(metricDisplayName("Larceny Theft Incidents")).toBe(
      "Larceny Theft Incidents",
    );
    expect(metricIcon("")).toBeNull();
  });
});

describe("stripLeadingIcons", () => {
  it("removes every leading icon run, not just the first", () => {
    // Labels fall back to the metric name server-side, so the emoji can arrive
    // more than once; anything left over renders as a duplicate of the icon.
    expect(stripLeadingIcons("🏢 🏢 Business Location Openings")).toBe(
      "Business Location Openings",
    );
    expect(stripLeadingIcons("🏢🏢 Business Location Openings")).toBe(
      "Business Location Openings",
    );
    expect(stripLeadingIcons("🏗️  📋✅  Permits Issued")).toBe("Permits Issued");
  });

  it("leaves icon-free text and trailing icons alone", () => {
    expect(stripLeadingIcons("Larceny Theft Incidents")).toBe(
      "Larceny Theft Incidents",
    );
    expect(stripLeadingIcons("Bay St cleanup 🧽")).toBe("Bay St cleanup 🧽");
    expect(stripLeadingIcons("")).toBe("");
  });
});

describe("buildEventCallout", () => {
  const base = {
    label: "🏢 Business Location Openings",
    metric_name: "🏢 Business Location Openings",
    subcategory: "Business Location Openings",
    dash_category: "economy",
    address: null,
    ts: "2026-08-10T09:30",
  };

  it("shows the icon once and never repeats the title underneath", () => {
    const callout = buildEventCallout(base);
    expect(callout.icon).toBe("🏢");
    expect(callout.title).toBe("Business Location Openings");
    // Subcategory and metric both echo the title, so the section carries it.
    expect(callout.detail).toBe("Economy · 9:30 AM");
    expect(callout.detail).not.toContain("Business Location Openings");
  });

  it("leads the detail with the row's own value when the dataset has one", () => {
    // A week of openings then reads as a list of businesses, while the title
    // stays consistent for the metric.
    const callout = buildEventCallout({
      ...base,
      label: "Business Location Openings",
      detail: "Corgi Cafe",
      address: "1200 Bay St",
    });
    expect(callout.title).toBe("Business Location Openings");
    expect(callout.detail).toBe("Corgi Cafe · 1200 Bay St · 9:30 AM");
  });

  it("ignores a row value that only repeats the title", () => {
    const callout = buildEventCallout({
      ...base,
      label: "Abandoned Vehicle",
      metric_name: "🚗 Abandoned Vehicle",
      detail: "abandoned vehicle",
      subcategory: null,
    });
    // Falls through to the dashboard section rather than echoing the title.
    expect(callout.detail).toBe("Economy · 9:30 AM");
  });

  it("titles every metric by its own name, whatever the row supplied", () => {
    // Oakland's property crime rows carry their own subtype text and used to be
    // titled by it, so the same metric read differently city to city.
    const callout = buildEventCallout({
      // Already normalized server-side (see place_week_events._title_case).
      label: "Burglary - Auto",
      metric_name: "📦 Property Crime Incidents",
      subcategory: "Crime",
      dash_category: "public_safety",
      address: "1200 Broadway",
      ts: "2026-08-10T09:30",
    });
    expect(callout.icon).toBe("📦");
    expect(callout.title).toBe("Property Crime Incidents");
    // The row's subtype moves to the line beneath rather than disappearing.
    expect(callout.detail).toBe("Burglary - Auto · 1200 Broadway · 9:30 AM");
  });

  it("puts the row's own value above its subtype when it has both", () => {
    const callout = buildEventCallout({
      ...base,
      label: "Storefront Opening",
      detail: "Blue Bottle Coffee",
      subcategory: "Retail",
      address: "1 Ferry Building",
    });
    expect(callout.title).toBe("Business Location Openings");
    expect(callout.detail).toBe("Blue Bottle Coffee · 1 Ferry Building · 9:30 AM");
  });

  it("skips a subtype that merely echoes the metric name", () => {
    const callout = buildEventCallout({
      ...base,
      metric_name: "🚗 Abandoned Vehicle Complaints (311)",
      label: "Abandoned Vehicle",
      subcategory: "Services",
    });
    expect(callout.title).toBe("Abandoned Vehicle Complaints (311)");
    // "Abandoned Vehicle" is contained in the title, so it isn't repeated.
    expect(callout.detail).toBe("Services · 9:30 AM");
  });

  it("takes the icon from the label when the metric has none", () => {
    const callout = buildEventCallout({
      ...base,
      label: "🧽 Graffiti on Bay St",
      metric_name: "311 Cases",
      subcategory: null,
    });
    expect(callout.icon).toBe("🧽");
    expect(callout.title).toBe("311 Cases");
    expect(callout.detail).toBe("Graffiti on Bay St · 9:30 AM");
  });

  it("falls back to the label when the metric has no name at all", () => {
    const callout = buildEventCallout({
      ...base,
      label: "Graffiti on Bay St",
      metric_name: "",
    });
    expect(callout.title).toBe("Graffiti on Bay St");
  });

  it("omits a date-only timestamp's fake midnight", () => {
    const callout = buildEventCallout({ ...base, ts: "2026-08-10" });
    expect(callout.detail).toBe("Economy");
  });

  it("does not repeat the day, which the replay's clock already shows", () => {
    const callout = buildEventCallout(base);
    expect(callout.detail).not.toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
  });
});

describe("subcategory colors", () => {
  it("draws from the shared layer palette, minus brand purple", () => {
    // Categories should read as the same family the map layers use, and purple
    // is already spoken for here by key pins, the weekend wash, and the playhead.
    for (const color of SUBCATEGORY_PALETTE) {
      expect(LAYER_COLOR_PALETTE).toContain(color);
      expect(color.toLowerCase()).not.toBe("var(--brand-primary)");
    }
    expect(SUBCATEGORY_PALETTE.length).toBe(LAYER_COLOR_PALETTE.length - 1);
    // Order is preserved, so assignment stays stable against the shared list.
    expect(SUBCATEGORY_PALETTE[0]).toBe("#FF6B5A");
  });

  it("keys events by subcategory, falling back to the display group", () => {
    expect(eventSubcategoryKey({ subcategory: "Crime", group: "crime" })).toBe(
      "Crime",
    );
    expect(eventSubcategoryKey({ subcategory: "  ", group: "311" })).toBe("311");
    expect(eventSubcategoryKey({ subcategory: null, group: "permits" })).toBe(
      "Permits",
    );
  });

  it("assigns palette colors by descending count, deterministically", () => {
    const events = [
      { subcategory: "Crime", group: "crime" },
      { subcategory: "Crime", group: "crime" },
      { subcategory: "Crime", group: "crime" },
      { subcategory: "311", group: "311" },
      { subcategory: "311", group: "311" },
      { subcategory: "Permits", group: "permits" },
    ];
    const colors = buildSubcategoryColors(events);
    expect(colors.get("Crime")).toBe(SUBCATEGORY_PALETTE[0]);
    expect(colors.get("311")).toBe(SUBCATEGORY_PALETTE[1]);
    expect(colors.get("Permits")).toBe(SUBCATEGORY_PALETTE[2]);
    // Same input → same assignment.
    expect(buildSubcategoryColors(events)).toEqual(colors);
  });

  it("breaks count ties alphabetically and grays out overflow", () => {
    const events: Array<{ subcategory: string; group: string }> = [];
    for (let i = 0; i < SUBCATEGORY_PALETTE.length + 2; i++) {
      events.push({ subcategory: `Sub ${String.fromCharCode(65 + i)}`, group: "other" });
    }
    const colors = buildSubcategoryColors(events);
    expect(colors.get("Sub A")).toBe(SUBCATEGORY_PALETTE[0]);
    expect(colors.get(`Sub ${String.fromCharCode(65 + SUBCATEGORY_PALETTE.length)}`)).toBe(
      "#94a3b8",
    );
  });
});

describe("formatPlaybackClock", () => {
  it("renders playback position as a clock", () => {
    expect(formatPlaybackClock(0)).toBe("0:00");
    expect(formatPlaybackClock(9_400)).toBe("0:09");
    expect(formatPlaybackClock(24_360)).toBe("0:24");
    expect(formatPlaybackClock(60_000)).toBe("1:00");
    expect(formatPlaybackClock(83_500)).toBe("1:23");
  });

  it("floors, so the readout never claims a second that hasn't elapsed", () => {
    expect(formatPlaybackClock(999)).toBe("0:00");
    expect(formatPlaybackClock(26_712)).toBe("0:26");
  });

  it("clamps negatives rather than printing a negative clock", () => {
    expect(formatPlaybackClock(-500)).toBe("0:00");
  });

  it("covers the full range the timeline can produce", () => {
    // 7 days at DAY_PLAYBACK_MS, plus up to six key-event holds.
    const shortest = 7 * DAY_PLAYBACK_MS;
    const longest = shortest + 6 * KEY_HOLD_PLAYBACK_MS * (1 - KEY_HOLD_RATE);
    expect(formatPlaybackClock(shortest)).toBe("0:12");
    expect(formatPlaybackClock(longest)).toBe("0:26");
  });
});

describe("window labels", () => {
  it("formats same-month and cross-month ranges", () => {
    expect(formatWindowRange("2026-07-12", "2026-07-18")).toBe("Jul 12 – 18");
    expect(formatWindowRange("2026-07-28", "2026-08-03")).toBe("Jul 28 – Aug 3");
    expect(formatWindowRange("", "2026-08-03")).toBe("");
  });

  it("labels scrubber days with weekday + date", () => {
    const labels = windowDayLabels(new Date(2026, 6, 12).getTime()); // Sun Jul 12
    expect(labels).toHaveLength(7);
    expect(labels[0]).toBe("Sun 12");
    expect(labels[6]).toBe("Sat 18");
  });
});

describe("weekReplayScopePhrase", () => {
  it("uses at for places and in for districts and cities", () => {
    expect(weekReplayScopePhrase("Bay", true)).toBe("at Bay");
    expect(weekReplayScopePhrase("District 6", false)).toBe("in District 6");
    expect(weekReplayScopePhrase("San Francisco", false)).toBe("in San Francisco");
  });

  it("falls back when the label is empty", () => {
    expect(weekReplayScopePhrase("  ", true)).toBe("at your place");
    expect(weekReplayScopePhrase("", false)).toBe("in your city");
  });
});

describe("eventTimeMs / window dates", () => {
  it("treats date-only strings as local midnight (not UTC)", () => {
    const local = eventTimeMs("2026-07-25");
    expect(local).toBe(new Date(2026, 6, 25).getTime());
    // Must sit inside a local week window starting that day.
    const weekStart = windowDateMs("2026-07-25");
    const weekEnd = windowDateMs("2026-07-31") + DAY_MS;
    expect(local).toBeGreaterThanOrEqual(weekStart);
    expect(local).toBeLessThanOrEqual(weekEnd);
  });

  it("formats event times, dropping false precision at exact midnight", () => {
    // Datasets with a date but no time arrive as midnight — weekday only.
    // No weekday: the replay's clock already names the day above the callout.
    expect(formatEventTime("2026-07-30T20:50:00")).toBe("8:50 PM");
    // Date-only sources have no real time, so they get none rather than midnight.
    expect(formatEventTime("2026-07-30")).toBe("");
    expect(formatEventTime("2026-07-30T00:00:00.000")).toBe("");
    expect(formatEventTime("nonsense")).toBe("");
  });

  it("keeps naive datetimes local and keyed by calendar date", () => {
    expect(eventTimeMs("2026-07-25T00:00:00.000")).toBe(
      new Date(2026, 6, 25, 0, 0, 0).getTime(),
    );
    expect(eventDateKey("2026-07-28")).toBe("2026-07-28");
    expect(eventDateKey("2026-07-28T14:30:00+00:00")).toBe("2026-07-28");
  });
});
