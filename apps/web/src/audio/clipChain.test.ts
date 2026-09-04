import { describe, it, expect, vi } from "vitest";
import { buildClipChain } from "./clipChain";
import { DEFAULT_EFFECTS } from "./effects";
import { ImpulseCache } from "./impulseResponse";
import type { ScheduleEntry } from "./scheduling";

function harness() {
  const created = { gain: 0, filter: 0, convolver: 0 };
  const started: Array<{ when: number; offset: number; duration: number }> = [];
  const param = () => ({ value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => {
      created.gain++;
      return { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
    },
    createBiquadFilter: () => {
      created.filter++;
      return {
        type: "",
        frequency: param(),
        gain: param(),
        Q: param(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    },
    createConvolver: () => {
      created.convolver++;
      return { buffer: null, connect: vi.fn(), disconnect: vi.fn() };
    },
    createBufferSource: () => ({
      buffer: null,
      playbackRate: param(),
      connect: vi.fn(),
      stop: vi.fn(),
      onended: null,
      start: (when: number, offset: number, duration: number) =>
        started.push({ when, offset, duration }),
    }),
  } as unknown as BaseAudioContext;
  const makeBuffer = (channels: number, length: number, sampleRate: number) =>
    ({
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    }) as unknown as AudioBuffer;
  return {
    created,
    started,
    chain: { ctx, impulses: new ImpulseCache(makeBuffer, 44100) },
    destination: { name: "dest" } as unknown as AudioNode,
  };
}

const entry = (over: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  clipId: "c1",
  trackId: "t1",
  mediaId: "m1",
  when: 0,
  elapsed: 0,
  duration: 4,
  gain: 1,
  fadeIn: 0,
  fadeOut: 0,
  effects: DEFAULT_EFFECTS,
  ...over,
});

const audio = (over = {}) => ({
  buffer: { duration: 10 } as AudioBuffer,
  baseOffset: 0,
  rate: 1,
  ...over,
});

describe("buildClipChain source window", () => {
  it("plays from the base offset for the whole duration", () => {
    const h = harness();
    buildClipChain(h.chain, entry(), audio(), h.destination, 0);
    expect(h.started).toEqual([{ when: 0, offset: 0, duration: 4 }]);
  });

  it("advances into the source by elapsed x rate", () => {
    const h = harness();
    buildClipChain(
      h.chain,
      entry({ elapsed: 1, duration: 3 }),
      audio({ baseOffset: 2, rate: 2 }),
      h.destination,
      0,
    );
    // baseOffset 2 + 1 s elapsed x 2 = 4, reading 3 s of timeline x 2 = 6 s of source.
    expect(h.started).toEqual([{ when: 0, offset: 4, duration: 6 }]);
  });
});

describe("buildClipChain node economy", () => {
  it("creates no filters and no convolver for a neutral clip", () => {
    const h = harness();
    buildClipChain(h.chain, entry(), audio(), h.destination, 0);
    expect(h.created.filter).toBe(0);
    expect(h.created.convolver).toBe(0);
    expect(h.created.gain).toBe(1); // the envelope gain only
  });

  it("creates three filters when the EQ is not flat", () => {
    const h = harness();
    const fx = { ...DEFAULT_EFFECTS, eq: { low: 3, mid: 0, high: 0 } };
    buildClipChain(h.chain, entry({ effects: fx }), audio(), h.destination, 0);
    expect(h.created.filter).toBe(3);
  });

  it("creates no convolver while the reverb mix is closed", () => {
    const h = harness();
    const fx = { ...DEFAULT_EFFECTS, reverb: { mix: 0, size: 3 } };
    buildClipChain(h.chain, entry({ effects: fx }), audio(), h.destination, 0);
    expect(h.created.convolver).toBe(0);
  });

  it("creates a convolver and dry/wet gains when the reverb is open", () => {
    const h = harness();
    const fx = { ...DEFAULT_EFFECTS, reverb: { mix: 0.5, size: 2 } };
    buildClipChain(h.chain, entry({ effects: fx }), audio(), h.destination, 0);
    expect(h.created.convolver).toBe(1);
    expect(h.created.gain).toBe(3); // envelope + dry + wet
  });
});

describe("buildClipChain playback rate", () => {
  it("applies the resolved rate to the source", () => {
    const h = harness();
    const source = buildClipChain(h.chain, entry(), audio({ rate: 1.5 }), h.destination, 0);
    expect(source.playbackRate.value).toBeCloseTo(1.5);
  });
});
