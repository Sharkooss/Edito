import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "./projectStore";

describe("projectStore", () => {
  beforeEach(() => {
    useProjectStore.setState({
      tracks: [],
      clips: [],
      media: [],
      selectedClipIds: [],
      tool: "select",
      hydrated: false,
    });
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

  it("reorderTrack swaps orderIndex with the adjacent track", () => {
    useProjectStore.setState({
      tracks: [
        { id: "t1", orderIndex: 0, name: "A", color: "", volume: 1, pan: 0, muted: false, soloed: false },
        { id: "t2", orderIndex: 1, name: "B", color: "", volume: 1, pan: 0, muted: false, soloed: false },
      ],
    } as any);
    useProjectStore.getState().reorderTrack("t1", "down");
    const [a, b] = useProjectStore.getState().tracks.sort((x, y) => x.orderIndex - y.orderIndex);
    expect(a.id).toBe("t2");
    expect(b.id).toBe("t1");
  });

  it("updateTrack patches only the matching track", () => {
    useProjectStore.setState({
      tracks: [{ id: "t1", orderIndex: 0, name: "T", color: "", volume: 1, pan: 0, muted: false, soloed: false }],
    } as any);
    useProjectStore.getState().updateTrack("t1", { volume: 0.3 });
    expect(useProjectStore.getState().tracks[0].volume).toBe(0.3);
  });

  it("loadState sets hydrated to true", () => {
    expect(useProjectStore.getState().hydrated).toBe(false);
    useProjectStore.getState().loadState({ tracks: [], clips: [], media: [] });
    expect(useProjectStore.getState().hydrated).toBe(true);
  });

  const TRACK = {
    id: "t1",
    orderIndex: 0,
    name: "Piste 1",
    color: "",
    volume: 1,
    pan: 0,
    muted: false,
    soloed: false,
  };
  const CLIP = {
    id: "c1",
    trackId: "t1",
    mediaId: "m",
    startTime: 0,
    sourceOffset: 0,
    duration: 1,
    name: "c",
    gain: 1,
    fadeIn: 0,
    fadeOut: 0,
    effects: "{}",
  };

  it("replaces the selection with selectClips", () => {
    useProjectStore.getState().selectClips(["a", "b"]);
    expect(useProjectStore.getState().selectedClipIds).toEqual(["a", "b"]);
  });

  it("toggles a clip in and out of the selection", () => {
    useProjectStore.getState().selectClips(["a"]);
    useProjectStore.getState().toggleClipSelection("b");
    expect(useProjectStore.getState().selectedClipIds).toEqual(["a", "b"]);
    useProjectStore.getState().toggleClipSelection("a");
    expect(useProjectStore.getState().selectedClipIds).toEqual(["b"]);
  });

  it("drops deleted clips from the selection when a track is removed", () => {
    useProjectStore.setState({ tracks: [TRACK], clips: [CLIP], selectedClipIds: ["c1"] });
    useProjectStore.getState().removeTrack("t1");
    expect(useProjectStore.getState().selectedClipIds).toEqual([]);
  });

  it("ensureTrackForImport reuses an empty track before creating one", () => {
    useProjectStore.setState({ tracks: [TRACK], clips: [], selectedClipIds: [] });
    expect(useProjectStore.getState().ensureTrackForImport().id).toBe("t1");
    expect(useProjectStore.getState().tracks).toHaveLength(1);
  });

  it("ensureTrackForImport creates a new track when every track is occupied", () => {
    useProjectStore.setState({ tracks: [TRACK], clips: [CLIP], selectedClipIds: [] });
    const track = useProjectStore.getState().ensureTrackForImport();
    expect(track.id).not.toBe("t1");
    expect(useProjectStore.getState().tracks).toHaveLength(2);
  });

  it("defaults the tool to select and switches to blade", () => {
    expect(useProjectStore.getState().tool).toBe("select");
    useProjectStore.getState().setTool("blade");
    expect(useProjectStore.getState().tool).toBe("blade");
  });
});
