// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useProjectStore } from "../store/projectStore";
import * as client from "../api/client";
import { useAutosave } from "./useAutosave";

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useProjectStore.setState({ tracks: [], clips: [] } as any);
  });

  // Without this, a hook rendered in one test stays mounted (and subscribed
  // to the shared projectStore) into the next test, causing every store
  // change to trigger saveProject twice (once per still-mounted instance).
  afterEach(() => {
    cleanup();
  });

  it("calls saveProject after the debounce delay following a change", () => {
    const spy = vi.spyOn(client, "saveProject").mockResolvedValue();
    renderHook(() => useAutosave(1000));
    act(() => {
      useProjectStore.getState().addTrack({ id: "t1", orderIndex: 0, name: "T", color: "", volume: 1, pan: 0, muted: false, soloed: false });
    });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(spy).toHaveBeenCalledWith({ tracks: expect.any(Array), clips: expect.any(Array) });
    vi.useRealTimers();
  });

  it("coalesces rapid successive changes within the debounce window into a single save", () => {
    const spy = vi.spyOn(client, "saveProject").mockResolvedValue();
    renderHook(() => useAutosave(1000));

    act(() => {
      useProjectStore.getState().addTrack({ id: "t1", orderIndex: 0, name: "T1", color: "", volume: 1, pan: 0, muted: false, soloed: false });
    });
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      useProjectStore.getState().addTrack({ id: "t2", orderIndex: 1, name: "T2", color: "", volume: 1, pan: 0, muted: false, soloed: false });
    });
    act(() => { vi.advanceTimersByTime(300); });

    act(() => {
      useProjectStore.getState().addTrack({ id: "t3", orderIndex: 2, name: "T3", color: "", volume: 1, pan: 0, muted: false, soloed: false });
    });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].tracks).toHaveLength(3);
    vi.useRealTimers();
  });
});
