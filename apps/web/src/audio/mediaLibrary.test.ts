import { describe, it, expect, vi } from "vitest";
import { MediaLibrary } from "./mediaLibrary";

function fakeBuffer(samples: Float32Array, sampleRate = 100): AudioBuffer {
  return {
    duration: samples.length / sampleRate,
    sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function harness(samples = new Float32Array(100)) {
  const buffer = fakeBuffer(samples);
  const decode = vi.fn().mockResolvedValue(buffer);
  const ctx = { decodeAudioData: decode } as unknown as BaseAudioContext;
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  vi.stubGlobal("fetch", fetchMock);
  return { lib: new MediaLibrary(ctx, (id) => `/api/media/${id}`), decode, fetchMock, buffer };
}

describe("MediaLibrary", () => {
  it("fetches and decodes a media once even for concurrent callers", async () => {
    const { lib, decode, fetchMock } = harness();
    await Promise.all([lib.load("m1"), lib.load("m1"), lib.load("m1")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("exposes the buffer synchronously once loaded", async () => {
    const { lib, buffer } = harness();
    expect(lib.get("m1")).toBeNull();
    await lib.load("m1");
    expect(lib.get("m1")).toBe(buffer);
    expect(lib.has("m1")).toBe(true);
  });

  it("marks a media as failed instead of throwing from preload", async () => {
    const { lib } = harness();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(lib.preload(["missing"])).resolves.toBeUndefined();
    expect(lib.failed("missing")).toBe(true);
    expect(lib.get("missing")).toBeNull();
  });

  it("returns null peaks before load and windowed peaks after", async () => {
    const samples = new Float32Array(100);
    samples[75] = 0.6;
    const { lib } = harness(samples);
    expect(lib.getPeaks("m1", 0, 1, 4)).toBeNull();
    await lib.load("m1");
    const peaks = lib.getPeaks("m1", 0.5, 1, 1)!;
    expect(peaks.max[0]).toBeCloseTo(0.6);
    // Same window again must hit the memo, not recompute.
    expect(lib.getPeaks("m1", 0.5, 1, 1)).toBe(peaks);
  });

  it("notifies subscribers when a load settles", async () => {
    const { lib } = harness();
    const cb = vi.fn();
    lib.onChange(cb);
    await lib.load("m1");
    expect(cb).toHaveBeenCalled();
  });
});
