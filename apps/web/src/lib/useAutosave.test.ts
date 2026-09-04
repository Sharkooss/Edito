// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProjectStore } from "../store/projectStore";
import * as client from "../api/client";
import { useAutosave } from "./useAutosave";

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useProjectStore.setState({ tracks: [], clips: [] } as any);
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
});
