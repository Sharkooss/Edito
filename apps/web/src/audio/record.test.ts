import { describe, it, expect, vi, afterEach } from "vitest";
import { pickMimeType } from "./record";

afterEach(() => vi.unstubAllGlobals());

describe("pickMimeType", () => {
  it("prefers opus when supported", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (t: string) => t === "audio/webm;codecs=opus",
    });
    expect(pickMimeType()).toBe("audio/webm;codecs=opus");
  });

  it("falls back to plain webm", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: (t: string) => t === "audio/webm" });
    expect(pickMimeType()).toBe("audio/webm");
  });

  it("returns an empty string when nothing is supported, letting the browser choose", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
    expect(pickMimeType()).toBe("");
  });

  it("returns an empty string when MediaRecorder is absent entirely", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(pickMimeType()).toBe("");
  });
});
