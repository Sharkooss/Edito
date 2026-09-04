import { describe, it, expect } from "vitest";
import { computeSchedule, projectDuration, audibleTracks } from "./scheduling";
import type { Clip, Track } from "../api/client";

const clip = (over: Partial<Clip>): Clip => ({
  id: "c",
  trackId: "t",
  mediaId: "m",
  startTime: 0,
  sourceOffset: 0,
  duration: 4,
  name: "clip",
  gain: 1,
  fadeIn: 0,
  fadeOut: 0,
  effects: "{}",
  ...over,
});
const track = (over: Partial<Track>): Track => ({
  id: "t",
  name: "T",
  orderIndex: 0,
  color: "",
  volume: 1,
  pan: 0,
  muted: false,
  soloed: false,
  ...over,
});
const durations = new Map([["m", 10]]);

describe("computeSchedule", () => {
  it("delays a clip that starts after the playhead", () => {
    const [e] = computeSchedule([clip({ startTime: 3 })], 1, durations);
    expect(e.when).toBeCloseTo(2);
    expect(e.elapsed).toBeCloseTo(0);
    expect(e.duration).toBeCloseTo(4);
  });

  it("reports how far into a clip the playhead already is", () => {
    const [e] = computeSchedule([clip({ startTime: 2, sourceOffset: 1, duration: 6 })], 5, durations);
    expect(e.when).toBeCloseTo(0);
    expect(e.elapsed).toBeCloseTo(3);
    expect(e.duration).toBeCloseTo(3);
  });

  it("skips clips that finished before the playhead", () => {
    expect(computeSchedule([clip({ startTime: 0, duration: 2 })], 5, durations)).toEqual([]);
  });

  it("clamps a clip window that runs past the end of its source", () => {
    // Source is 10 s; asking for 8 s from offset 6 must yield 4 s, not 8.
    const [e] = computeSchedule([clip({ sourceOffset: 6, duration: 8 })], 0, durations);
    expect(e.duration).toBeCloseTo(4);
  });

  it("clamps in timeline seconds, accounting for speed", () => {
    // Source 10 s, offset 6 -> 4 s of source left. At 2x that is only 2 s of timeline.
    const fast = clip({ sourceOffset: 6, duration: 8, effects: JSON.stringify({ speed: 2 }) });
    expect(computeSchedule([fast], 0, durations)[0].duration).toBeCloseTo(2);
    // At 0.5x the same 4 s of source stretches to 8 s of timeline, so nothing is clipped.
    const slow = clip({ sourceOffset: 6, duration: 8, effects: JSON.stringify({ speed: 0.5 }) });
    expect(computeSchedule([slow], 0, durations)[0].duration).toBeCloseTo(8);
  });

  it("skips clips whose media length is unknown", () => {
    expect(computeSchedule([clip({ mediaId: "ghost" })], 0, durations)).toEqual([]);
  });

  it("carries gain, fades and normalised effects through", () => {
    const [e] = computeSchedule(
      [clip({ gain: 0.4, fadeIn: 0.5, fadeOut: 1, effects: '{"pitch":7}' })],
      0,
      durations,
    );
    expect(e.gain).toBe(0.4);
    expect(e.fadeIn).toBe(0.5);
    expect(e.fadeOut).toBe(1);
    expect(e.effects.pitch).toBe(7);
    expect(e.effects.speed).toBe(1); // filled from the defaults
  });

  it("normalises a corrupt effects payload instead of failing", () => {
    const [e] = computeSchedule([clip({ effects: "not json" })], 0, durations);
    expect(e.effects.speed).toBe(1);
  });
});

describe("projectDuration", () => {
  it("is the end of the last clip", () => {
    expect(
      projectDuration([clip({ startTime: 0, duration: 3 }), clip({ startTime: 10, duration: 2 })]),
    ).toBeCloseTo(12);
  });
  it("is zero with no clips", () => {
    expect(projectDuration([])).toBe(0);
  });
});

describe("audibleTracks", () => {
  it("returns unmuted tracks when nothing is soloed", () => {
    const s = audibleTracks([track({ id: "a" }), track({ id: "b", muted: true })]);
    expect(s.has("a")).toBe(true);
    expect(s.has("b")).toBe(false);
  });
  it("returns only soloed tracks when any is soloed", () => {
    const s = audibleTracks([
      track({ id: "a" }),
      track({ id: "b", soloed: true }),
      track({ id: "c", soloed: true, muted: true }),
    ]);
    expect(s.has("a")).toBe(false);
    expect(s.has("b")).toBe(true);
    expect(s.has("c")).toBe(true);
  });
});
