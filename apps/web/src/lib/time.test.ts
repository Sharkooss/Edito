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

  it("handles edge case where centiseconds round up to 100", () => {
    expect(formatTime(59.999)).toBe("01:00.00");
    expect(formatTime(119.999)).toBe("02:00.00");
  });

  it("formats zero correctly", () => {
    expect(formatTime(0)).toBe("00:00.00");
  });
});
