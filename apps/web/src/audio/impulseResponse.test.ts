import { describe, it, expect } from "vitest";
import { generateImpulseResponse, ImpulseCache } from "./impulseResponse";

const SR = 8000;

function makeBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (i: number) => data[i],
  } as unknown as AudioBuffer;
}

describe("generateImpulseResponse", () => {
  it("is stereo and as long as requested", () => {
    const ir = generateImpulseResponse(2, SR, makeBuffer);
    expect(ir.numberOfChannels).toBe(2);
    expect(ir.duration).toBeCloseTo(2, 5);
  });

  it("decays — the tail is far quieter than the head", () => {
    const ir = generateImpulseResponse(1, SR, makeBuffer);
    const ch = ir.getChannelData(0);
    const head = ch.slice(0, 200).reduce((s, v) => s + Math.abs(v), 0) / 200;
    const tail = ch.slice(-200).reduce((s, v) => s + Math.abs(v), 0) / 200;
    expect(head).toBeGreaterThan(tail * 10);
  });

  it("keeps every sample finite and in range", () => {
    const ch = generateImpulseResponse(1, SR, makeBuffer).getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      expect(Number.isFinite(ch[i])).toBe(true);
      expect(Math.abs(ch[i])).toBeLessThanOrEqual(1);
    }
  });

  it("decorrelates the two channels so the reverb reads as stereo", () => {
    const ir = generateImpulseResponse(1, SR, makeBuffer);
    const [l, r] = [ir.getChannelData(0), ir.getChannelData(1)];
    let identical = true;
    for (let i = 0; i < 500; i++) {
      if (l[i] !== r[i]) {
        identical = false;
        break;
      }
    }
    expect(identical).toBe(false);
  });

  it("never produces an empty buffer", () => {
    expect(generateImpulseResponse(0, SR, makeBuffer).length).toBeGreaterThan(0);
  });
});

describe("ImpulseCache", () => {
  it("generates once per size and reuses afterwards", () => {
    const cache = new ImpulseCache(makeBuffer, SR);
    const a = cache.get(1.5);
    const b = cache.get(1.5);
    expect(b).toBe(a);
    expect(cache.generatedCount()).toBe(1);
  });

  it("buckets nearby sizes together — convolvers are expensive to build", () => {
    const cache = new ImpulseCache(makeBuffer, SR);
    cache.get(1.51);
    cache.get(1.54);
    expect(cache.generatedCount()).toBe(1);
  });

  it("generates separately for genuinely different sizes", () => {
    const cache = new ImpulseCache(makeBuffer, SR);
    cache.get(0.5);
    cache.get(3);
    expect(cache.generatedCount()).toBe(2);
  });
});
