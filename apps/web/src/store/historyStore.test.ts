import { describe, it, expect, beforeEach, vi } from "vitest";
import { useHistoryStore } from "./historyStore";

describe("historyStore", () => {
  beforeEach(() =>
    useHistoryStore.setState({
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
    })
  );

  it("push executes do() immediately", () => {
    const doFn = vi.fn();
    useHistoryStore.getState().push({ do: doFn, undo: vi.fn() });
    expect(doFn).toHaveBeenCalledTimes(1);
  });

  it("undo calls undo() and moves command to redo stack", () => {
    const undoFn = vi.fn();
    const redoFn = vi.fn();
    useHistoryStore.getState().push({ do: redoFn, undo: undoFn });
    useHistoryStore.getState().undo();
    expect(undoFn).toHaveBeenCalledTimes(1);
    useHistoryStore.getState().redo();
    expect(redoFn).toHaveBeenCalledTimes(2); // 1x push + 1x redo
  });

  it("canUndo and canRedo reflect stack state", () => {
    const state = useHistoryStore.getState();

    // Initially both false
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);

    // After push: canUndo true, canRedo false
    state.push({ do: vi.fn(), undo: vi.fn() });
    let current = useHistoryStore.getState();
    expect(current.canUndo).toBe(true);
    expect(current.canRedo).toBe(false);

    // After undo: canUndo false, canRedo true
    current.undo();
    current = useHistoryStore.getState();
    expect(current.canUndo).toBe(false);
    expect(current.canRedo).toBe(true);

    // After redo: canUndo true, canRedo false
    current.redo();
    current = useHistoryStore.getState();
    expect(current.canUndo).toBe(true);
    expect(current.canRedo).toBe(false);
  });
});
