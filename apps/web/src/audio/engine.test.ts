import { describe, it, expect, beforeEach, vi } from "vitest";
import { AudioEngine } from "./engine";

class FakeGainNode { gain = { value: 1 }; connect = vi.fn(); disconnect = vi.fn(); }
class FakePannerNode { pan = { value: 0 }; connect = vi.fn(); disconnect = vi.fn(); }
class FakeAudioContext {
  destination = {};
  createGain() { return new FakeGainNode() as any; }
  createStereoPanner() { return new FakePannerNode() as any; }
}

describe("AudioEngine", () => {
  let engine: AudioEngine;
  beforeEach(() => {
    engine = new AudioEngine(new FakeAudioContext() as unknown as AudioContext);
  });

  it("ensureTrackNodes creates gain/pan nodes once per track", () => {
    const nodesA = engine.ensureTrackNodes("t1");
    const nodesB = engine.ensureTrackNodes("t1");
    expect(nodesA).toBe(nodesB);
  });

  it("setTrackVolume updates the gain value", () => {
    engine.ensureTrackNodes("t1");
    engine.setTrackVolume("t1", 0.5);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBe(0.5);
  });

  it("setTrackMuted forces gain to 0 and restores previous volume on unmute", () => {
    engine.ensureTrackNodes("t1");
    engine.setTrackVolume("t1", 0.8);
    engine.setTrackMuted("t1", true);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBe(0);
    engine.setTrackMuted("t1", false);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBe(0.8);
  });
});
