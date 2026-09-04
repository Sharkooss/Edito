import { describe, it, expect } from "vitest";
import { timeStretch, stretchWindow } from "./timeStretch";

const SR = 8000;

function sine(seconds: number, freq: number, sampleRate = SR): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

function rms(a: Float32Array, from = 0, to = a.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += a[i] * a[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

/** Zero crossings per second — a robust frequency estimate for a pure tone. */
function crossingRate(a: Float32Array, sampleRate = SR): number {
  let crossings = 0;
  // Skip the edges: overlap-add tapers there and would bias the count.
  const from = Math.floor(a.length * 0.2);
  const to = Math.floor(a.length * 0.8);
  for (let i = from + 1; i < to; i++) if (a[i - 1] < 0 !== a[i] < 0) crossings++;
  return (crossings * sampleRate) / (2 * (to - from));
}

describe("timeStretch", () => {
  it("returns a copy for a ratio of 1 without aliasing the input", () => {
    const input = sine(0.5, 440);
    const out = timeStretch(input, 1);
    expect(out).not.toBe(input);
    expect(out.length).toBe(input.length);
    expect(Array.from(out.slice(0, 50))).toEqual(Array.from(input.slice(0, 50)));
  });

  it("produces the requested length in both directions", () => {
    const input = sine(1, 440);
    expect(timeStretch(input, 2).length).toBe(input.length * 2);
    expect(timeStretch(input, 0.5).length).toBe(input.length / 2);
    // Extremes of the supported range: 2^(24/12)/0.25 = 16, and 2^(-24/12)/4 = 1/16.
    expect(timeStretch(input, 16).length).toBe(input.length * 16);
    expect(timeStretch(input, 1 / 16).length).toBe(Math.round(input.length / 16));
  });

  it("preserves pitch when stretching — the entire point", () => {
    const input = sine(1, 300);
    for (const ratio of [0.5, 2]) {
      const out = timeStretch(input, ratio);
      expect(crossingRate(out)).toBeGreaterThan(300 * 0.95);
      expect(crossingRate(out)).toBeLessThan(300 * 1.05);
    }
  });

  it("roughly preserves loudness", () => {
    const input = sine(1, 300);
    for (const ratio of [0.5, 1.5, 2]) {
      const out = timeStretch(input, ratio);
      const ref = rms(input);
      const got = rms(out, Math.floor(out.length * 0.2), Math.floor(out.length * 0.8));
      expect(got).toBeGreaterThan(ref * 0.7);
      expect(got).toBeLessThan(ref * 1.3);
    }
  });

  it("does not emit NaN or values outside the input range", () => {
    const out = timeStretch(sine(0.5, 300), 1.7);
    for (let i = 0; i < out.length; i++) {
      expect(Number.isFinite(out[i])).toBe(true);
      expect(Math.abs(out[i])).toBeLessThan(1.5);
    }
  });

  it("survives degenerate input", () => {
    expect(timeStretch(new Float32Array(0), 2).length).toBe(0);
    expect(timeStretch(sine(0.1, 300), 0).length).toBe(Math.round(0.1 * SR));
    expect(timeStretch(sine(0.1, 300), -1).length).toBe(Math.round(0.1 * SR));
    expect(timeStretch(sine(0.1, 300), NaN).length).toBe(Math.round(0.1 * SR));
    // Shorter than one analysis frame.
    expect(timeStretch(new Float32Array(64), 2).length).toBe(128);
  });
});

describe("stretchWindow", () => {
  function fakeBuffer(channels: Float32Array[], sampleRate = SR): AudioBuffer {
    return {
      numberOfChannels: channels.length,
      length: channels[0].length,
      sampleRate,
      duration: channels[0].length / sampleRate,
      getChannelData: (i: number) => channels[i],
    } as unknown as AudioBuffer;
  }
  const make = (channels: number, length: number, sampleRate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (i: number) => data[i],
    } as unknown as AudioBuffer;
  };

  it("reads only the requested window and scales its length by the ratio", () => {
    const buffer = fakeBuffer([sine(2, 300)]);
    const out = stretchWindow(buffer, 0.5, 1.5, 2, make); // 1 s window, doubled
    expect(out.duration).toBeCloseTo(2, 1);
    expect(out.sampleRate).toBe(SR);
  });

  it("keeps every channel", () => {
    const buffer = fakeBuffer([sine(1, 300), sine(1, 300)]);
    expect(stretchWindow(buffer, 0, 1, 1.5, make).numberOfChannels).toBe(2);
  });

  it("clamps a window that runs past the end of the buffer", () => {
    const buffer = fakeBuffer([sine(1, 300)]);
    const out = stretchWindow(buffer, 0.5, 99, 1, make);
    expect(out.duration).toBeCloseTo(0.5, 1);
  });
});
