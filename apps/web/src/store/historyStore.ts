import { create } from "zustand";

export interface Command {
  do: () => void;
  undo: () => void;
}

interface HistoryState {
  undoStack: Command[];
  redoStack: Command[];
  push: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  push: (cmd) => {
    cmd.do();
    set((s) => ({ undoStack: [...s.undoStack, cmd], redoStack: [] }));
  },
  undo: () => {
    const { undoStack } = get();
    const cmd = undoStack[undoStack.length - 1];
    if (!cmd) return;
    cmd.undo();
    set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, cmd] }));
  },
  redo: () => {
    const { redoStack } = get();
    const cmd = redoStack[redoStack.length - 1];
    if (!cmd) return;
    cmd.do();
    set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, cmd] }));
  },
}));
