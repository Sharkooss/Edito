import { useEffect, useRef } from "react";

interface Handlers {
  onPlayPause: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onSelectTool: () => void;
  onBladeTool: () => void;
  onDuplicate: () => void;
  onSelectAll: () => void;
}

function isTextInput(el: EventTarget | null): boolean {
  const target = el as HTMLElement | null;
  const tag = target?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable === true;
}

export function useKeyboardShortcuts(handlers: Handlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTextInput(e.target)) return;
      const current = handlersRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        current.onUndo();
        return;
      }
      if ((mod && key === "z" && e.shiftKey) || (mod && key === "y")) {
        e.preventDefault();
        current.onRedo();
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        current.onDuplicate();
        return;
      }
      if (mod && key === "a") {
        e.preventDefault();
        current.onSelectAll();
        return;
      }
      // Everything below is unmodified: Ctrl+S must stay the browser's.
      if (mod || e.altKey) return;

      if (e.code === "Space") {
        e.preventDefault();
        current.onPlayPause();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        current.onDelete();
        return;
      }
      if (key === "s") {
        current.onSplit();
        return;
      }
      if (key === "v") {
        current.onSelectTool();
        return;
      }
      if (key === "c") {
        current.onBladeTool();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
