import { describe, it, expect } from "vitest";
import {
  recordingReducer,
  armedTrackId,
  isCapturing,
  COUNT_IN_BEATS,
  type RecordingState,
} from "./recordingMachine";

const idle: RecordingState = { phase: "idle" };

describe("recordingReducer", () => {
  it("arms a track from idle", () => {
    expect(recordingReducer(idle, { type: "ARM", trackId: "t1" })).toEqual({
      phase: "armed",
      trackId: "t1",
    });
  });

  it("re-arming swaps the track — only one track may be armed", () => {
    const armed = recordingReducer(idle, { type: "ARM", trackId: "t1" });
    expect(recordingReducer(armed, { type: "ARM", trackId: "t2" })).toEqual({
      phase: "armed",
      trackId: "t2",
    });
  });

  it("ignores START_COUNT when nothing is armed", () => {
    expect(recordingReducer(idle, { type: "START_COUNT" })).toBe(idle);
  });

  it("counts in from COUNT_IN_BEATS and reaches zero", () => {
    let s = recordingReducer({ phase: "armed", trackId: "t1" }, { type: "START_COUNT" });
    expect(s).toEqual({ phase: "counting", trackId: "t1", remaining: COUNT_IN_BEATS });
    for (let i = 0; i < COUNT_IN_BEATS; i++) s = recordingReducer(s, { type: "TICK" });
    expect(s).toEqual({ phase: "counting", trackId: "t1", remaining: 0 });
  });

  it("CANCEL during the count returns to armed and produces no clip", () => {
    const counting = recordingReducer({ phase: "armed", trackId: "t1" }, { type: "START_COUNT" });
    expect(recordingReducer(counting, { type: "CANCEL" })).toEqual({ phase: "armed", trackId: "t1" });
  });

  it("BEGIN moves from counting to recording and records the playhead", () => {
    const counting: RecordingState = { phase: "counting", trackId: "t1", remaining: 0 };
    expect(recordingReducer(counting, { type: "BEGIN", startedAt: 4.5 })).toEqual({
      phase: "recording",
      trackId: "t1",
      startedAt: 4.5,
    });
  });

  it("refuses BEGIN from armed — the count-in cannot be skipped", () => {
    const armed: RecordingState = { phase: "armed", trackId: "t1" };
    expect(recordingReducer(armed, { type: "BEGIN", startedAt: 0 })).toBe(armed);
  });

  it("STOP returns to armed so a retake needs no re-arming", () => {
    const rec: RecordingState = { phase: "recording", trackId: "t1", startedAt: 2 };
    expect(recordingReducer(rec, { type: "STOP" })).toEqual({ phase: "armed", trackId: "t1" });
  });

  it("DISARM from any phase returns to idle", () => {
    const rec: RecordingState = { phase: "recording", trackId: "t1", startedAt: 2 };
    expect(recordingReducer(rec, { type: "DISARM" })).toEqual(idle);
  });
});

describe("helpers", () => {
  it("armedTrackId reports the track in every non-idle phase", () => {
    expect(armedTrackId(idle)).toBeNull();
    expect(armedTrackId({ phase: "armed", trackId: "t1" })).toBe("t1");
    expect(armedTrackId({ phase: "counting", trackId: "t1", remaining: 2 })).toBe("t1");
    expect(armedTrackId({ phase: "recording", trackId: "t1", startedAt: 0 })).toBe("t1");
  });

  it("isCapturing is true only while recording", () => {
    expect(isCapturing({ phase: "counting", trackId: "t1", remaining: 0 })).toBe(false);
    expect(isCapturing({ phase: "recording", trackId: "t1", startedAt: 0 })).toBe(true);
  });
});
