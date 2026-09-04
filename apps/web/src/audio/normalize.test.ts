import { describe, it, expect } from "vitest";
import { windowPeak, normalizeGain, MAX_NORMALIZE_GAIN } from "./normalize";

function buffer(samples: Float32Array, sampleRate = 100): AudioBuffer {
  return {
    numberOfChannels: 1,
    length: samples.length,
    sampleRate,
    duration: samples.length / sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

describe("windowPeak", () => {
  it("finds the loudest absolute sample in the window", () => {
    const s = new Float32Array(100);
    s[10] = 0.4;
    s[80] = -0.9;
    expect(windowPeak(buffer(s), 0, 1)).toBeCloseTo(0.9);
  });

  it("ignores samples outside the window", () => {
    const s = new Float32Array(100);
    s[10] = 0.9; // first half only
    s[60] = 0.2;
    expect(windowPeak(buffer(s), 0.5, 1)).toBeCloseTo(0.2);
  });

  it("is zero for silence", () => {
    expect(windowPeak(buffer(new Float32Array(100)), 0, 1)).toBe(0);
  });

  it("clamps a window running past the buffer", () => {
    const s = new Float32Array(100);
    s[99] = 0.5;
    expect(windowPeak(buffer(s), 0, 99)).toBeCloseTo(0.5);
  });
});

describe("normalizeGain", () => {
  it("brings a -6 dB peak up to full scale", () => {
    expect(normalizeGain(0.5)).toBeCloseTo(2);
  });

  it("leaves an already-peaking clip alone", () => {
    expect(normalizeGain(1)).toBeCloseTo(1);
  });

  it("attenuates a clip that exceeds full scale", () => {
    expect(normalizeGain(2)).toBeCloseTo(0.5);
  });

  it("refuses to normalise silence rather than applying infinite gain", () => {
    expect(normalizeGain(0)).toBeNull();
  });

  it("caps the boost so a near-silent passage does not amplify its own hiss", () => {
    expect(normalizeGain(0.0001)).toBe(MAX_NORMALIZE_GAIN);
  });
});
