// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./keyboard";

function setup() {
  const handlers = {
    onPlayPause: vi.fn(),
    onDelete: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSplit: vi.fn(),
    onSelectTool: vi.fn(),
    onBladeTool: vi.fn(),
    onDuplicate: vi.fn(),
    onSelectAll: vi.fn(),
  };
  renderHook(() => useKeyboardShortcuts(handlers));
  return handlers;
}

describe("useKeyboardShortcuts", () => {
  it("calls onPlayPause on Space and onUndo on Ctrl+Z", () => {
    const h = setup();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    expect(h.onPlayPause).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    expect(h.onUndo).toHaveBeenCalledTimes(1);
  });

  it("calls onSplit on S but leaves Ctrl+S to the browser", () => {
    const h = setup();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    expect(h.onSplit).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    expect(h.onSplit).toHaveBeenCalledTimes(1);
  });

  it("maps V to the select tool and C to the blade", () => {
    const h = setup();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "v" }));
    expect(h.onSelectTool).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
    expect(h.onBladeTool).toHaveBeenCalledTimes(1);
  });

  it("leaves Ctrl+C to the browser rather than switching tools", () => {
    const h = setup();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }));
    expect(h.onBladeTool).not.toHaveBeenCalled();
  });

  it("maps Ctrl+D to duplicate and Ctrl+A to select all", () => {
    const h = setup();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", ctrlKey: true }));
    expect(h.onDuplicate).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true }));
    expect(h.onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("ignores shortcuts while a text input has focus", () => {
    const h = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }));
    expect(h.onSplit).not.toHaveBeenCalled();
    input.remove();
  });
});
