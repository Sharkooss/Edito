import { describe, it, expect } from "vitest";
import { hasClipChanged } from "./clipEditing";

describe("hasClipChanged", () => {
  const base = { startTime: 2, sourceOffset: 1, duration: 4 };

  it("returns false when nothing changed", () => {
    expect(hasClipChanged(base, { ...base })).toBe(false);
  });

  it("returns true when startTime changed (move drag)", () => {
    expect(hasClipChanged(base, { ...base, startTime: 3 })).toBe(true);
  });

  it("returns true when sourceOffset and duration changed (left-edge trim)", () => {
    expect(hasClipChanged(base, { ...base, sourceOffset: 1.5, duration: 3.5 })).toBe(true);
  });

  it("returns true when only duration changed (right-edge trim)", () => {
    expect(hasClipChanged(base, { ...base, duration: 5 })).toBe(true);
  });

  it("returns false for a value that changed then was dragged back to the original before release", () => {
    // The guard only ever sees the final mouseup snapshot vs. the original mousedown
    // snapshot — it has no memory of intermediate positions visited mid-drag. So a
    // user who drags a clip away and back to its exact starting position before
    // releasing produces a "final === original" comparison here, which correctly
    // yields false (no history entry should be pushed for a no-op drag).
    const intermediate = { ...base, startTime: 10 }; // visited mid-drag, never reaches onUp
    void intermediate;
    const finalSnapshot = { ...base }; // back to original by the time mouseup fires
    expect(hasClipChanged(base, finalSnapshot)).toBe(false);
  });
});
