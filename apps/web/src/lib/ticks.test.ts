import { describe, it, expect } from "vitest";
import { computeTicks } from "./ticks";
import { formatTime } from "./time";

describe("computeTicks", () => {
  it("covers the visible width and no more", () => {
    const ticks = computeTicks(100, 1000); // 10 s visible
    expect(ticks[0].time).toBe(0);
    expect(ticks[ticks.length - 1].time).toBeLessThanOrEqual(10.001);
  });

  it("keeps tick spacing readable at every zoom level", () => {
    for (const zoom of [20, 50, 100, 200, 400]) {
      const ticks = computeTicks(zoom, 1200);
      for (let i = 1; i < ticks.length; i++) {
        const gapPx = (ticks[i].time - ticks[i - 1].time) * zoom;
        expect(gapPx).toBeGreaterThanOrEqual(15);
      }
      expect(ticks.length).toBeLessThan(301);
    }
  });

  it("labels only major ticks", () => {
    const ticks = computeTicks(100, 1000);
    expect(ticks.some((t) => t.major && t.label !== null)).toBe(true);
    expect(ticks.every((t) => (t.label === null) === !t.major)).toBe(true);
  });

  it("returns just the origin for a zero width", () => {
    expect(computeTicks(100, 0)).toEqual([{ time: 0, label: formatTime(0), major: true }]);
  });
});
