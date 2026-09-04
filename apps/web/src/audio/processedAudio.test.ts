import { describe, it, expect, vi } from "vitest";
import { ProcessedAudio } from "./processedAudio";
import type { Clip } from "../api/client";

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

function sourceBuffer(seconds: number): AudioBuffer {
  const b = makeBuffer(1, Math.round(seconds * SR), SR);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * 300 * i) / SR);
  return b;
}

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
  effects: "{}",
  ...over,
});

function harness(seconds = 10) {
  const buffer = sourceBuffer(seconds);
  const library = {
    get: (id: string) => (id === "m1" ? buffer : null),
    load: vi.fn().mockImplementation((id: string) =>
      id === "m1" ? Promise.resolve(buffer) : Promise.reject(new Error("missing")),
    ),
    has: (id: string) => id === "m1",
  };
  return { buffer, processed: new ProcessedAudio(library as never, makeBuffer) };
}

describe("ProcessedAudio without a render", () => {
  it("hands back the source buffer untouched for a neutral clip", () => {
    const { processed, buffer } = harness();
    const r = processed.get(clip({ sourceOffset: 2 }))!;
    expect(r.buffer).toBe(buffer);
    expect(r.baseOffset).toBeCloseTo(2);
    expect(r.rate).toBeCloseTo(1);
  });

  it("uses varispeed for tape mode rather than rendering", () => {
    const { processed, buffer } = harness();
    const r = processed.get(clip({ effects: JSON.stringify({ preservePitch: false, speed: 2 }) }))!;
    expect(r.buffer).toBe(buffer);
    expect(r.rate).toBeCloseTo(2);
  });

  it("is null when the media has not loaded yet", () => {
    const { processed } = harness();
    expect(processed.get(clip({ mediaId: "ghost" }))).toBeNull();
  });
});

describe("ProcessedAudio with a render", () => {
  const slow = clip({ duration: 4, effects: JSON.stringify({ preservePitch: true, speed: 0.5 }) });

  it("is null until the render completes, then returns the derived buffer", async () => {
    const { processed, buffer } = harness();
    expect(processed.get(slow)).toBeNull();
    const r = (await processed.ensure(slow))!;
    expect(r.buffer).not.toBe(buffer);
    expect(r.baseOffset).toBe(0);
    expect(r.rate).toBeCloseTo(1);
    expect(processed.get(slow)).toBe(r);
  });

  it("produces a derived buffer whose length matches the timeline duration", async () => {
    const { processed } = harness();
    // 4 s timeline at 0.5x consumes 2 s of source, stretched x2 back to 4 s.
    const r = (await processed.ensure(slow))!;
    expect(r.buffer.duration).toBeCloseTo(4, 1);
  });

  it("renders once and reuses the result", async () => {
    const { processed } = harness();
    const a = await processed.ensure(slow);
    const b = await processed.ensure(slow);
    expect(b).toBe(a);
  });

  it("re-renders when the effects change but not when unrelated fields do", async () => {
    const { processed } = harness();
    const a = await processed.ensure(slow);
    const moved = { ...slow, startTime: 99, name: "renamed" };
    expect(await processed.ensure(moved)).toBe(a);
    const faster = { ...slow, effects: JSON.stringify({ preservePitch: true, speed: 0.75 }) };
    expect(await processed.ensure(faster)).not.toBe(a);
  });

  it("reports that a render is in flight", async () => {
    const { processed } = harness();
    const pending = processed.ensure(slow);
    expect(processed.isRendering(slow)).toBe(true);
    await pending;
    expect(processed.isRendering(slow)).toBe(false);
  });

  it("notifies subscribers when a render settles", async () => {
    const { processed } = harness();
    const cb = vi.fn();
    processed.onChange(cb);
    await processed.ensure(slow);
    expect(cb).toHaveBeenCalled();
  });

  it("preload never rejects on a missing media", async () => {
    const { processed } = harness();
    await expect(processed.preload([clip({ mediaId: "ghost" })])).resolves.toBeUndefined();
  });
});
