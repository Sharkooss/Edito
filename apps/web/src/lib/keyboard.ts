import { useEffect } from "react";

interface Handlers {
  onPlayPause: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

function isTextInput(el: EventTarget | null): boolean {
  const tag = (el as HTMLElement)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

export function useKeyboardShortcuts(handlers: Handlers): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTextInput(e.target)) return;
      if (e.code === "Space") { e.preventDefault(); handlers.onPlayPause(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { handlers.onDelete(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { handlers.onUndo(); return; }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y")) {
        handlers.onRedo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
