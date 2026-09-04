import { describe, it, expect } from "vitest";
import { paintWaveform, fadePolygon } from "./waveformPainter";

function fakeCanvas(width: number, height: number) {
  const calls: string[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, prop) => {
      if (prop === "canvas") return canvas;
      return (...args: unknown[]) => {
        calls.push(`${String(prop)}(${args.join(",")})`);
      };
    },
    set: () => true,
  });
  const canvas = { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

describe("paintWaveform", () => {
  it("does nothing when peaks are not loaded yet", () => {
    const { canvas, calls } = fakeCanvas(100, 50);
    paintWaveform(canvas, null, { width: 100, height: 50, color: "#fff", dpr: 1 });
    expect(calls.some((c) => c.startsWith("fillRect"))).toBe(false);
  });

  it("sizes the backing store for the device pixel ratio", () => {
    const { canvas } = fakeCanvas(0, 0);
    const peaks = { min: new Float32Array([-1]), max: new Float32Array([1]) };
    paintWaveform(canvas, peaks, { width: 100, height: 50, color: "#fff", dpr: 2 });
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
  });

  it("draws one column per peak bin", () => {
    const { canvas, calls } = fakeCanvas(0, 0);
    const peaks = { min: new Float32Array([-1, -0.5, 0]), max: new Float32Array([1, 0.5, 0]) };
    paintWaveform(canvas, peaks, { width: 3, height: 50, color: "#fff", dpr: 1 });
    expect(calls.filter((c) => c.startsWith("fillRect"))).toHaveLength(3);
  });
});

describe("fadePolygon", () => {
  it("is empty when there are no fades", () => {
    expect(fadePolygon(100, 50, 0, 0)).toEqual([]);
  });

  it("starts at the bottom-left and rises to the top when there is a fade-in", () => {
    const poly = fadePolygon(100, 50, 20, 0);
    expect(poly[0]).toEqual([0, 50]);
    expect(poly).toContainEqual([20, 0]);
  });

  it("clamps overlapping fades to the clip width", () => {
    const poly = fadePolygon(100, 50, 80, 80);
    for (const [x] of poly) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
    }
  });
});
