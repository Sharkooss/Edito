// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./keyboard";

describe("useKeyboardShortcuts", () => {
  it("calls onPlayPause on Space and onUndo on Ctrl+Z", () => {
    const onPlayPause = vi.fn();
    const onUndo = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onPlayPause, onDelete: vi.fn(), onUndo, onRedo: vi.fn() }));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
