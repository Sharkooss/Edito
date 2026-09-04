// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./keyboard";

describe("useKeyboardShortcuts", () => {
  it("calls onPlayPause on Space and onUndo on Ctrl+Z", () => {
    const onPlayPause = vi.fn();
    const onUndo = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({ onPlayPause, onDelete: vi.fn(), onUndo, onRedo: vi.fn(), onSplit: vi.fn() })
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("calls onSplit on S (without modifiers) but not on Ctrl+S", () => {
    const onSplit = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({ onPlayPause: vi.fn(), onDelete: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(), onSplit })
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    expect(onSplit).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    expect(onSplit).toHaveBeenCalledTimes(1);
  });
});
