import { describe, it, expect } from "vitest";
import {
  DEFAULT_EFFECTS,
  normalizeEffects,
  serializeEffects,
  isNeutral,
  needsOfflineRender,
  sourceWindow,
  stretchRatio,
  playbackRate,
  durationForSpeed,
  semitonesFromSpeed,
  hasEq,
  hasReverb,
} from "./effects";

const fx = (over = {}) => ({ ...DEFAULT_EFFECTS, ...over });

describe("normalizeEffects", () => {
  it("turns nothing into neutral effects", () => {
    for (const input of [undefined, null, "", "{}", {}, "not json", 42, []]) {
      expect(normalizeEffects(input)).toEqual(DEFAULT_EFFECTS);
    }
  });

  it("accepts a JSON string as well as an object", () => {
    expect(normalizeEffects('{"speed":2}').speed).toBe(2);
    expect(normalizeEffects({ speed: 2 }).speed).toBe(2);
  });

  it("fills missing fields from the defaults", () => {
    const n = normalizeEffects({ pitch: 5 });
    expect(n.pitch).toBe(5);
    expect(n.speed).toBe(1);
    expect(n.eq).toEqual({ low: 0, mid: 0, high: 0 });
    expect(n.reverb).toEqual({ mix: 0, size: 1.5 });
  });

  it("clamps out-of-range values instead of trusting them", () => {
    const n = normalizeEffects({
      speed: 99,
      pitch: -999,
      eq: { low: 500, mid: -500, high: 0 },
      reverb: { mix: 4, size: 0 },
    });
    expect(n.speed).toBe(4);
    expect(n.pitch).toBe(-24);
    expect(n.eq.low).toBe(24);
    expect(n.eq.mid).toBe(-24);
    expect(n.reverb.mix).toBe(1);
    expect(n.reverb.size).toBe(0.1);
  });

  it("rejects non-finite numbers", () => {
    const n = normalizeEffects({ speed: NaN, pitch: Infinity });
    expect(n.speed).toBe(1);
    expect(n.pitch).toBe(0);
  });

  it("round-trips through serializeEffects", () => {
    const original = fx({ speed: 0.5, pitch: -3, reverb: { mix: 0.4, size: 2 } });
    expect(normalizeEffects(serializeEffects(original))).toEqual(original);
  });
});

describe("isNeutral / hasEq / hasReverb", () => {
  it("recognises untouched effects", () => {
    expect(isNeutral(DEFAULT_EFFECTS)).toBe(true);
    expect(hasEq(DEFAULT_EFFECTS)).toBe(false);
    expect(hasReverb(DEFAULT_EFFECTS)).toBe(false);
  });

  it("recognises each individual departure from neutral", () => {
    expect(isNeutral(fx({ speed: 1.5 }))).toBe(false);
    expect(isNeutral(fx({ pitch: 1 }))).toBe(false);
    expect(isNeutral(fx({ eq: { low: 3, mid: 0, high: 0 } }))).toBe(false);
    expect(isNeutral(fx({ reverb: { mix: 0.2, size: 1.5 } }))).toBe(false);
  });

  it("ignores reverb size while the mix is zero", () => {
    expect(isNeutral(fx({ reverb: { mix: 0, size: 4 } }))).toBe(true);
    expect(hasReverb(fx({ reverb: { mix: 0, size: 4 } }))).toBe(false);
  });

  it("flags a non-flat EQ", () => {
    expect(hasEq(fx({ eq: { low: 0, mid: -2, high: 0 } }))).toBe(true);
  });
});

describe("needsOfflineRender", () => {
  it("is never needed in tape mode", () => {
    expect(needsOfflineRender(fx({ preservePitch: false, speed: 0.5 }))).toBe(false);
    expect(needsOfflineRender(fx({ preservePitch: false, speed: 3 }))).toBe(false);
  });

  it("is needed for a speed or pitch change with pitch preserved", () => {
    expect(needsOfflineRender(fx({ preservePitch: true, speed: 0.5 }))).toBe(true);
    expect(needsOfflineRender(fx({ preservePitch: true, pitch: 2 }))).toBe(true);
  });

  it("is not needed when nothing is asked of it", () => {
    expect(needsOfflineRender(fx({ preservePitch: true }))).toBe(false);
  });

  it("ignores EQ and reverb, which are realtime", () => {
    expect(
      needsOfflineRender(fx({ eq: { low: 6, mid: 0, high: 0 }, reverb: { mix: 1, size: 2 } })),
    ).toBe(false);
  });
});

describe("derived maths", () => {
  it("is the identity when nothing is set", () => {
    expect(sourceWindow(4, DEFAULT_EFFECTS)).toBeCloseTo(4);
    expect(stretchRatio(DEFAULT_EFFECTS)).toBeCloseTo(1);
    expect(playbackRate(DEFAULT_EFFECTS)).toBeCloseTo(1);
  });

  it("consumes more source when sped up, in both modes", () => {
    expect(sourceWindow(4, fx({ speed: 2 }))).toBeCloseTo(8);
    expect(sourceWindow(4, fx({ speed: 2, preservePitch: false }))).toBeCloseTo(8);
  });

  it("plays back at the speed in tape mode", () => {
    expect(playbackRate(fx({ preservePitch: false, speed: 2 }))).toBeCloseTo(2);
    expect(stretchRatio(fx({ preservePitch: false, speed: 2 }))).toBeCloseTo(1);
  });

  it("stretches instead of resampling when the pitch is preserved", () => {
    // Half speed: consume 2 s of source, stretch it x2, play at 1x -> 4 s timeline.
    const slow = fx({ preservePitch: true, speed: 0.5 });
    expect(stretchRatio(slow)).toBeCloseTo(2);
    expect(playbackRate(slow)).toBeCloseTo(1);
  });

  it("resamples by the pitch ratio and pre-stretches to cancel the duration change", () => {
    const up = fx({ preservePitch: true, pitch: 12 });
    expect(playbackRate(up)).toBeCloseTo(2);
    expect(stretchRatio(up)).toBeCloseTo(2);
  });

  it("keeps the timeline duration exact when speed and pitch combine", () => {
    // The invariant that makes the whole scheme work.
    for (const speed of [0.25, 0.5, 1, 1.7, 4]) {
      for (const pitch of [-24, -7, 0, 5, 24]) {
        const e = fx({ preservePitch: true, speed, pitch });
        const timeline = (sourceWindow(4, e) * stretchRatio(e)) / playbackRate(e);
        expect(timeline).toBeCloseTo(4, 6);
      }
    }
  });

  it("keeps the source window constant when the speed changes", () => {
    expect(durationForSpeed(4, 1, 2)).toBeCloseTo(2);
    expect(durationForSpeed(2, 2, 0.5)).toBeCloseTo(8);
    expect(durationForSpeed(4, 1, 1)).toBeCloseTo(4);
  });

  it("reports the pitch that tape mode imposes", () => {
    expect(semitonesFromSpeed(1)).toBeCloseTo(0);
    expect(semitonesFromSpeed(2)).toBeCloseTo(12);
    expect(semitonesFromSpeed(0.5)).toBeCloseTo(-12);
  });
});
