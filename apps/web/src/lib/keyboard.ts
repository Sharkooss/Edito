import { useEffect, useRef } from "react";

interface Handlers {
  onPlayPause: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
}

function isTextInput(el: EventTarget | null): boolean {
  const tag = (el as HTMLElement)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

export function useKeyboardShortcuts(handlers: Handlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTextInput(e.target)) return;
      const current = handlersRef.current;
      if (e.code === "Space") { e.preventDefault(); current.onPlayPause(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { current.onDelete(); return; }
      if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey && !e.altKey) { current.onSplit(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { current.onUndo(); return; }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y")) {
        current.onRedo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
