import { describe, it, expect } from "vitest";
import { computePeaks } from "./peaks";

describe("computePeaks", () => {
  it("returns one min/max pair per bin", () => {
    const ch = new Float32Array(1000);
    const p = computePeaks(ch, 1000, 0, 1, 10);
    expect(p.min.length).toBe(10);
    expect(p.max.length).toBe(10);
  });

  it("reports the extremes inside each bin", () => {
    // 100 samples at 100 Hz = 1 s. Bin 0 = samples 0-49, bin 1 = samples 50-99.
    const ch = new Float32Array(100);
    ch[10] = 0.8; // bin 0 max
    ch[20] = -0.4; // bin 0 min
    ch[60] = 0.2; // bin 1 max
    ch[70] = -0.9; // bin 1 min
    const p = computePeaks(ch, 100, 0, 1, 2);
    expect(p.max[0]).toBeCloseTo(0.8);
    expect(p.min[0]).toBeCloseTo(-0.4);
    expect(p.max[1]).toBeCloseTo(0.2);
    expect(p.min[1]).toBeCloseTo(-0.9);
  });

  it("reads only the requested window", () => {
    // The whole point: a clip trimmed to the second half must not show the first.
    const ch = new Float32Array(100);
    ch[10] = 1.0; // first half only
    const p = computePeaks(ch, 100, 0.5, 1, 1);
    expect(p.max[0]).toBe(0);
    expect(p.min[0]).toBe(0);
  });

  it("clamps a window that runs past the end of the buffer", () => {
    const ch = new Float32Array(100);
    ch[99] = 0.5;
    const p = computePeaks(ch, 100, 0.5, 99, 1);
    expect(p.max[0]).toBeCloseTo(0.5);
  });

  it("returns zeros for an empty window", () => {
    const p = computePeaks(new Float32Array(100), 100, 0.5, 0.5, 4);
    expect(Array.from(p.max)).toEqual([0, 0, 0, 0]);
    expect(Array.from(p.min)).toEqual([0, 0, 0, 0]);
  });
});
