import { describe, it, expect } from "vitest";
import { laneIndexAt, dragDestination, LANE_HEIGHT } from "./useClipDrag";

describe("laneIndexAt", () => {
  it("maps a y offset to its lane", () => {
    expect(laneIndexAt(0, 100, 3)).toBe(0);
    expect(laneIndexAt(150, 100, 3)).toBe(1);
    expect(laneIndexAt(250, 100, 3)).toBe(2);
  });
  it("clamps above the first and below the last lane", () => {
    expect(laneIndexAt(-500, 100, 3)).toBe(0);
    expect(laneIndexAt(9999, 100, 3)).toBe(2);
  });
});

describe("dragDestination", () => {
  const base = {
    originX: 100,
    originY: 50,
    originStart: 2,
    originLaneIndex: 0,
    pxPerSecond: 100,
    laneHeight: LANE_HEIGHT,
    laneCount: 3,
  };

  it("converts horizontal travel into a time delta", () => {
    const d = dragDestination({ ...base, pointerX: 350, pointerY: 50 });
    expect(d.startTime).toBeCloseTo(4.5); // 2 s + 250 px / 100
    expect(d.laneIndex).toBe(0);
  });

  it("changes lane on vertical travel — the v1 blocker", () => {
    const d = dragDestination({ ...base, pointerX: 100, pointerY: 50 + LANE_HEIGHT });
    expect(d.laneIndex).toBe(1);
    expect(d.startTime).toBeCloseTo(2);
  });

  it("never yields a negative start time", () => {
    expect(dragDestination({ ...base, pointerX: -9999, pointerY: 50 }).startTime).toBe(0);
  });

  it("clamps the lane to the available tracks", () => {
    expect(
      dragDestination({ ...base, pointerX: 100, pointerY: 50 + LANE_HEIGHT * 10 }).laneIndex,
    ).toBe(2);
  });
});
