import { describe, it, expect } from "vitest";
import { snapTime, snapCandidates, gridInterval } from "./snapping";
import type { Clip } from "../api/client";

const clip = (id: string, startTime: number, duration: number): Clip => ({
  id,
  trackId: "t",
  mediaId: "m",
  startTime,
  sourceOffset: 0,
  duration,
  name: id,
  gain: 1,
  fadeIn: 0,
  fadeOut: 0,
  effects: "{}",
});

describe("gridInterval", () => {
  it("shrinks as the zoom grows", () => {
    expect(gridInterval(400)).toBeLessThan(gridInterval(20));
  });
  it("always returns a positive interval", () => {
    for (const z of [20, 50, 100, 200, 400]) expect(gridInterval(z)).toBeGreaterThan(0);
  });
});

describe("snapTime", () => {
  it("snaps to a candidate inside the pixel threshold", () => {
    // 100 px/s -> the 8 px threshold is 0.08 s. 2.05 is within it.
    expect(snapTime(2.05, [2], 100, true)).toBeCloseTo(2);
  });

  it("leaves a value outside the threshold alone", () => {
    expect(snapTime(2.5, [2], 100, true)).toBeCloseTo(2.5);
  });

  it("keeps the threshold constant in pixels across zoom levels", () => {
    // 0.3 s away. At 40 px/s the threshold is 0.2 s, so it does not snap.
    expect(snapTime(2.3, [2], 40, true)).toBeCloseTo(2.3);
    // At 20 px/s the threshold is 0.4 s, so the same offset now snaps.
    expect(snapTime(2.3, [2], 20, true)).toBeCloseTo(2);
  });

  it("returns the raw time when snapping is disabled (Alt held)", () => {
    expect(snapTime(2.05, [2], 100, false)).toBeCloseTo(2.05);
  });

  it("picks the nearest candidate when several are in range", () => {
    expect(snapTime(2.04, [2, 2.05], 100, true)).toBeCloseTo(2.05);
  });

  it("never returns a negative time", () => {
    expect(snapTime(-1, [], 100, true)).toBe(0);
  });
});

describe("snapCandidates", () => {
  // Clip edges here are deliberately off-grid: gridInterval(100) is 0.5, so an
  // edge at a multiple of 0.5 would be contributed by the grid too and the
  // exclusion assertion below could not tell the two sources apart.
  it("includes the playhead, zero, and both edges of every clip", () => {
    const c = snapCandidates([clip("a", 2.13, 3.07)], 7.31, 100);
    expect(c).toContain(0);
    expect(c).toContain(7.31);
    expect(c).toContain(2.13);
    expect(c).toContain(2.13 + 3.07);
  });

  it("omits edges of excluded clips", () => {
    const c = snapCandidates([clip("a", 2.13, 3.07)], 7.31, 100, new Set(["a"]));
    expect(c).not.toContain(2.13);
    expect(c).not.toContain(2.13 + 3.07);
  });

  it("includes grid lines", () => {
    const step = gridInterval(100);
    expect(snapCandidates([], 0, 100)).toContain(step);
  });
});
