import { describe, it, expect, beforeEach } from "vitest";
import {
  splitClip,
  splitClipsAt,
  deleteClips,
  duplicateClips,
  moveClips,
  trimClip,
  setClipFade,
  setClipEffects,
  setClipSpeed,
  resetClipEffects,
  normalizeClips,
} from "./clipEditing";
import { normalizeEffects } from "./effects";
import { useProjectStore } from "../store/projectStore";
import { useHistoryStore } from "../store/historyStore";
import type { Clip } from "../api/client";

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1",
  trackId: "t1",
  mediaId: "m1",
  startTime: 0,
  sourceOffset: 0,
  duration: 10,
  name: "c",
  gain: 1,
  fadeIn: 0,
  fadeOut: 0,
  effects: "{}",
  ...over,
});

const track = (id: string, orderIndex: number) => ({
  id,
  name: id,
  orderIndex,
  color: "",
  volume: 1,
  pan: 0,
  muted: false,
  soloed: false,
});

beforeEach(() => {
  useProjectStore.setState({
    tracks: [track("t1", 0), track("t2", 1)],
    clips: [],
    media: [{ id: "m1", originalFilename: "a.wav", duration: 60, sampleRate: 44100 }],
    selectedClipIds: [],
    tool: "select",
    hydrated: true,
  });
  useHistoryStore.setState({ undoStack: [], redoStack: [], canUndo: false, canRedo: false });
});

describe("splitClip", () => {
  it("produces halves that exactly tile the original", () => {
    const [left, right] = splitClip(clip({ startTime: 5, sourceOffset: 2, duration: 10 }), 8)!;
    expect(left.startTime).toBeCloseTo(5);
    expect(left.duration).toBeCloseTo(3);
    expect(left.sourceOffset).toBeCloseTo(2);
    expect(right.startTime).toBeCloseTo(8);
    expect(right.duration).toBeCloseTo(7);
    expect(right.sourceOffset).toBeCloseTo(5); // 2 + 3 — the seam does not drift
    expect(left.duration + right.duration).toBeCloseTo(10);
    expect(right.id).not.toBe(left.id);
  });

  it("moves a fade-out onto the right half and a fade-in onto the left", () => {
    const [left, right] = splitClip(clip({ duration: 10, fadeIn: 1, fadeOut: 2 }), 5)!;
    expect(left.fadeIn).toBeCloseTo(1);
    expect(left.fadeOut).toBe(0);
    expect(right.fadeIn).toBe(0);
    expect(right.fadeOut).toBeCloseTo(2);
  });

  it("refuses a cut outside the clip or too close to an edge", () => {
    expect(splitClip(clip({ startTime: 0, duration: 10 }), 0)).toBeNull();
    expect(splitClip(clip({ startTime: 0, duration: 10 }), 10)).toBeNull();
    expect(splitClip(clip({ startTime: 0, duration: 10 }), 15)).toBeNull();
    expect(splitClip(clip({ startTime: 0, duration: 10 }), 0.001)).toBeNull();
  });
});

describe("splitClipsAt", () => {
  it("replaces one clip with two in the store", () => {
    useProjectStore.setState({ clips: [clip()] });
    splitClipsAt(["c1"], 4);
    const clips = useProjectStore.getState().clips;
    expect(clips).toHaveLength(2);
    expect(clips.map((c) => c.duration).sort((a, b) => a - b)).toEqual([4, 6]);
  });

  it("is undone in a single step", () => {
    useProjectStore.setState({ clips: [clip()] });
    splitClipsAt(["c1"], 4);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().clips).toHaveLength(1);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(10);
  });

  it("cuts several selected clips at once", () => {
    useProjectStore.setState({ clips: [clip({ id: "a" }), clip({ id: "b", trackId: "t2" })] });
    splitClipsAt(["a", "b"], 4);
    expect(useProjectStore.getState().clips).toHaveLength(4);
  });

  it("leaves clips that do not span the cut point untouched", () => {
    useProjectStore.setState({ clips: [clip({ id: "a", startTime: 0, duration: 2 })] });
    splitClipsAt(["a"], 5);
    expect(useProjectStore.getState().clips).toHaveLength(1);
  });
});

