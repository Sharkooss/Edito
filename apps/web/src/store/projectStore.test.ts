import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "./projectStore";

describe("projectStore", () => {
  beforeEach(() => {
    useProjectStore.setState({ tracks: [], clips: [], media: [], selectedClipId: null });
  });

  it("addTrack appends a track", () => {
    useProjectStore.getState().addTrack({ id: "t1", orderIndex: 0, name: "T1", color: "#f97316", volume: 1, pan: 0, muted: false, soloed: false });
    expect(useProjectStore.getState().tracks).toHaveLength(1);
  });

  it("updateClip patches only the matching clip", () => {
    useProjectStore.setState({
      clips: [{ id: "c1", trackId: "t1", mediaId: "m1", startTime: 0, sourceOffset: 0, duration: 2, name: "c" }],
    } as any);
    useProjectStore.getState().updateClip("c1", { startTime: 5 });
    expect(useProjectStore.getState().clips[0].startTime).toBe(5);
  });
});
