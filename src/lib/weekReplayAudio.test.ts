/**
 * Week Replay audio schedule tests: onset rate limiting, density folding into
 * velocity, the map-to-pitch-and-pan mapping, chimes, and pad sampling.
 *
 * Only buildAudioSchedule is covered here — it is the pure half of the engine,
 * and the half the video export depends on being deterministic, since a shared
 * clip has to sound like what was on screen.
 */
import { describe, it, expect } from "vitest";

import { buildAudioSchedule, type ReplayAudioEvent } from "./weekReplayAudio";
import { buildPlaybackTimeline, SUBCATEGORY_PALETTE } from "./weekReplay";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_START = new Date(2026, 6, 20).getTime(); // Monday local
const WEEK_END = WEEK_START + 7 * DAY_MS;

const timeline = buildPlaybackTimeline(WEEK_START, WEEK_END, []);

/** Comfortably past the onset floor plus its jitter. */
const CLEAR_GAP_MS = 400;

function event(
  playMs: number,
  overrides: Partial<ReplayAudioEvent> = {},
): ReplayAudioEvent {
  return {
    playMs,
    panX: 0.5,
    posY: 0.5,
    color: SUBCATEGORY_PALETTE[0],
    ...overrides,
  };
}

describe("buildAudioSchedule", () => {
  it("sounds well-separated events individually", () => {
    const schedule = buildAudioSchedule(
      [event(0), event(CLEAR_GAP_MS), event(CLEAR_GAP_MS * 2)],
      [],
      timeline,
    );
    expect(schedule.ticks.map((t) => t.playMs)).toEqual([
      0,
      CLEAR_GAP_MS,
      CLEAR_GAP_MS * 2,
    ]);
  });

  it("merges events landing close together into one note", () => {
    const schedule = buildAudioSchedule(
      [event(1000), event(1030), event(1060), event(5000)],
      [],
      timeline,
    );
    expect(schedule.ticks).toHaveLength(2);
    expect(schedule.ticks[0].playMs).toBe(1000);
    expect(schedule.ticks[1].playMs).toBe(5000);
  });

  it("rate limits onsets so a dense stretch can't become a rattle", () => {
    // 60 events over 3s would be 20 notes a second unmetered.
    const dense = Array.from({ length: 60 }, (_, i) => event(i * 50));
    const schedule = buildAudioSchedule(dense, [], timeline);
    expect(schedule.ticks.length).toBeLessThan(20);
    for (let i = 1; i < schedule.ticks.length; i++) {
      const gap = schedule.ticks[i].playMs - schedule.ticks[i - 1].playMs;
      expect(gap).toBeGreaterThanOrEqual(165);
    }
  });

  it("folds skipped events into the surviving note's velocity", () => {
    const sparse = buildAudioSchedule([event(0)], [], timeline);
    const dense = buildAudioSchedule(
      [event(0), ...Array.from({ length: 12 }, (_, i) => event(20 + i * 20))],
      [],
      timeline,
    );
    // Density is heard as weight rather than as more onsets.
    expect(dense.ticks[0].level).toBeGreaterThan(sparse.ticks[0].level);
    for (const tick of dense.ticks) {
      expect(tick.level).toBeLessThanOrEqual(1);
      expect(tick.level).toBeGreaterThan(0);
    }
  });

  it("maps west-to-east onto the stereo field, short of hard panning", () => {
    const schedule = buildAudioSchedule(
      [event(0, { panX: 0 }), event(CLEAR_GAP_MS, { panX: 1 }), event(CLEAR_GAP_MS * 2, { panX: 0.5 })],
      [],
      timeline,
    );
    expect(schedule.ticks[0].panX).toBeCloseTo(-1, 6);
    expect(schedule.ticks[1].panX).toBeCloseTo(1, 6);
    expect(schedule.ticks[2].panX).toBeCloseTo(0, 6);
  });

  it("clamps pan for points that fall outside the crop", () => {
    const schedule = buildAudioSchedule(
      [event(0, { panX: -3 }), event(CLEAR_GAP_MS, { panX: 4 })],
      [],
      timeline,
    );
    expect(schedule.ticks[0].panX).toBe(-1);
    expect(schedule.ticks[1].panX).toBe(1);
  });

  it("gives a category one pitch within a chord, and the busiest the lowest", () => {
    const [first, second] = SUBCATEGORY_PALETTE;
    const schedule = buildAudioSchedule(
      [
        event(0, { color: first }),
        event(CLEAR_GAP_MS, { color: first }),
        event(CLEAR_GAP_MS * 2, { color: second }),
      ],
      [],
      timeline,
    );
    expect(schedule.ticks[0].freqHz).toBe(schedule.ticks[1].freqHz);
    // Palette order is descending event count upstream, so index 0 sits lowest.
    expect(schedule.ticks[2].freqHz).toBeGreaterThan(schedule.ticks[0].freqHz);
  });

  it("moves a category's pitch as the harmony turns", () => {
    // The same category early and late in the week takes the same seat in
    // different chords, which is what makes a melody out of the data.
    const [color] = SUBCATEGORY_PALETTE;
    const schedule = buildAudioSchedule(
      Array.from({ length: 8 }, (_, i) =>
        event((i / 8) * timeline.durationMs, { color }),
      ),
      [],
      timeline,
    );
    const pitches = new Set(schedule.ticks.map((t) => t.freqHz));
    expect(pitches.size).toBeGreaterThan(1);
  });

  it("keeps every pitch inside the one mode, so nothing can clash", () => {
    // F Dorian from F3: any subset of these is consonant in any order.
    const allowed = new Set<number>();
    for (const semitone of [0, 2, 3, 5, 7, 9, 10, 12, 14, 17, 19, 21, 22, 24, 26]) {
      for (const octave of [1, 2, 4]) {
        allowed.add(
          Math.round(174.61 * Math.pow(2, semitone / 12) * octave * 100) / 100,
        );
      }
    }
    const events = SUBCATEGORY_PALETTE.flatMap((color, i) =>
      Array.from({ length: 4 }, (_, k) =>
        event(((i * 4 + k) / (SUBCATEGORY_PALETTE.length * 4)) * timeline.durationMs, {
          color,
          posY: k % 2 ? 0.1 : 0.9,
        }),
      ),
    );
    const schedule = buildAudioSchedule(events, [], timeline);
    expect(schedule.ticks.length).toBeGreaterThan(5);
    for (const tick of schedule.ticks) {
      expect(allowed.has(Math.round(tick.freqHz * 100) / 100)).toBe(true);
    }
  });

  it("gives each category its own timbre, stable across the week", () => {
    const events = SUBCATEGORY_PALETTE.slice(0, 6).flatMap((color, i) => [
      event(i * CLEAR_GAP_MS * 2, { color }),
      event(i * CLEAR_GAP_MS * 2 + CLEAR_GAP_MS, { color }),
    ]);
    const schedule = buildAudioSchedule(events, [], timeline);
    const byColour = new Map<number, Set<number>>();
    schedule.ticks.forEach((t, i) => {
      const bucket = byColour.get(i) ?? new Set();
      bucket.add(t.timbre);
      byColour.set(i, bucket);
    });
    // Six categories cover six distinct instruments.
    expect(new Set(schedule.ticks.map((t) => t.timbre)).size).toBe(6);
    // A repeat of the same category keeps its instrument.
    for (let i = 0; i + 1 < schedule.ticks.length; i += 2) {
      expect(schedule.ticks[i].timbre).toBe(schedule.ticks[i + 1].timbre);
    }
  });

  it("turns the harmony twice across the replay", () => {
    // Sampled through one category, whose seat moves with the chord under it.
    const [color] = SUBCATEGORY_PALETTE;
    const schedule = buildAudioSchedule(
      Array.from({ length: 24 }, (_, i) =>
        event((i / 24) * timeline.durationMs, { color, posY: 0.9 }),
      ),
      [],
      timeline,
    );
    const sequence = schedule.ticks.map((t) => Math.round(t.freqHz));
    // Four distinct seats across the progression, and it repeats on the second
    // pass rather than wandering.
    expect(new Set(sequence).size).toBeGreaterThan(1);
    expect(new Set(sequence).size).toBeLessThanOrEqual(4);
    expect(sequence[0]).toBe(sequence[sequence.length - 1]);
  });

  it("lands each chime on a root drawn from the progression", () => {
    const schedule = buildAudioSchedule(
      [event(0)],
      [
        { playStartMs: 0, isPhoto: false },
        { playStartMs: timeline.durationMs * 0.3, isPhoto: true },
      ],
      timeline,
    );
    // F Ab Bb Eb — the four chord roots, an octave above the pad's pedal.
    const roots = [174.61, 207.65, 233.08, 311.13].map((hz) => Math.round(hz));
    for (const chime of schedule.chimes) {
      expect(roots).toContain(Math.round(chime.rootHz));
    }
  });

  it("lifts northern events an octave so the map is audible vertically", () => {
    const schedule = buildAudioSchedule(
      [event(0, { posY: 0.1 }), event(CLEAR_GAP_MS, { posY: 0.9 })],
      [],
      timeline,
    );
    expect(schedule.ticks[0].freqHz).toBeCloseTo(schedule.ticks[1].freqHz * 2, 4);
  });

  it("keeps every pitch in a range these voices can carry", () => {
    const ticks = SUBCATEGORY_PALETTE.flatMap((color) =>
      buildAudioSchedule(
        [event(0, { color, posY: 0.1 }), event(CLEAR_GAP_MS, { color, posY: 0.9 })],
        [],
        timeline,
      ).ticks.map((t) => t.freqHz),
    );
    expect(ticks.length).toBeGreaterThan(10);
    for (const freq of ticks) {
      // F3 at the bottom, under two octaves above it at the top: warm enough
      // to blend, never shrill.
      expect(freq).toBeGreaterThanOrEqual(174);
      expect(freq).toBeLessThan(800);
    }
  });

  it("treats an unpalettized color as the root rather than dropping it", () => {
    const schedule = buildAudioSchedule(
      [event(0, { color: "#94a3b8", posY: 0.9 })],
      [],
      timeline,
    );
    expect(schedule.ticks).toHaveLength(1);
    expect(schedule.ticks[0].freqHz).toBeCloseTo(174.61, 2);
  });

  it("emits one chime per key moment and flags photo events", () => {
    const schedule = buildAudioSchedule(
      [event(0)],
      [
        { playStartMs: 2000, isPhoto: true },
        { playStartMs: 6000, isPhoto: false },
      ],
      timeline,
    );
    expect(schedule.chimes.map(({ playMs, isPhoto }) => ({ playMs, isPhoto }))).toEqual([
      { playMs: 2000, isPhoto: true },
      { playMs: 6000, isPhoto: false },
    ]);
  });

  it("sorts unordered input before merging", () => {
    const schedule = buildAudioSchedule(
      [event(9000), event(1000), event(5000)],
      [],
      timeline,
    );
    expect(schedule.ticks.map((t) => t.playMs)).toEqual([1000, 5000, 9000]);
  });

  it("is deterministic, so the export matches live playback", () => {
    const events = Array.from({ length: 90 }, (_, i) =>
      event(i * 120, {
        panX: (i % 10) / 10,
        posY: (i % 7) / 7,
        color: SUBCATEGORY_PALETTE[i % SUBCATEGORY_PALETTE.length],
      }),
    );
    const a = buildAudioSchedule(events, [], timeline);
    const b = buildAudioSchedule([...events].reverse(), [], timeline);
    expect(JSON.stringify(b.ticks)).toBe(JSON.stringify(a.ticks));
  });

  it("ends with the timeline and covers it with pad points", () => {
    const schedule = buildAudioSchedule([event(0)], [], timeline);
    expect(schedule.endMs).toBe(timeline.durationMs);
    expect(schedule.padPoints.length).toBeGreaterThan(10);
    expect(schedule.padPoints[0].playMs).toBe(0);
    const last = schedule.padPoints[schedule.padPoints.length - 1];
    expect(last.playMs).toBe(timeline.durationMs);
    for (const pt of schedule.padPoints) {
      expect(pt.nightLevel).toBeGreaterThanOrEqual(0);
      expect(pt.nightLevel).toBeLessThanOrEqual(1);
      expect(pt.weekendLevel).toBeGreaterThanOrEqual(0);
      expect(pt.weekendLevel).toBeLessThanOrEqual(1);
    }
  });

  it("finds both night and day in a week's worth of pad points", () => {
    const schedule = buildAudioSchedule([], [], timeline);
    const levels = schedule.padPoints.map((p) => p.nightLevel);
    expect(Math.max(...levels)).toBeGreaterThan(0.9);
    expect(Math.min(...levels)).toBeLessThan(0.1);
  });

  it("does not mutate the events it is given", () => {
    const events = [event(9000), event(1000)];
    const snapshot = JSON.stringify(events);
    buildAudioSchedule(events, [], timeline);
    expect(JSON.stringify(events)).toBe(snapshot);
  });

  it("handles an empty week without throwing", () => {
    const schedule = buildAudioSchedule([], [], timeline);
    expect(schedule.ticks).toEqual([]);
    expect(schedule.chimes).toEqual([]);
    expect(schedule.endMs).toBe(timeline.durationMs);
  });
});
