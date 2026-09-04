import { describe, it, expect } from "vitest";
import { secondsToPixels, pixelsToSeconds, formatTime } from "./time";

describe("time helpers", () => {
  it("converts seconds to pixels and back", () => {
    expect(secondsToPixels(2, 100)).toBe(200);
    expect(pixelsToSeconds(200, 100)).toBe(2);
  });

  it("formats time as mm:ss.cc", () => {
    expect(formatTime(65.34)).toBe("01:05.34");
    expect(formatTime(3.5)).toBe("00:03.50");
  });
});
