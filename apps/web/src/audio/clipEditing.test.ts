import { describe, it, expect } from "vitest";
import { splitClip } from "./clipEditing";
import type { Clip } from "../store/projectStore";

describe("splitClip", () => {
  it("splits a clip into two contiguous clips at the given time", () => {
    const clip: Clip = { id: "c1", trackId: "t1", mediaId: "m1", startTime: 2, sourceOffset: 0, duration: 6, name: "x" };
    const [left, right] = splitClip(clip, 5);
    expect(left.startTime).toBe(2);
    expect(left.duration).toBe(3);
    expect(right.startTime).toBe(5);
    expect(right.sourceOffset).toBe(3);
    expect(right.duration).toBe(3);
    expect(left.id).not.toBe(right.id);
  });
});
