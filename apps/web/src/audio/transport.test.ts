import { describe, it, expect, vi } from "vitest";
import { Transport } from "./transport";

function makeFakeEngine() {
  return {
    getContext: () => ({ currentTime: 0, createBufferSource: () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null }) }),
    ensureTrackNodes: () => ({ gain: {}, pan: {} }),
    loadBuffer: vi.fn().mockResolvedValue({ duration: 5 }),
  } as any;
}

describe("Transport", () => {
  it("seek updates getCurrentTime without starting playback", () => {
    const transport = new Transport(makeFakeEngine());
    transport.seek(3.5);
    expect(transport.getCurrentTime()).toBe(3.5);
    expect(transport.isPlaying()).toBe(false);
  });

  it("stop resets currentTime to 0 and isPlaying to false", async () => {
    const transport = new Transport(makeFakeEngine());
    await transport.play([], [], () => "");
    transport.stop();
    expect(transport.isPlaying()).toBe(false);
    expect(transport.getCurrentTime()).toBe(0);
  });
});
