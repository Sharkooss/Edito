import { describe, it, expect, beforeEach, vi } from "vitest";
import { useHistoryStore } from "./historyStore";

describe("historyStore", () => {
  beforeEach(() => useHistoryStore.setState({ undoStack: [], redoStack: [] }));

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
});
