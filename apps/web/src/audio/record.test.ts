import { describe, it, expect, vi } from "vitest";
import { MicRecorder } from "./record";

class FakeMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(["chunk"]) });
    this.onstop?.();
  }
}

describe("MicRecorder", () => {
  it("stop() resolves with a Blob containing recorded chunks", async () => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder as any);
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream;
    const recorder = new MicRecorder(fakeStream);
    await recorder.start();
    expect(recorder.isRecording()).toBe(true);
    const blob = await recorder.stop();
    expect(blob).toBeInstanceOf(Blob);
    expect(recorder.isRecording()).toBe(false);
  });
});
