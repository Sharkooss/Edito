import { describe, it, expect, vi } from "vitest";
import { Transport } from "./transport";
import type { Clip, Track } from "../api/client";

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1",
  trackId: "t1",
  mediaId: "m1",
  startTime: 0,
  sourceOffset: 0,
  duration: 4,
  name: "c",
  gain: 1,
  fadeIn: 0,
  fadeOut: 0,
  ...over,
});
const track: Track = {
  id: "t1",
  name: "T",
  orderIndex: 0,
  color: "",
  volume: 1,
  pan: 0,
  muted: false,
  soloed: false,
};

function harness() {
  let now = 0;
  const started: Array<{ when: number; offset: number; duration: number }> = [];
  const ctx = {
    get currentTime() {
      return now;
    },
    createGain: () => ({
      gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createBufferSource: () => ({
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      start: (when: number, offset: number, duration: number) =>
        started.push({ when, offset, duration }),
      stop: vi.fn(),
      onended: null,
    }),
  };
  const engine = {
    getContext: () => ctx as unknown as AudioContext,
    unlock: vi.fn().mockResolvedValue(undefined),
    ensureTrackNodes: () => ({ gain: { connect: vi.fn() } }),
  };
  const buffer = { duration: 10, sampleRate: 44100, numberOfChannels: 1 } as AudioBuffer;
  const library = {
    preload: vi.fn().mockResolvedValue(undefined),
    get: (id: string) => (id === "m1" ? buffer : null),
    has: (id: string) => id === "m1",
  };
  return {
    started,
    advance: (dt: number) => {
      now += dt;
    },
    transport: new Transport(engine as never, library as never),
    engine,
  };
}

describe("Transport", () => {
  it("unlocks the context before playing — the v1 silence bug", async () => {
    const { transport, engine } = harness();
    transport.setProject([clip()], [track]);
    await transport.play();
    expect(engine.unlock).toHaveBeenCalled();
    transport.stop();
  });

  it("schedules each clip once with the right window", async () => {
    const { transport, started } = harness();
    transport.setProject([clip({ startTime: 2, sourceOffset: 1, duration: 3 })], [track]);
    await transport.play();
    expect(started).toHaveLength(1);
    expect(started[0].offset).toBeCloseTo(1);
    expect(started[0].duration).toBeCloseTo(3);
    transport.stop();
  });

  it("tracks time from the audio clock, not a frame counter", async () => {
    const { transport, advance } = harness();
    transport.setProject([clip({ duration: 10 })], [track]);
    await transport.play();
    advance(2.5);
    expect(transport.getCurrentTime()).toBeCloseTo(2.5);
    transport.stop();
  });

  it("pause freezes the clock and resume continues from there", async () => {
    const { transport, advance } = harness();
    transport.setProject([clip({ duration: 10 })], [track]);
    await transport.play();
    advance(3);
    transport.pause();
    expect(transport.isPlaying()).toBe(false);
    advance(5); // wall clock moves while paused
    expect(transport.getCurrentTime()).toBeCloseTo(3);
    await transport.play();
    advance(1);
    expect(transport.getCurrentTime()).toBeCloseTo(4);
    transport.stop();
  });

  it("stop rewinds to zero", async () => {
    const { transport, advance } = harness();
    transport.setProject([clip({ duration: 10 })], [track]);
    await transport.play();
    advance(3);
    transport.stop();
    expect(transport.getCurrentTime()).toBe(0);
    expect(transport.isPlaying()).toBe(false);
  });

  it("seek while playing reschedules without leaving stale sources", async () => {
    const { transport, started } = harness();
    transport.setProject([clip({ duration: 10 })], [track]);
    await transport.play();
    started.length = 0;
    transport.seek(5);
    expect(transport.getCurrentTime()).toBeCloseTo(5);
    expect(started).toHaveLength(1);
    expect(started[0].offset).toBeCloseTo(5);
    transport.stop();
  });

  it("seek while paused moves the playhead without scheduling", () => {
    const { transport, started } = harness();
    transport.setProject([clip()], [track]);
    transport.seek(2);
    expect(transport.getCurrentTime()).toBeCloseTo(2);
    expect(started).toHaveLength(0);
  });

  it("clamps a negative seek to zero", () => {
    const { transport } = harness();
    transport.setProject([clip()], [track]);
    transport.seek(-5);
    expect(transport.getCurrentTime()).toBe(0);
  });

  it("stops itself and fires onEnded past the last clip", async () => {
    const { transport, advance } = harness();
    const ended = vi.fn();
    transport.onEnded(ended);
    transport.setProject([clip({ startTime: 0, duration: 2 })], [track]);
    await transport.play();
    advance(2.2);
    await new Promise((r) => setTimeout(r, 80)); // let the clock tick
    expect(ended).toHaveBeenCalled();
    expect(transport.isPlaying()).toBe(false);
  });

  it("does not rewind when playback starts past the end of the last clip", async () => {
    // Parking the playhead beyond the material — to record a take after it, say
    // — used to trip the end-of-project stop instantly and jump back to zero.
    const { transport, advance } = harness();
    const ended = vi.fn();
    transport.onEnded(ended);
    transport.setProject([clip({ startTime: 0, duration: 2 })], [track]);
    transport.seek(5);
    await transport.play();
    advance(1);
    await new Promise((r) => setTimeout(r, 80));
    expect(ended).not.toHaveBeenCalled();
    expect(transport.getCurrentTime()).toBeCloseTo(6);
    transport.stop();
  });

  it("keeps rolling past the project end while auto-stop is disabled", async () => {
    const { transport, advance } = harness();
    const ended = vi.fn();
    transport.onEnded(ended);
    transport.setProject([clip({ startTime: 0, duration: 2 })], [track]);
    transport.setAutoStopAllowed(false);
    await transport.play();
    advance(3);
    await new Promise((r) => setTimeout(r, 80));
    expect(ended).not.toHaveBeenCalled();
    expect(transport.getCurrentTime()).toBeCloseTo(3);
    transport.setAutoStopAllowed(true);
    transport.stop();
  });

  it("does not schedule clips on inaudible tracks", async () => {
    const { transport, started } = harness();
    transport.setProject([clip()], [{ ...track, muted: true }]);
    await transport.play();
    expect(started).toHaveLength(0);
    transport.stop();
  });
});