describe("deleteClips", () => {
  it("removes every listed clip and restores them all on undo", () => {
    useProjectStore.setState({ clips: [clip({ id: "a" }), clip({ id: "b", startTime: 20 })] });
    deleteClips(["a", "b"]);
    expect(useProjectStore.getState().clips).toHaveLength(0);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().clips).toHaveLength(2);
  });
});

describe("duplicateClips", () => {
  it("places the copy after the original without overlapping it", () => {
    useProjectStore.setState({ clips: [clip({ id: "a", startTime: 0, duration: 4 })] });
    duplicateClips(["a"]);
    const clips = useProjectStore.getState().clips;
    expect(clips).toHaveLength(2);
    const copy = clips.find((c) => c.id !== "a")!;
    expect(copy.startTime).toBeGreaterThanOrEqual(4);
  });
});

describe("moveClips", () => {
  it("moves a clip to another track", () => {
    useProjectStore.setState({ clips: [clip({ id: "a" })] });
    moveClips([{ id: "a", trackId: "t2", startTime: 3 }]);
    const moved = useProjectStore.getState().clips[0];
    expect(moved.trackId).toBe("t2");
    expect(moved.startTime).toBeCloseTo(3);
  });

  it("refuses to create an overlap, nudging to a free slot instead", () => {
    useProjectStore.setState({
      clips: [
        clip({ id: "a", startTime: 0, duration: 4 }),
        clip({ id: "b", startTime: 20, duration: 4 }),
      ],
    });
    moveClips([{ id: "b", trackId: "t1", startTime: 2 }]);
    const b = useProjectStore.getState().clips.find((c) => c.id === "b")!;
    expect(b.startTime).toBeGreaterThanOrEqual(4);
  });

  it("restores both track and position on undo", () => {
    useProjectStore.setState({ clips: [clip({ id: "a", startTime: 1 })] });
    moveClips([{ id: "a", trackId: "t2", startTime: 7 }]);
    useHistoryStore.getState().undo();
    const a = useProjectStore.getState().clips[0];
    expect(a.trackId).toBe("t1");
    expect(a.startTime).toBeCloseTo(1);
  });
});

describe("trimClip", () => {
  it("trimming the left edge advances sourceOffset by the same amount", () => {
    useProjectStore.setState({ clips: [clip({ startTime: 0, sourceOffset: 1, duration: 10 })] });
    trimClip("c1", "left", 3);
    const c = useProjectStore.getState().clips[0];
    expect(c.startTime).toBeCloseTo(3);
    expect(c.sourceOffset).toBeCloseTo(4);
    expect(c.duration).toBeCloseTo(7);
  });

  it("trimming the right edge only shortens the duration", () => {
    useProjectStore.setState({ clips: [clip({ startTime: 0, sourceOffset: 1, duration: 10 })] });
    trimClip("c1", "right", 6);
    const c = useProjectStore.getState().clips[0];
    expect(c.sourceOffset).toBeCloseTo(1);
    expect(c.duration).toBeCloseTo(6);
  });

  it("never trims below the minimum duration", () => {
    useProjectStore.setState({ clips: [clip({ startTime: 0, duration: 10 })] });
    trimClip("c1", "right", 0);
    expect(useProjectStore.getState().clips[0].duration).toBeGreaterThan(0);
  });

  it("never pulls sourceOffset below zero", () => {
    useProjectStore.setState({ clips: [clip({ startTime: 5, sourceOffset: 0, duration: 5 })] });
    trimClip("c1", "left", 0);
    expect(useProjectStore.getState().clips[0].sourceOffset).toBeGreaterThanOrEqual(0);
  });

  it("does not let the right edge run past the end of the source", () => {
    // Source is 60 s and the clip starts 55 s in, so at most 5 s is available.
    useProjectStore.setState({ clips: [clip({ startTime: 0, sourceOffset: 55, duration: 5 })] });
    trimClip("c1", "right", 999);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(5);
  });
});

