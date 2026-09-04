import { describe, it, expect } from "vitest";
import { overlaps, resolvePlacement, firstFreeSlot } from "./overlap";
import type { Clip } from "../api/client";

const clip = (id: string, startTime: number, duration: number, trackId = "t"): Clip => ({
  id,
  trackId,
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

describe("overlaps", () => {
  it("is false for clips that merely touch", () => {
    expect(overlaps(0, 2, 2, 2)).toBe(false);
  });
  it("is true for a genuine intersection", () => {
    expect(overlaps(0, 2, 1, 2)).toBe(true);
  });
  it("is true when one contains the other", () => {
    expect(overlaps(0, 10, 2, 1)).toBe(true);
  });
});

describe("resolvePlacement", () => {
  const existing = [clip("a", 0, 4), clip("b", 10, 4)];

  it("keeps a requested position that is already free", () => {
    expect(resolvePlacement(existing, "t", 5, 2)).toBeCloseTo(5);
  });

  it("pushes a colliding placement to the nearest free edge", () => {
    // Requested 3..5 collides with a (0..4). Nearest legal edge is 4.
    expect(resolvePlacement(existing, "t", 3, 2)).toBeCloseTo(4);
  });

  it("prefers the left edge when it is closer", () => {
    // Requested 9.5..13.5 collides with b (10..14). Left edge puts it at 6.
    expect(resolvePlacement(existing, "t", 9.5, 4)).toBeCloseTo(6);
  });

  it("ignores clips being moved", () => {
    expect(resolvePlacement(existing, "t", 0, 4, new Set(["a"]))).toBeCloseTo(0);
  });

  it("never returns a negative start", () => {
    expect(resolvePlacement([clip("a", 0, 4)], "t", 0.5, 2)).toBeGreaterThanOrEqual(0);
  });

  it("only considers clips on the target track", () => {
    expect(resolvePlacement([clip("x", 0, 100, "other")], "t", 5, 2)).toBeCloseTo(5);
  });

  it("produces a placement that is genuinely free", () => {
    const dense = [clip("a", 0, 3), clip("b", 3, 3), clip("c", 6, 3)];
    const at = resolvePlacement(dense, "t", 4, 2);
    expect(dense.some((c) => overlaps(at, 2, c.startTime, c.duration))).toBe(false);
  });
});

describe("firstFreeSlot", () => {
  it("is 0 on an empty track", () => {
    expect(firstFreeSlot([], "t", 5)).toBe(0);
  });
  it("is the end of the last clip when the track is packed", () => {
    expect(firstFreeSlot([clip("a", 0, 4)], "t", 5)).toBeCloseTo(4);
  });
  it("uses an interior gap that is big enough", () => {
    expect(firstFreeSlot([clip("a", 0, 2), clip("b", 8, 2)], "t", 3)).toBeCloseTo(2);
  });
});
