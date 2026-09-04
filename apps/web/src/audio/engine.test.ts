import { describe, it, expect, vi } from "vitest";
import { AudioEngine } from "./engine";

function mockCtx(state: AudioContextState = "suspended") {
  const analyser = () => ({
    fftSize: 2048,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: (a: Float32Array) => a.fill(0.5),
  });
  const ctx = {
    state,
    resume: vi.fn().mockImplementation(async () => {
      ctx.state = "running";
    }),
    destination: { name: "dest" },
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
    createStereoPanner: () => ({ pan: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }),
    createAnalyser: analyser,
  };
  return ctx as unknown as AudioContext & { resume: ReturnType<typeof vi.fn> };
}

describe("AudioEngine.unlock", () => {
  it("resumes a suspended context", async () => {
    const ctx = mockCtx("suspended");
    const engine = new AudioEngine(ctx);
    expect(engine.isUnlocked()).toBe(false);
    await engine.unlock();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(engine.isUnlocked()).toBe(true);
  });

  it("only resumes once across repeated calls", async () => {
    const ctx = mockCtx("suspended");
    const engine = new AudioEngine(ctx);
    await Promise.all([engine.unlock(), engine.unlock(), engine.unlock()]);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it("does not call resume on an already-running context", async () => {
    const ctx = mockCtx("running");
    await new AudioEngine(ctx).unlock();
    expect(ctx.resume).not.toHaveBeenCalled();
  });
});

describe("AudioEngine track nodes", () => {
  it("reuses the same nodes for a track", () => {
    const engine = new AudioEngine(mockCtx());
    expect(engine.ensureTrackNodes("t1")).toBe(engine.ensureTrackNodes("t1"));
  });

  it("applies volume and pan", () => {
    const engine = new AudioEngine(mockCtx());
    engine.setTrackVolume("t1", 0.3);
    engine.setTrackPan("t1", -0.5);
    const n = engine.ensureTrackNodes("t1");
    expect(n.gain.gain.value).toBeCloseTo(0.3);
    expect(n.pan.pan.value).toBeCloseTo(-0.5);
  });

  it("restores the pre-mute volume on unmute", () => {
    const engine = new AudioEngine(mockCtx());
    engine.setTrackVolume("t1", 0.7);
    engine.setTrackMuted("t1", true);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBe(0);
    engine.setTrackMuted("t1", false);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBeCloseTo(0.7);
  });

  it("keeps a volume change made while muted", () => {
    const engine = new AudioEngine(mockCtx());
    engine.setTrackMuted("t1", true);
    engine.setTrackVolume("t1", 0.4);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBe(0);
    engine.setTrackMuted("t1", false);
    expect(engine.ensureTrackNodes("t1").gain.gain.value).toBeCloseTo(0.4);
  });

  it("reports an RMS level for a known track and 0 for an unknown one", () => {
    const engine = new AudioEngine(mockCtx());
    engine.ensureTrackNodes("t1");
    expect(engine.trackLevel("t1")).toBeCloseTo(0.5, 1);
    expect(engine.trackLevel("ghost")).toBe(0);
  });
});