describe("setClipFade", () => {
  it("clamps a fade to the clip duration", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipFade("c1", "in", 99);
    expect(useProjectStore.getState().clips[0].fadeIn).toBeLessThanOrEqual(4);
  });

  it("clamps a negative fade to zero", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipFade("c1", "out", -3);
    expect(useProjectStore.getState().clips[0].fadeOut).toBe(0);
  });
});

const effectsOf = (id: string) =>
  normalizeEffects(useProjectStore.getState().clips.find((c) => c.id === id)!.effects);

describe("setClipEffects", () => {
  it("merges a patch into existing effects", () => {
    useProjectStore.setState({ clips: [clip({ effects: '{"pitch":5}' })] });
    setClipEffects(["c1"], { reverb: { mix: 0.3, size: 2 } });
    expect(effectsOf("c1").pitch).toBe(5);
    expect(effectsOf("c1").reverb.mix).toBeCloseTo(0.3);
  });

  it("applies to every listed clip in one undo step", () => {
    useProjectStore.setState({ clips: [clip({ id: "a" }), clip({ id: "b", startTime: 20 })] });
    setClipEffects(["a", "b"], { pitch: -4 });
    expect(effectsOf("a").pitch).toBe(-4);
    expect(effectsOf("b").pitch).toBe(-4);
    useHistoryStore.getState().undo();
    expect(effectsOf("a").pitch).toBe(0);
    expect(effectsOf("b").pitch).toBe(0);
  });

  it("clamps an out-of-range patch", () => {
    useProjectStore.setState({ clips: [clip()] });
    setClipEffects(["c1"], { pitch: 999 });
    expect(effectsOf("c1").pitch).toBe(24);
  });
});

describe("setClipSpeed", () => {
  it("keeps the source window by rescaling the timeline duration", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipSpeed(["c1"], 2);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(2);
    expect(effectsOf("c1").speed).toBe(2);
  });

  it("lengthens the clip when slowing down", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipSpeed(["c1"], 0.5);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(8);
  });

  it("re-places a slowed clip that would now overlap its neighbour", () => {
    useProjectStore.setState({
      clips: [
        clip({ id: "a", startTime: 0, duration: 4 }),
        clip({ id: "b", startTime: 5, duration: 2 }),
      ],
    });
    setClipSpeed(["a"], 0.5); // a becomes 8 s and would run into b
    const clips = useProjectStore.getState().clips;
    const a = clips.find((c) => c.id === "a")!;
    const b = clips.find((c) => c.id === "b")!;
    const overlap =
      a.startTime < b.startTime + b.duration && b.startTime < a.startTime + a.duration;
    expect(overlap).toBe(false);
  });

  it("undoes duration, effects and position together", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipSpeed(["c1"], 0.5);
    useHistoryStore.getState().undo();
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(4);
    expect(effectsOf("c1").speed).toBe(1);
  });

  it("ignores a non-positive speed", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipSpeed(["c1"], 0);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(4);
  });
});

describe("resetClipEffects", () => {
  it("returns the clip to neutral and restores its unscaled duration", () => {
    useProjectStore.setState({ clips: [clip({ duration: 4 })] });
    setClipSpeed(["c1"], 0.5);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(8);
    resetClipEffects(["c1"]);
    expect(effectsOf("c1").speed).toBe(1);
    expect(useProjectStore.getState().clips[0].duration).toBeCloseTo(4);
  });
});

describe("normalizeClips", () => {
  it("sets the gain that lifts the measured peak to full scale", () => {
    useProjectStore.setState({ clips: [clip()] });
    normalizeClips(["c1"], () => 0.5);
    expect(useProjectStore.getState().clips[0].gain).toBeCloseTo(2);
  });

  it("leaves a silent clip untouched", () => {
    useProjectStore.setState({ clips: [clip({ gain: 0.8 })] });
    normalizeClips(["c1"], () => null);
    expect(useProjectStore.getState().clips[0].gain).toBeCloseTo(0.8);
  });
});
