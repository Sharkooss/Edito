// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProjectStore } from "../store/projectStore";
import { useEngineSync } from "./useEngineSync";

describe("useEngineSync", () => {
  beforeEach(() => useProjectStore.setState({ tracks: [] } as any));

  it("mutes non-soloed tracks when one track is soloed", () => {
    useProjectStore.setState({
      tracks: [
        { id: "t1", orderIndex: 0, name: "A", color: "", volume: 1, pan: 0, muted: false, soloed: true },
        { id: "t2", orderIndex: 1, name: "B", color: "", volume: 1, pan: 0, muted: false, soloed: false },
      ],
    } as any);
    const engine = { setTrackVolume: vi.fn(), setTrackPan: vi.fn(), setTrackMuted: vi.fn() } as any;
    renderHook(() => useEngineSync(engine));
    expect(engine.setTrackMuted).toHaveBeenCalledWith("t1", false);
    expect(engine.setTrackMuted).toHaveBeenCalledWith("t2", true);
  });
});
