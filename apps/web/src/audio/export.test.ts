import { describe, it, expect } from "vitest";
import { audioBufferToWav } from "./export";

function makeFakeBuffer(samples: number[]): AudioBuffer {
  return {
    sampleRate: 44100,
    numberOfChannels: 1,
    length: samples.length,
    getChannelData: () => Float32Array.from(samples),
  } as unknown as AudioBuffer;
}

describe("audioBufferToWav", () => {
  it("produces a Blob with a valid RIFF/WAVE header", async () => {
    const buffer = makeFakeBuffer([0, 0.5, -0.5, 1, -1]);
    const blob = audioBufferToWav(buffer);
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(riff).toBe("RIFF");
    expect(wave).toBe("WAVE");
  });
});
